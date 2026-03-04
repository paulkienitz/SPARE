// This is version 5 of SPARE (Static Page AJAX for Replacing Elements), a JavaScript module.

// Argh, in Firefox XHR tends to return old cached results even if a full refresh saw something newer!
// Is fetch going to do the same thing?  Note -- full refresh sets Cache-control: no-cache on the parent page,
// but I don't think we have any way to detect that.  Cache-control: etag is unofficial?
// What does Chrome do differently?  it sends if-modified-since and if-none-match headers, absent in firefox.
// .........Wait, has Firefox now fixed itself so the bug doesn't happen anymore?

// TODO: try out unhandledrejection event for a way to have pop failure do a reload.
//       send a beforePopState event, and check it for cancellation?
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

// In this version we make use of the very latest ECMAScript features, such as private class members.
// Browsers have to be completely up to date for this to work, like 2022.

// Minify with https://www.digitalocean.com/community/tools/minify  (activate Eval and Safari10 options)


export var SPARE = function ()	   // IIFE returns the SPARE singleton object, which is our export
{
    // private read-only capability flag
    let canUseAbortController = "AbortController" in window;

    // private properties -- for thread safety, these are read-only after being set
    let initialURL;
    let initialTitle;


    // private functions
    function makeError(exception, url, errorNumber, statusText)
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
    }


    function validate(target, contentURL)    // returns target DOM element if it doesn't throw
    {
        if (!contentURL || typeof contentURL !== "string")      // allow URL object?
            throw makeError("SPARE - contentURL string is required", contentURL);
        if (target instanceof HTMLElement)
            return target;
        if (!target)
            throw makeError("SPARE - target ID or object is required", contentURL);
        let victim = document.getElementById(target);
        if (!victim)
            throw makeError(`SPARE could not find target element '${target} in ${contentURL}`, contentURL);
        return victim;
    }


    function normalizeTimeout(timeout, timeout2)
    {
        if (typeof timeout !== "number")
            timeout = timeout2;               // allow decimal string?
        if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 3600)
            return undefined;
        else
            return timeout;
    }


    // XXX MOVE BELOW CLASSES because they don't hoist
    function replaceContentImpl(victim, contentURL, contentElementID, timeout, postData)
    {
        let retriever = new Retriever(contentURL, postData, timeout);
        let extractor = new Extractor(victim, contentURL, contentElementID);
        return new Promise(retriever.start).then(extractor.extractAndUse);
    }


    // private internal classes

    // XXX Will this be serializable?
    class Change
    {
        targetID;
        contentURL;
        contentElementID;
        contextData;       // must be serializable
        postData;          // must be serializable — better stick to strings only?
        containedBy;
        index;
        timestamp;
        current;

        constructor(targetID, contentURL, contentElementID, contextData, postData, containedBy, index, timestamp)
        {
            // Represents one instance of a page element which has been replaced by content from an HTTP request.
            // Tries to keep track of which other previous instances enclose the current one.
            // XXX TODO: if postData instanceof URLSearchParams, postData = postData.toString?
            this.targetID         = targetID;
            this.contentURL       = contentURL;
            this.contentElementID = contentElementID || "";
            this.contextData      = contextData;
            this.postData         = postData;
            this.containedBy      = containedBy      || null;
            this.index            = index            || Change.saved.length + 1;
            this.timestamp        = timestamp        || Date.now();
            this.current          = false;     // XXX  drop this field if we delete old records instead of setting this false
        }

        // since this needs to be serialized, all the methods are static, and so of course is the collection they get stored in:
        static saved = [];

        static currentFor(id, arrayOfChanges)
        {
            return (arrayOfChanges ?? this.saved).filter(s => s.targetID === id && s.current)[0];
        }

        static makeCurrent(up)
        {
            let old = this.currentFor(up.targetID);
            if (old)
            {
                old.current = false;    // delete old entirely?  maybe not if nested?
                this.saved.filter(s => s.containedBy === old.targetID)
                          .forEach(c => c.containedBy = null);
            }
            if (up.contentURL)          // if currentURL is blank, record is removed rather than replaced
            {
                up.current = true;
                let otherIDs = this.saved.filter(s => s.current && s.targetID !== up.targetID)
                                         .map(i => '#' + i.targetID);
                let container = otherIDs.length && document.getElementById(up.targetID).closest(otherIDs.join(', '));
                up.containedBy = container?.targetID;
                this.saved.push(up);
            }
        }

        static needsRefresh(up)       // give this one popstate Change to compare with saved ones
        {
            let curr = this.currentFor(up.targetID) ?? { contentURL: "", contentElementID: "" };
            return (up.contentURL || initialURL) !== curr.contentURL ||
                   (up.contentElementID || "") !== curr.contentElementID;
        }

        static needToRestore(downs)   // give this the full popstate Change array to find what saved ones are absent from it
        {
            return this.saved.filter(s => s.current && !this.currentFor(s.targetID, downs))
                             .map(c => new Change(c.targetID, "", c.targetID, null, postData, -c.index, -c.timestamp));
            // XXX WATCH OUT: rolling back a nested target to original MAY FAIL whether before or after rolling back the one enclosing it?
        }

        static order(a, b)
        {
            return a.index - b.index || a.timestamp - b.timestamp;
        }

        static toString(up)
        {
            return up.index + ": " + up.targetID + " -> " + up.contentURL + (up.contentElementID ? '#' + up.contentElementID : "");
        }
    }         // class Change


    class HistoryAdder
    {
        #state;
        #contentURL;
        #contentElementID;
        #newTitle;
        #pretendURL;
        #contextData;
        #postData;
        constructor(targetID, contentURL, contentElementID, newTitle, pretendURL, contextData, postData)
        {
            #state = { targetID:    targetID,
                       startTitle:  initialTitle || null,
                       startURL:    initialURL || null };
            #contentURL       = contentURL;
            #contentElementID = contentElementID;
            #newTitle         = newTitle;
            #pretendURL       = pretendURL;
            #contextData      = contextData;
            #postData         = postData;
        }

        add(val)
        {
            let newUpdate = new Change(#state.targetID, #contentURL, #contentElementID, #contextData, #postData);
            Change.makeCurrent(newUpdate);
            let state = Object.assign({ changes: Change.saved.filter(s => s.current).sort(Change.order) }, #state);
            history.pushState(state, "", pretendURL || contentURL);
            if (newTitle)
                document.title = newTitle;
            return val;
        }

        checkBehind()
        {
            if (!history.state)
                history.replaceState(Object.assign({ changes: [] }, #state), "");
        }
    }       // class HistoryAdder


    class EventFirer
    {
        #simulateDCL;
        #popping;
        #contextData;
        constructor(simulateDCL, popping, contextDate)
        {
            #simulateDCL = simulateDCL;
            #popping     = popping;
            #contextData = contextData;
        }

        #make(error)
        {
            let event = new Event(error ? "SPAREPopStateFailed" : #simulateDCL ? "DOMContentLoaded" : "SPAREContentLoaded", { bubbles: true });
            event.contextData = #contextData;
            event.pop = #popping;
            if (error)
                event.reason = error;
            return event;
        }

        loaded(val)
        {
            document.dispatchEvent(make());
            return val;
        }

        failed(error)
        {
            document.dispatchEvent(make(error));
            // any subsequent catch will not be invoked; subsequent then will receive undefined
        }
    }       // class EventFirer


    // XXX DECLASSIFY -- calling methods as regular functions will not work
    class Retriever
    {
        #aborted = false;
        #timer = null;
        #fetchAborter = null;

        #resolve;
        #reject;

        #contentURL;
        #contentEkementID;
        #postData;
        #timeout;

        constructor(contentURL, postData, timeout, contentElementID)
        {
            #contentURL       = contentURL;
            #contentElementID = contentElementID;
            #postData         = postData;
            #timeout          = timeout;
        }

        // our one public method, which is not actually called as a method and is not allowed to use "this",
        // and can't just return a promise because we need an external reject for timeouts to work
        start(resolve, reject)
        {
            let params;
            if (typeof postData === "string")
                params = { method:  "POST",
                           headers: { "Content-type": "application/x-www-form-urlencoded" },
                           body:    #postData };
            else if (postData !== null && typeof postData === "object")
                params = { method:  "POST",
                           body:    #postData };     // in supported cases the content-type header is set automatically
            else
                params = { method: "GET" };

            if (#timeout && canUseAbortController)
            {
                #fetchAborter = new AbortController();
                params.signal = #fetchAborter.signal;
            }

            #resolve = resolve;
            #reject = reject;
            fetch(#contentURL, params).then(fetchComplete, fetchError);

            if (#timeout)
                #timer = setTimeout(abortBecauseTimeout, #timeout * 1000);
        }

        #abortBecauseTimeout()
        {
            #aborted = true;
            if (#fetchAborter)
                #fetchAborter.abort();       // should halt HTTP session
            fail(408, "SPARE time limit exceeded");
        }

        #fetchComplete(response)
        {
            if (!#aborted)
            {
                clearTimeout(#timer);
                if (response.status == 200 || response.status == 201 || response.status == 203)
                    response.text().then(#resolve, fetchError);
                else
                    fail(response.status, response.statusText);
            }
        }

        #fetchError(reason)
        {
            if (!#aborted)                    // abort calls downloadFailed immediately, so don't do anything here
            {
                clearTimeout(stimer);
                if ("name" in reason && "message" in reason)
                    fail(-2, `SPARE fetch failed with exception ${reason.name}: ${reason.message}`, reason);
                else                         // shouldn't happen
                    fail(-4, `SPARE fetch failed with reason ${reason}`);
            }
        }

        fail(statusNumber, statusText, exception)
        {
            #reject(makeError(exception, #contentURL, statusNumber, statusText));
        }
    }       // class Retriever


    class Extractor
    {
        #victim;
        #contentURL;
        #contentElementID;
        constructor(victim, contentURL /*for error reporting only*/, contentElementID)
        {
            #victim           = victim;
            #contentURL       = contentURL;
            #contentElementID = contentElementID;
        }

        extractAndUse(responseText)
        {
            let err;
            try
            {
                let sideDocument = document.implementation.createHTMLDocument("");
                let newContentDomParent = sideDocument.documentElement;
                newContentDomParent.innerHTML = responseText;
                if (!#contentElementID)
                {
                    // When given a fragment to parse, documentElement generally wraps it in a simulated body tag.
                    let body = newContentDomParent.getElementsByTagName("body");
                    newContentDomParent = body[0] || newContentDomParent;
                }
                else           // find the named element
                {
                    newContentDomParent = sideDocument.getElementById(#contentElementID);
                    if (!newContentDomParent)
                        err = `SPARE could not find element '${#contentElementID}' in downloaded content`;
                }

                if (!err)
                {
                    let placeholder = document.createElement(#victim.tagName);
                    #victim.parentNode.replaceChild(placeholder, #victim);		// do the loops while detached from the dom, for performance
                    while (#victim.lastChild)
                        #victim.removeChild(#victim.lastChild);
                    while (newContentDomParent.firstChild)
                        #victim.appendChild(newContentDomParent.firstChild);
                    placeholder.parentNode.replaceChild(#victim, placeholder);
                    return #victim;
                }
            }
            catch (ex)    // other than the -1 case, exceptions here shouldn't happen
            {
                throw makeError(ex, #contentURL, -3, "SPARE content update failed with exception " + ex.name + ": " + ex.message);
            }
            if (err)
                throw makeError(null, -1, err);
        }
    }       // class Extractor



    // load-time initialization -- validate that we have browser support, and save initial location
    let supported = "fetch" in window && "Response" in window && "Promise" in window && "catch" in Promise.prototype;
    // minimum browser versions are from 2021 or so, as "#" syntax postdates fetch and Promise

    if (!initialURL)
    {
        initialURL = location.href;       // XXX preserve anchor but trim when comparing
        initialTitle = document.title;
    }



    // our IIFE result: create the SPARE object accessed by the caller, or set it null if the browser is lacking
    let spare = !supported ? null :
    {
        // global defaulting values settable by the caller
        timeout: undefined,
        simulateDCL: false,


        // our core method
        replaceContent(target /*ID or DOM element*/, contentURL, contentElementID, postData, timeout)
        {
            try
            {
                let victim = validate(target, contentURL);      // throws (which Promise turns into rejection) if no victim
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


        // our more elaborate alternate method -- see https://github.com/paulkienitz/SPARE/blob/master/README.md for how to use
        simulateNavigation(target, contentURL, contentElementID, newTitle, pretendURL, contextData, postData, timeout)
        {
            try
            {
                if (!popStateHandlerSet)
                {
                    window.addEventListener("popstate", SPARE.onPopStateRestore);
                    popStateHandlerSet = true;
                }

                let victim = validate(target, contentURL);     // throws (which Promise turns into rejection) if no victim
                // we polymorphically allow an options param in place of newTitle or pretendURL
                let op = arguments[arguments.length - 1];
                if (arguments.length >= 4 && arguments.length <= 5 && typeof op === "object")
                {
                    timeout     = op.timeout;
                    postData    = op.postData;
                    contextData = op.contextData;
                    pretendURL  = op.pretendURL;
                    if (arguments.length < 5)
                        newTitle = op.newTitle;
                }
                timeout = normalizeTimeout(timeout, SPARE.timeout);

                let eventFirer = new EventFirer(SPARE.simulateDCL, contextData, false);
                let historyAdder = new HistoryAdder(victim.id, contentURL, contentElementID, newTitle, pretendURL, contextData, postData);
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


        // our default handler for the popstate event, attached on first call of simulateNavigation
        onPopStateRestore(event)
        {
            if (event.state && "startURL" in event.state)
            {
                let victim = document.getElementById(event.state.targetID);
                let eventFirer = new EventFirer(SPARE.simulateDCL, true);

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
                    let toUpdate = event.state.changes.filter(Change.needsRefresh)
                                                      .concat(Change.needToRestore(event.state.changes))
                                                      .sort(Change.order);
//alert(toUpdate.map(Change.toString).join('\n') || "no updates needed?");
                    let promises = toUpdate.map(function (u)
                    {
                        let riever = new Retriever(u.contentURL || event.state.startURL, u.postData, SPARE.timeout, u.contentElementID);
                        return new Promise(riever.start);
                    });
                    // those downloads happen in parallel but the extractions must be done in order
                    Promise.all(promises).then(texts =>     // XXX use allSettled?
                    {
                        for (let i in toUpdate)
                        {
                            let victim = document.getElementById(toUpdate[i].targetID);
                            let tractor = new Extractor(victim, toUpdate[i].contentURL || event.state.startURL, toUpdate[i].contentElementID);
                            tractor.extractAndUse(texts[i]);
                            Change.makeCurrent(toUpdate[i]);
                        }
                    }).then(eventFirer.loaded, eventFirer.failed);
                }
            }
        }
    };      // the object literal that will be assigned to the global SPARE singleton
    return spare;
}();
