// This is version 5 of SPARE (Static Page AJAX for Replacing Elements), a JavaScript object.

// Forget this version -- pre-ES6 browsers are just about extinct now.

// Argh, in Firefox XHR tends to return old cached results even if a full refresh saw something newer!
// Is fetch going to do the same thing?  Note -- full refresh sets Cache-control: no-cache on the parent page,
// but I don't think we have any way to detect that.  Cache-control: etag is unofficial?
// What does Chrome do differently?  it sends if-modified-since and if-none-match headers, absent in firefox.
// .........Wait, has Firefox now fixed itself so the bug doesn't happen anymore?

// TODO: try out unhandledrejection event for a way to have pop failure do a reload.
//       send a beforePopState event, and check it for cancellation
//       TEST multi-target popstate support.  SET UP TESTS WITH NESTING.
//           See G spreadsheet.  Run through cases, see what more is needed besides de-currenting inners.
//       figure out some way to opt for full reload in major cases.
//       DEFAULT SPAREPopStateFailed handler to reload page.
/*   CASES FOR NESTED TARGETS -- check each for back and fwd by steps, and back/fwd all at once:
A inside older B: 
A, then newer B outside: 
*/
// FUTURE FEATURE TO CONSIDER: optional finer control over restoring scroll position.


/* Three-clause BSD-like license with simplified disclaimer and minification allowance:

"SPARE" is Copyright (c) 2015-2026 Paul M. Kienitz
All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

    Redistributions of source code must retain the above copyright notice
    and this list of conditions, including the following disclaimer:
    This software is provided "as is" without warranty of any kind.

    Redistributions in binary form must reproduce the above copyright
    notice and this list of conditions in the documentation and/or other
    materials provided with the distribution.  If the binary is incorporated
    into a work by URI reference, then this license may be referenced from
    the binary (e.g. minified script) via URI, provided such reference is
    immediately legible.

    The name of Paul Kienitz may not be used to endorse or promote products
    derived from this software without specific prior written permission.
*/


// In this version we move on from legacy APIs.  We replace XHR with fetch, and return a Promise.
// Most browsers only started supporting fetch in 2015-16, so older ones will not work without polyfills.
// IE 11 is the only legacy browser where this was tested with polyfills.

// Minify with https://www.digitalocean.com/community/tools/minify  (activate Eval and Safari10 options)


