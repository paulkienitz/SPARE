// This is version 5 of SPARE (Static Page AJAX for Replacing Elements), a JavaScript object.

// TODO: try out unhandledrejection event for a way to have pop failure do a reload.
//       maybe send a beforePopState event, and check it for cancellation?
// TO ADD: support for multiple and nested targets in onPopStateRestore (in progress as spare05X).
// FUTURE FEATURE TO CONSIDER: optional finer control over restoring scroll position.


/* Three-clause BSD-like license with simplified disclaimer and minification allowance:

"SPARE" is Copyright (c) 2015-2023 Paul M. Kienitz
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

// (This "single" version is the one that seems to fully replace SPARE 4 without adding any
// new functionality for multi-target back button support.  It moves forward from the stable
// versions tested in Rockets of Today, incorporating parts of future multi-target support.)

// Minified with https://www.digitalocean.com/community/tools/minify  (activate Eval and Safari10 options)


"use strict";              // since there are polyfills for Promise and fetch, let's keep the syntax ES3-compatible (no lambdas)
var SPARE = function ()	   // IIFE returns the SPARE singleton object, or null if unsupported
{
    // private properties -- for thread safety, these are read-only after being set
    var initialURL;
    var initialTitle;


    // private functions

    var makeError = function (exception, url, errorNumber, statusText)
    {
        if (exception && typeof exception === "string")     // for validation errors etc with only two params
            exception = new Error(exception);
        if (errorNumber > 0 && !statusText)
            statusText = "HTTP status " + errorNumber;      // for http2 where statusText is absent (but some browsers may fill it in)
        if (!exception)
        {
            if (errorNumber)
                exception = new Error(errorNumber + " " + statusText);
            else
                exception = new Error(statusText);
        }
        exception.httpStatus = errorNumber;
        exception.httpMessage = statusText;
        exception.contentURL = url;                 // so catch() handler can easily fall back to navigating there
        exception.isSPARE = true;                   // for unhandledrejection handlers etc that might get nonspare errors
        return exception;
    };


    var validate = function(target, contentURL)    // returns target DOM element if it doesn't throw
    {
        if (!contentURL || typeof contentURL !== "string")      // allow URL object?
            throw makeError("SPARE - contentURL is required", contentURL);
        if (target instanceof HTMLElement)
            return target;
        if (!target)
            throw makeError("SPARE - target is required", contentURL);
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


    var replaceContentImpl = function (victim, contentURL, contentElementID, postData, timeout)
    {
        var retriever = new Retriever(contentURL, postData, timeout);
        var extractor = new Extractor(victim, contentURL, contentElementID);
        return new Promise(retriever.start).then(extractor.extractAndUse);
    };


    // private internal classes -- a lot of methods need preset context so they can be used as thens

    var Change = function (targetID, contentURL, contentElementID, postData, containedBy, index, timestamp)
    {
        // Represents one instance of a page element which has been replaced by content from an HTTP request.
        // Tries to keep track of which other previous instances enclose the current one.
        // XXX TODO: if postData instanceof URLSearchParams, postData = postData.toString?
        this.targetID         = targetID;
        this.contentURL       = contentURL;
        this.contentElementID = contentElementID || "";
        this.postData         = postData;                   // must be serializable! and serialization is stricter than you think
        this.containedBy      = containedBy      || null;
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
    };              // class Change


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
        replaceContent: function (target /*ID or DOM element*/, contentURL, contentElementID, postData, timeout)
        {
            try
            {
                var victim = validate(target, contentURL);      // throws (which we turn into rejection) if no victim
                if (Number.isFinite(postData) && arguments.length === 4)
                    timeout = postData, postData = undefined;   // we allow timeout to use either param position polymorphically
                timeout = normalizeTimeout(timeout, SPARE.timeout);
                return replaceContentImpl(victim, contentURL, contentElementID, postData, timeout);
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
        simulateNavigation: function (target, contentURL, contentElementID, newTitle, pretendURL, contextData, postData, timeout)
        {
            try
            {
                var victim = validate(target, contentURL);     // throws (which we turn into rejection) if no victim
                // we polymorphically allow an options param in place of newTitle or pretendURL
                var op = arguments[arguments.length - 1];
                // XXX THIS IS STUPID?  Consider dropping contextData entirely.
                if (arguments.length >= 4 && arguments.length <= 6 && typeof op === "object" && op)
                {
                    timeout     = op.timeout;
                    postData    = op.postData;
                    contextData = op.contextData;
                    pretendURL  = op.pretendURL;
                    if (arguments.length < 5)
                        newTitle = op.newTitle;
                    if (arguments.length < 6)
                        pretendURL = op.pretendURL;
                }
                else if (arguments.length >= 4 && arguments.length <= 7 && Number.isFinite(op))
                {
                    timeout = op;
                    switch (arguments.length)
                    {
                        case 4: newTitle = undefined; break;
                        case 5: pretendURL = undefined; break;
                        case 6: contextData = undefined; break;
                        case 7: postData = undefined; break;
                    }
                }
                timeout = normalizeTimeout(timeout, SPARE.timeout);

                var eventFirer = new EventFirer(SPARE.simulateDCL, contextData);
                var historyAdder = new HistoryAdder(victim.id, contentURL, contentElementID, newTitle, pretendURL, contextData, postData);
                historyAdder.checkBehind();
                return replaceContentImpl(victim, contentURL, contentElementID, postData, timeout)
                           .then(historyAdder.add)
                           .then(eventFirer.loaded);
            }
            catch (ex)
            {
                return Promise.reject(ex);
            }
        },


        // our handler for the popstate event, attached on first call of simulateNavigation
        onPopStateRestore: function (event)
        {
            var url, id, postage;
            var eventFirer;
            if (typeof event.state === "object" && "targetID" in event.state && "startURL" in event.state)
            {
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
                else if ("changes" in event.state)              // we are recreating a simulated non-original page state
                {
                    // temporary transitional version: use current change for single restoration only
                    var ch = Change.currentFor(event.state.targetID, event.state.changes);
                    url = ch.contentURL;
                    id = ch.contentElementID;
                    postage = ch.postData;
                    document.title = event.state.newTitle;      // pretendURL is already restored
                }
                else                                            // we are returning to a page state as originally loaded
                {
                    url = event.state.startURL;
                    id = event.state.targetID;
                    document.title = event.state.startTitle;
                }
                /* var hashfinder = new HashFinder(location.href); */
            }
            if (url)
                return replaceContentImpl(victim, url, id, postage, SPARE.timeout)
                               /*.then(hashfinder.find)*/
                               .then(eventFirer.loaded, eventFirer.failed);
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