"use strict";              // since there are polyfills for Promise and fetch, let's keep the syntax ES3-compatible (no lambdas)
var SPARE = function ()	   // IIFE returns the SPARE singleton object, or null if unsupported
{
    // private properties -- for thread safety, these are read-only after being set
    var initialURL;
    var initialTitle;


    // private functions

    var makeError = function (exception, url, errorNumber, statusText)
    {
        if (errorNumber > 0 && !statusText)
            statusText = "HTTP status " + errorNumber;     // for http2 where statusText is absent (but some browsers may fill it in)
        if (!exception)
        {
            if (errorNumber)
                exception = new Error(errorNumber + " " + statusText);
            else
                exception = new Error(statusText);
        }
        else if (typeof exception === "string")            // for validation errors etc
            exception = new Error(exception);
        exception.httpStatus = errorNumber;
        exception.httpMessage = statusText;
        exception.contentURL = url;                 // so catch() handler can easily fall back to navigating there
        exception.isSPARE = true;                   // for unhandledrejection handlers etc that might get nonspare errors
        return exception;
    };


    var validate = function(target, contentURL)    // returns target DOM element if it doesn't throw
    {
        if (!contentURL || typeof contentURL !== "string")      // allow URL object?
            throw makeError("SPARE - contentURL string is required", contentURL);
        if (target instanceof HTMLElement)
            return target;
        if (!target)
            throw makeError("SPARE - target ID or object is required", contentURL);
        var victim = document.getElementById(target);
        if (!victim)
            throw makeError("SPARE could not find target element '" + target + "' in " + contentURL, contentURL);
        return victim;
    };


    var normalizeTimeout = function(timeout, timeout2)
    {
        if (typeof timeout !== "number")
            timeout = timeout2;               // allow decimal string?
        if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 3600)
            return undefined;
        else
            return timeout;
    };


    var replaceContentImpl = function (victim, contentURL, contentElementID, timeout, postData)
    {
        var retriever = new Retriever(contentURL, postData, timeout);
        var extractor = new Extractor(victim, contentURL, contentElementID);
        return new Promise(retriever.start).then(extractor.extractAndUse);
    };


    // private internal classes -- a lot of methods need preset context so they can be used as thens

    var Change = function (targetID, contentURL, contentElementID, contextData, postData, containedBy /*, index, timestamp*/)
    {
        // Represents one instance of a page element which has been replaced by content from an HTTP request.
        // Tries to keep track of which other previous instances enclose the current one.
        // XXX TODO: if postData instanceof URLSearchParams, postData = postData.toString?
        this.targetID         = targetID;
        this.contentURL       = contentURL;
        this.contentElementID = contentElementID || "";
        this.contextData      = contextData;
        this.postData         = postData;                   // MUST be serializable! and serialization is stricter than you think
        this.containedBy      = containedBy      || null;
        //this.index            = index            || Change.saved.length + 1;
        //this.timestamp        = timestamp        || Date.now();
    }
    // since this needs to be serialized, all the methods are static, and so of course is the collection they get stored in:
    Change.saved = new Map();
    Change.currentFor = function (id, arrayOfChanges)
    {
        return (arrayOfChanges || Change.saved.values()).find(function (c) { return c.targetID === id; });
    };
    Change.makeCurrent = function (up)
    {
        Change.saved.set(up.targetID, up);                              // keep only newest change for any one ID
        var otherIDs = Array.from(Change.saved.keys(), function (c) { return '#' + c.targetID; });
        var container = otherIDs.length && document.getElementById(up.targetID).closest(otherIDs.join(', '));
        up.containedBy = container ? container.id : null;
    };
    Change.needsRefresh = function (up)       // give this one popstate Change to compare with saved ones
    {
        var curr = Change.currentFor(up.targetID) || { contentURL: "", contentElementID: "" };
        return (up.contentURL || initialURL) !== curr.contentURL ||
               (up.contentElementID || "") !== curr.contentElementID;
    };
    Change.needToRestore = function (downs)   // give this the full popstate Change array to find what saved ones are absent from it
    {
        return Change.saved.filter(function (s) { return s.current && !Change.currentFor(s.targetID, downs); })
                           .map(function (c) { return new Change(c.targetID, "", c.targetID, null, postData /*, -c.index, -c.timestamp*/); });
        // XXX WATCH OUT: rolling back a nested target to original MAY FAIL whether before or after rolling back the one enclosing it?
    };
    //Change.order = function (a, b)
    //{
    //    return a.index - b.index || a.timestamp - b.timestamp;
    //};
    Change.toString = function (up)
    {
        return /*up.index + ": " + up.targetID +*/ " -> " + up.contentURL + (up.contentElementID ? '#' + up.contentElementID : "");
    };        // class Change


    var HistoryAdder = function (targetID, contentURL, contentElementID, newTitle, pretendURL, contextData, postData)
    {
        this.add = function (val)
        {
            var newUpdate = new Change(targetID, contentURL, contentElementID, postData);
            Change.makeCurrent(newUpdate);
            var changesToSave = Array.from(Change.saved.values());      // convert to dumb serializable form
            var state = { targetID:         targetID,                   // selector for currentFor
                          newTitle:         newTitle || null,
                          pretendURL:       pretendURL || null,
                          contextData:      contextData || null,        // must be serializable!
                          startTitle:       initialTitle || null,
                          startURL:         initialURL || null,
                          changes:          changesToSave
                          // add scroll position, to be used optionally?  (Chrome might benefit, Firefox is doing fine on its own)
            };
            history.pushState(state, "", pretendURL || contentURL);
            if (newTitle)
                document.title = newTitle;
            return val;
        };
        this.checkBehind = function ()
        {
            var hindstate = { targetID:    targetID,
                              startTitle:  initialTitle || null,
                              startURL:    initialURL || null,
                              contextData: contextData || null          // must be serializable!
                              // add scroll position, to be used optionally?  (Chrome might benefit, Firefox is doing fine on its own)
            };
            if (history.state)
            {
                var t = history.state;
                Object.assign(t, hindstate);                            // merge the fields!
                hindstate = t;
            }
            history.replaceState(hindstate, "");
        };
    };      // class HistoryAdder
//    HistoryAdder.destination = function (state)     // static function
//    {
//        return "contentURL" in state ? state.pretendURL || state.contentURL : state.startURL;
//    };


/* experimental feature:
    var HashFinder = function(href)
    {
        var hash = new URL(href).hash;
        if (hash && hash.charAt(0) === "#")
            hash = hash.substring(1);
        if (!hash)
            this.find = function () { };
        else
            this.find = function ()
            {
                var ankh = document.getElementById(hash);
                if (ankh)
                {
                    var arec = ankh.getBoundingClientRect();    // coordinates are relative to viewport
                    if (arec.top < 0 || arec.bottom > document.documentElement.clientHeight)
                        ankh.scrollIntoView({ block: "start", behavior: "instant" });
                }
            }
    };
*/


    var EventFirer = function (simulateDCL, contextData, poppingState)
    {
        var make = function (name)
        {
            var event = new Event(name, { bubbles: true });
            event.contextData = contextData;
            if (poppingState)
                event.state = poppingState;
            return event;
        };
        // methods
        this.loaded = function (val)
        {
            var event = make(simulateDCL ? "DOMContentLoaded" : "SPAREContentLoaded");
            document.dispatchEvent(event);
            return val;
        };
        this.failed = function (error)
        {
            var event = make("SPAREPopStateFailed");
            event.reason = error;
            document.dispatchEvent(event);
            // subsequent then() will receive undefined; no error is thrown to trigger catch()
        }
    };      // class EventFirer


    var Retriever = function (contentURL, postData, timeout)
    {
        // private members -- per-transaction state is kept here
        var aborted = false;
        var timer = null;
        var fetchAborter = null;
        var callerResolve, callerReject;

        // our one internally public method, which is not actually called as a method and is not allowed to use "this",
        // and can't just return a promise because we need an external reject for timeouts to work
        this.start = function (resolve, reject)
        {
            var params;
            if (typeof postData === "string")
                params = { method:  "POST",
                           headers: { "Content-type": "application/x-www-form-urlencoded" },
                           body:    postData };
            else if (postData !== null && typeof postData === "object")
                params = { method:  "POST",
                           body:    postData };     // in supported cases the content-type header is set automatically
            else
                params = { method: "GET" };

            if (timeout && canUseAbortController)
            {
                fetchAborter = new AbortController();
                params.signal = fetchAborter.signal;
            }
            if (timeout)
                timer = setTimeout(abortBecauseTimeout, timeout * 1000);

            callerResolve = resolve;
            callerReject = reject;
            fetch(contentURL, params).then(fetchComplete, fetchError);
        };

        // private methods, which again are not actually called as methods and can't use "this"
        var abortBecauseTimeout = function ()
        {
            aborted = true;
            if (fetchAborter)
                fetchAborter.abort();       // should halt HTTP session; in aborterless browsers, it continues silently in background
            fail(408, "SPARE time limit exceeded");
        };

        var fetchComplete = function (response)
        {
            if (!aborted)
            {
                clearTimeout(timer);
                if (response.status == 200 || response.status == 201 || response.status == 203)
                    response.text().then(callerResolve, fetchError);
                else
                    fail(response.status, response.statusText);
            }
        };

        var fetchError = function (reason)
        {
            if (!aborted)                    // abort calls downloadFailed immediately, so don't do anything here in that case
            {
                clearTimeout(timer);
                if ("name" in reason && "message" in reason)
                    fail(-2, "SPARE fetch failed with exception " + reason.name + ": " + reason.message, reason);
                else                         // shouldn't happen, I hope
                    fail(-4, "SPARE fetch failed with reason " + reason);
            }
        };

        var fail = function (statusNumber, statusText, exception)
        {
            callerReject(makeError(exception, contentURL, statusNumber, statusText));
        };
    };      // class Retriever


    var Extractor = function (victim, contentURL /*for error reporting only*/, contentElementID)
    {
        this.extractAndUse = function (responseText)
        {
            var err;
            try
            {
                var sideDocument = document.implementation.createHTMLDocument("");
                var newContentDomParent = sideDocument.documentElement;
                newContentDomParent.innerHTML = responseText;
                if (!contentElementID)
                {
                    // When given a fragment to parse, documentElement generally wraps it in a simulated body tag.
                    var body = newContentDomParent.getElementsByTagName("body");
                    newContentDomParent = body[0] || newContentDomParent;
                }
                else           // find the named element
                {
                    newContentDomParent = sideDocument.getElementById(contentElementID);
                    if (!newContentDomParent)
                        err = "SPARE could not find element '" + contentElementID + "' in content downloaded from " + contentURL;
                }

                if (!err)
                {
                    var placeholder = document.createElement(victim.tagName);
                    victim.parentNode.replaceChild(placeholder, victim);		// do the loops while detached from the dom, for performance
                    while (victim.lastChild)
                        victim.removeChild(victim.lastChild);
                    while (newContentDomParent.firstChild)
                        victim.appendChild(newContentDomParent.firstChild);
                    placeholder.parentNode.replaceChild(victim, placeholder);
                    return victim;
                }
            }
            catch (ex)    // other than the -1 case, exceptions here shouldn't happen
            {
                throw makeError(ex, contentURL, -3, "SPARE content update failed with exception " + ex.name + ": " + ex.message);
            }
            if (err)
                throw makeError(null, -1, err);
        };
    };      // class Extractor



    // load-time initialization -- validate that we have browser support, and save initial location
    var supported = "fetch" in window && "Response" in window && "Promise" in window && "catch" in Promise.resolve(0) &&
                    "Map" in window && "values" in new Map() && "closest" in HTMLElement.prototype;
                    // some polyfills don't set Promise.prototype and that's ok -- likewise for Map.prototype
    // minimum browser versions without polyfills are from 2015-17: Edge 15, Firefox 39, Chrome 42, Safari 10.1
    var canUseAbortController = "AbortController" in window;
    // AbortController support is added 2017-19: Edge 16, Firefox 57, Chrome 66, Safari 12.1

    if (!initialURL)
    {
        initialURL = location.href;       // XXX preserve anchor but trim when comparing
        initialTitle = document.title;
    }



    // our IIFE result: create the SPARE object accessed by the caller, or set it null if the browser is lacking
    var spare = !supported ? null :
    {
        // global defaulting values settable by the caller
        timeout: undefined,
        simulateDCL: false,


        // Our core method - see https://github.com/paulkienitz/SPARE/blob/master/README.md for how to use.
        // If you have ES8, going "await SPARE.replaceContent(...)" is an alternative to using .then().
        replaceContent: function (target /*ID or DOM element*/, contentURL, contentElementID, timeout, postData)
        {
            try
            {
                var victim = validate(target, contentURL);      // throws (which Promise turns into rejection) if no victim
                if (Number.isFinite(postData) && arguments.length === 4)
                    timeout = postData, postData = undefined;   // we allow timeout to use either param position polymorphically
                timeout = normalizeTimeout(timeout, SPARE.timeout);
                return replaceContentImpl(victim, contentURL, contentElementID, timeout, postData);
            }
            catch (ex)
            {
                return Promise.reject(ex);
            }
        },


        // Like replaceContent but also sets history and title.  Root-relative URLs are recommended,
        // because cross-domain contentURL values will generally fail due to browser security.
        // Both contextData and postData must be serializable into a popState context.
        // THIS MEANS that postData MUST NOT be a FormData!
        simulateNavigation: function (target, contentURL, contentElementID, newTitle, pretendURL, timeout, postData, contextData)
        {
            try
            {
                var victim = validate(target, contentURL);     // throws (which Promise turns into rejection) if no victim
                // we polymorphically allow an options param in place of newTitle:  // or pretendURL
                var op = arguments[arguments.length - 1];
                if (arguments.length /* >= 4 && arguments.length <= 5 */ === 4 && typeof op === "object")
                {
                    // if (arguments.length < 5)
                    newTitle    = op.newTitle;
                    pretendURL  = op.pretendURL;
                    timeout     = op.timeout;
                    postData    = op.postData;
                    contextData = op.contextData;
                }
                timeout = normalizeTimeout(timeout, SPARE.timeout);

                var eventFirer = new EventFirer(SPARE.simulateDCL, contextData);
                var historyAdder = new HistoryAdder(victim.id, contentURL, contentElementID, newTitle, pretendURL, contextData, postData);
                historyAdder.checkBehind();
                return replaceContentImpl(victim, contentURL, contentElementID, timeout, postData)
                           .then(historyAdder.add)
                           .then(eventFirer.loaded);
            }
            catch (ex)
            {
                return Promise.reject(ex);
            }
        },


        // our handler for the popstate event, already attached
        onPopStateRestore: function (event)
        {
            var retriever, eventFirer;
            if (typeof event.state === "object" && "targetID" in event.state && "startURL" in event.state)
            {
                // XXX TODO: fire a 'SPAREbeforePopStateRestore' event, check for cancellation
                var victim = document.getElementById(event.state.targetID);
                eventFirer = new EventFirer(SPARE.simulateDCL, event.state.contextData, event.state);

                // XXX Is this check unnecessary??
                if (!victim || location.href != (event.state.pretendURL || event.state.startURL))   // shouldn't happen
                {
                    console.log("=== SPARE had to reload initial page because assumed URL does not match current location, or target is missing." +
                                "\nPretend URL:  " + event.state.pretendURL + "\nInitial URL:  " + event.state.startURL +
                                "\n*Actual URL:  " + location.href + "\n- Target ID:  " + event.state.targetID);
                    location.replace(event.state.startURL);
                    return false;
                }
                else if ("changes" in event.state)   // undo or redo simulated navigations
                {
                    var toUpdate = event.state.changes.filter(Change.needsRefresh)
                                                      .concat(Change.needToRestore(event.state.changes))
                                                      .sort(Change.order);
//alert(toUpdate.map(Change.toString).join('\n') || "no updates needed?");
                    var promises = toUpdate.map(function (u)
                    {
                        var riever = new Retriever(u.contentURL || event.state.startURL, u.postData, SPARE.timeout, u.contentElementID);
                        return new Promise(riever.start);
                    });
                    /* var hashfinder = new HashFinder(location.href); */
                    // those downloads happen in parallel but the extractions must be done in order
                    Promise.all(promises).then(function (texts)
                    {
                        for (var i in toUpdate)
                        {
                            var victim = document.getElementById(toUpdate[i].targetID);
                            var tractor = new Extractor(victim, toUpdate[i].contentURL || event.state.startURL, toUpdate[i].contentElementID);
                            tractor.extractAndUse(texts[i]);
                            Change.makeCurrent(toUpdate[i]);
                        }
                    })/*.then(hashfinder.find)*/.then(eventFirer.loaded, eventFirer.failed);
                }
            }
        }

//     ,  popDestination: function (event)
//        {
//            return typeof event === "object" && typeof event.state === "object"
//                   ? HistoryAdder.destination(event.state) : undefined;
//            // redundant?  assert that at SPAREContentLoaded time, this return value equals location.href?
//        }

    };
    return spare;      // the object literal that will be assigned to the global SPARE singleton
}();

// This is needed right away even if we haven't pushed any state yet,
// for when someone returns to this site from outside via the back button.
if (SPARE)
    window.addEventListener("popstate", SPARE.onPopStateRestore);
