// This is version 5 of SPARE (Static Page AJAX for Replacing Elements), a JavaScript module (basic pop support only).

// Argh, in Firefox XHR tends to return old cached results even if a full refresh saw something newer!
// Is fetch going to do the same thing?  Note -- full refresh sets Cache-control: no-cache on the parent page,
// but I don't think we have any way to detect that.  Cache-control: etag is unofficial?
// What does Chrome do differently?  it sends if-modified-since and if-none-match headers, absent in firefox.
// .........Wait, has Firefox now fixed itself so the bug doesn't happen anymore?

// TODO: set a SPARELoading CSS class on the target during the transition.
//       try out unhandledrejection event for a way to have pop failure do a reload.
//       send a beforePopState event, and check it for cancellation?
//       TEST multi-target popstate support.  SET UP TESTS WITH NESTING.
//           ...See G spreadsheet.  Run through cases, see what more is needed besides de-currenting inners.
//       figure out some way to opt for full reload in major cases.
//       DEFAULT SPAREPopStateFailed handler to reload page.
/*   CASES FOR NESTED TARGETS -- check each for back and fwd by steps, and back/fwd all at once:
A inside older B: 
A, then newer B outside: 
...
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

// In this version we embrace modern features.  We ignore XHR in favor of fetch, and are an ES6 module.
// Browsers have to be pretty up-to-date to support this version, like 2018 or newer.
// Any browser that new is generally evergreen, so realistically we could use recent features
// like top-level await while hardly losing any users, but I will use only ES6 syntax here,
// so that it will be guaranteed to run if it can load.

// (This "single" version is the one that seeks to fully replace SPARE 4 without adding any
// new functionality for multi-target back button support.  It moves forward from the stable
// versions tested in Rockets of Today, incorporating parts of future multi-target support.)

// Minify with https://www.digitalocean.com/community/tools/minify (based on Terser) in Module mode — eval option too?


/*export*/ class SPAREError extends Error
{
    httpStatus;
    httpMessage;
    contentURL;
    isSPARE = true;
} // this class mostly just exists so its name is prominently visible in console messages


export var SPARE = function ()	   // IIFE returns the SPARE singleton object, which is our export
{
    // private properties
    const canUseAbortController = "AbortController" in window;
    const initialURL = location.href;       // preserve anchor but trim when comparing
    const initialTitle = document.title;

    let logToConsole = true;
    let urlsCaseInsensitive = false;        // can also be a function hook?  not yet


    // private functions

    function typeName(anything)                             // returns a descriptive name for what type of value something is
    {
        let name = typeof anything;
        if (name === "object")
            if (anything === null)
                name = "null";
            else if (anything.constructor)
                name = anything.constructor.name;
        return name;
    }


    function makeError(exception, url, errorNumber, statusText)
    {
        if (errorNumber > 0 && !statusText)
            statusText = "HTTP status " + errorNumber;      // for http2 where statusText is absent (but some browsers may fill it in)
        if (typeof exception === "object" && !statusText)
            statusText = typeName(exception);
        if (exception == null)                              // with the loose comparison operators, undefined == null
        {
            if (errorNumber)
                exception = new SPAREError(errorNumber + " " + statusText);
            else
                exception = new SPAREError(statusText);
        }
        else if (typeof exception !== "object")             // for validation errors etc we just pass a string as exception
            exception = new SPAREError(String(exception));
        // for non-SPAREError exceptions these get added as ad-hoc properties, so it quacks like a SPAREError:
        exception.httpStatus = errorNumber;
        exception.httpMessage = statusText;
        exception.contentURL = url;                         // so catch() handler can easily fall back to navigating there
        exception.isSPARE = true;                           // for unhandledrejection handlers etc that might get nonspare errors
        if (logToConsole)
            console.error(exception);
        return exception;
    }


    function validate(target, contentURL, checkID, postData, contextData)   // returns target DOM element if it doesn't throw
    {
        if (!contentURL || typeof contentURL !== "string")      // allow URL object?
            throw makeError("SPARE - contentURL string is required", contentURL);
        if (target instanceof HTMLElement)
        {
            if (checkID && !target.id)
                throw makeError("SPARE - target has no ID", contentURL);
            return target;
        }
        if (!target)
            throw makeError("SPARE - target ID or object is required", contentURL);
        let victim = document.getElementById(target);
        if (!victim)
            throw makeError(`SPARE could not find target element '${target}' in ${contentURL}`, contentURL);
        if (postData)
            try { structuredClone(postData); }
            catch (ex) { throw makeError("SPARE postData is not cloneable - type " + typeName(postData), contentURL); }
        if (contextData)
            try { structuredClone(contextData); }
            catch (ex) { throw makeError("SPARE contextData is not cloneable - type " + typeName(contextData), contentURL); }
        return victim;
    }


    function normalizeTimeout(timeout, timeout2)            // returns a validated timeout interval or undefined
    {
        if (typeof timeout !== "number")
            timeout = timeout2;               // allow decimal string?
        if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 3600)
            return undefined;
        else
            return timeout;
    }



    // private internal classes and classlike features (sometimes just a factory or plain function)



    function makeHistoryAdder(targetID, contentURL, contentElementID, newTitle, pretendURL, contextData, postData)
    {
        return function (val)
        {
            let state = { SPAREtargetID:         targetID,
                          SPAREnewTitle:         newTitle,
                          SPAREvisibleURL:       pretendURL || contentURL,
                          SPAREcontentURL:       contentURL,
                          SPAREcontentElementID: contentElementID,
                          SPAREpostData:         postData,              // MUST be serializable! and serialization is stricter than you think
                          SPAREcontextData:      contextData,           // MUST be serializable, like postData!
                          SPAREinitialTitle:     initialTitle,
                          SPAREinitialURL:       initialURL
                          // add scroll position, to be used optionally?  (Chrome might benefit, Firefox is doing fine on its own)
                        };
            history.pushState(state, "", pretendURL || contentURL);
            if (newTitle)
                document.title = newTitle;
            return val;
        };
    }

    function historyBackfill(targetID, contextData)
    {
        if (history.state && history.state.SPAREinitialURL)
            return;
        let hindstate = { SPAREtargetID:        targetID,
                          SPAREcontextData:     contextData,            // MUST be serializable!
                          SPAREinitialTitle:    initialTitle,
                          SPAREinitialURL:      initialURL
                          // add scroll position, to be used optionally?  (Chrome might benefit, Firefox is doing fine on its own)
                        };
        if (history.state)
        {
            var t = history.state;
            Object.assign(t, hindstate);                                // merge the fields
            hindstate = t;
        }
        history.replaceState(hindstate, "");
    }


/* experimental feature for scrolling:
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



    // This especially doesn't want to be a true class... BUT WAIT, could lambda methods handle this correctly as callbacks??
    // Returns an object containing functions for different event types 
    // XXX TODO: turn into a class with lambda methods:  loaded = result => { ... }; ?
    function makeEventFirer(simulateDCL, contentURL, contextData)
    {
        let lastError = undefined;

        function makeEvent(name, canCancel)
        {
            let event = new Event(name, { bubbles: true, cancelable: !!canCancel });
            event.contextData = contextData;
            event.contentURL = contentURL;
            event.isSPARE = true;
            if (canCancel)
                event.cancel = function () { this.preventDefault(); this.stopPropagation(); };
            return event;
        }

        return {
                 loaded: function (val)
                 {
                    let event = makeEvent(simulateDCL ? "DOMContentLoaded" : "SPAREContentLoaded");
                    document.dispatchEvent(event);
                    // XXX TODO: include a field with the id(s) of victim(s) that got updated?
                    lastError = undefined;
                    return val;
                 },

                 failed: function (error)
                 {
                    let event = makeEvent("SPAREPopStateFailed");
                    event.error = lastError = error;
                    document.dispatchEvent(event);
                    // subsequent then() will receive undefined; no error is thrown to trigger catch()
                 },

                 beforePop: function ()
                 {
                    let event = makeEvent("SPAREBeforePopState", true);
                    document.dispatchEvent(event);
                    return !event.defaultPrevented;
                 },

                 afterPop: function (outcome)
                 {
                    let event = makeEvent("SPAREAfterPopState");
                    event.outcome = outcome;
                    event.error = lastError;
                    document.dispatchEvent(event);
                 }
               };
    }       // makeEventFirer



    function Retrieve(contentURL, postData, timeout)
    {
        let aborted = false, retrieved = false;
        let timer = undefined;
        let fetchAborter = null;
        let promGood = null, promBad = null;

        function fail(statusNumber, statusText, exception)
        {
            throw makeError(exception, contentURL, statusNumber, statusText);
        }

        function fetchComplete(response)
        {
            if (!aborted)
            {
                clearTimeout(timer);
                if (response.status == 200 || response.status == 201 || response.status == 203)
                    return response.text().then((t) => { retrieved = true; return t; }, fetchError);
                else
                    fail(response.status, response.statusText);
            }
        }

        function fetchError(reason)
        {
            if (!aborted)                    // abort throws its own rejection, so don't do anything here in that case
            {
                clearTimeout(timer);
                if ("name" in reason && "message" in reason)
                    fail(-2, `SPARE fetch${retrieved ? " text" : ""} failed with exception ${reason.name}: ${reason.message}`, reason);
                else                         // shouldn't happen, I hope
                    fail(-4, `SPARE fetch${retrieved ? " text" : ""} failed with reason ${reason}`, reason);
            }
        }

        function abortBecauseTimeout(reject)
        {
            if (!aborted)                       // probably unnecessary to check this
            {
                aborted = true;
                if (fetchAborter)
                    fetchAborter.abort();       // should halt HTTP session; in aborterless browsers, it continues silently in background
                reject(makeError(null, contentURL, 408, `SPARE time limit exceeded (${timeout} seconds)`));
            }
        }

        let params;
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
            promBad = new Promise((resolve, reject) => timer = setTimeout(abortBecauseTimeout, timeout * 1000, reject));
        promGood = fetch(contentURL, params).then(fetchComplete, fetchError);
        return promBad ? Promise.race([promBad, promGood]) : promGood;
    }       // Retrieve



    function makeExtractor(victim, contentURL /*for error reporting only*/, contentElementID)
    {
        return function (responseText)
        {
            let err;
            try
            {
                let sideDocument = document.implementation.createHTMLDocument("");
                let newContentDomParent = sideDocument.documentElement;
                newContentDomParent.innerHTML = responseText;
                if (!contentElementID)
                {
                    // When given a fragment to parse, documentElement generally wraps it in a simulated body tag.
                    let body = newContentDomParent.getElementsByTagName("body");
                    newContentDomParent = body[0] || newContentDomParent;
                }
                else           // find the named element
                {
                    newContentDomParent = sideDocument.getElementById(contentElementID);
                    if (!newContentDomParent)
                        err = `SPARE could not find element '${contentElementID}' in downloaded content from ${contentURL}`;
                }

                if (!err)
                {
                    let placeholder = document.createElement(victim.tagName);
                    victim.parentNode.replaceChild(placeholder, victim);    // do the loops while detached from the dom, for performance
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
                throw makeError(null, contentURL, -1, err);
        }
    }       // makeExtractor



    // "MAIN PROGRAM" TIME...
    // load-time initialization -- validate that we have browser support, and save initial location
    let supported = "fetch" in window && "Response" in window && "closest" in HTMLElement.prototype;
    // Minimum browser versions are from 2015-17: Edge 16, Firefox 60, Chrome 61, Safari 11...
    // so in practice the test is pretty pointless, as every browser that can load modules passes it.
    // AbortController support is added 2017-19: Edge 16, Firefox 57, Chrome 66, Safari 12.1


    // our IIFE result: create the SPARE object accessed by the caller, or set it null if the browser is lacking
    let spare = !supported ? undefined :
    {
        // global defaulting values settable by the caller
        timeout: undefined,

        simulateDCL: false,

        get logErrorsToConsole()
        {
            return logToConsole;
        },
        set logErrorsToConsole(flag)
        {
            logToConsole = !!flag;
        },

        get treatURLsAsCaseInsensitive()
        {
            return urlsCaseInsensitive;
        },
        set treatURLsAsCaseInsensitive(flag)
        {
            urlsCaseInsensitive = !!flag;
        },


        // Our core method - see https://github.com/paulkienitz/SPARE/blob/master/README.md for how to use.
        // Going "await SPARE.replaceContent(...)" is an alternative to using .then() for 2018+ browsers.
        replaceContent(target /*ID or DOM element*/, contentURL, contentElementID, postData, timeout)
        {
            try
            {
                let victim = validate(target, contentURL);      // throws (which Promise turns into rejection) if no victim
                if (Number.isFinite(postData) && arguments.length === 4)
                    timeout = postData, postData = undefined;   // we allow timeout to use either param position polymorphically
                timeout = normalizeTimeout(timeout, SPARE.timeout);
                return Retrieve(contentURL, postData, timeout)
                            .then(makeExtractor(victim, contentURL, contentElementID));
            }
            catch (ex)
            {
                return Promise.reject(ex);
            }
        },


        // Like replaceContent but also sets history and title.  Root-relative URLs are recommended,
        // because cross-domain contentURL values will generally fail due to browser security.
        // Both contextData and postData must be cloneable into a popState context.  This is validated.
        simulateNavigation(target, contentURL, contentElementID, newTitle, pretendURL, timeout, postData, contextData)
        {
            try
            {
                if (postData instanceof URLSearchParams)
                    postData = postData.toString();     // make it cloneable
                let victim = validate(target, contentURL, true, postData, contextData);     // throws if any are bad
                // we polymorphically allow an options param in place of newTitle:  // or pretendURL
                let op = arguments[arguments.length - 1];
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

                let eventFirer = makeEventFirer(SPARE.simulateDCL, contentURL, contextData);
                let historyAdder = makeHistoryAdder(victim.id, contentURL, contentElementID, newTitle, pretendURL, contextData, postData);
                historyBackfill(victim.id, contextData);
                return Retrieve(contentURL, postData, timeout)
                            .then(makeExtractor(victim, contentURL, contentElementID))
                            .then(historyAdder)
                            .then(eventFirer.loaded);
            }
            catch (ex)
            {
                return Promise.reject(ex);
            }
        },


        // our handler for the popstate event, already attached
        onPopStateRestore(event)
        {
            let url, id, postage, victim, eventFirer, outcome, retval;
            if (event.state && event.state.SPAREinitialURL)
            {
                victim = document.getElementById(event.state.SPAREtargetID);
                eventFirer = makeEventFirer(SPARE.simulateDCL, event.state.SPAREcontentURL, event.state.SPAREcontextData);
                if (eventFirer.beforePop())
                {
                    if (!victim)        // should not happen... XXX are there any other sanity checks we can do here?
                    {
                        console.log(`=== SPARE has to reload initial page because history state target '${event.state.SPAREtargetID}' is missing.` +
                                    `\nVisible URL:  ${event.state.SPAREvisibleURL}\nCurrent URL:  ${location.href}\nInitial URL:  ${event.state.SPAREinitialURL}`);
                        location.replace(event.state.SPAREvisibleURL);
                        retval = false;
                    }
                    else if (event.state.SPAREcontentURL)           // we are recreating a simulated non-original page state
                    {
                        url = event.state.SPAREcontentURL;
                        id = event.state.SPAREcontentElementID;
                        postage = event.state.SPAREpostData;
                        document.title = event.state.SPAREnewTitle;
                    }
                    else                                            // we are returning to a page state as originally loaded
                    {
                        url = event.state.SPAREinitialURL;
                        id = event.state.SPAREtargetID;
                        document.title = event.state.SPAREinitialTitle;
                    }
                    /* var hashfinder = makeHashFinder(location.href); */
                    if (url)
                    {
                        outcome = "pending";
                        let p = Retrieve(url, postage, SPARE.timeout);      // XXX ** HOW BETTER HANDLE A TIMEOUT HERE??
                        outcome = "requested";
                        p.then(t => outcome = "retrieved");
                        let extract = makeExtractor(victim, url, id);
                        p = p.then(extract);
                        p.then(v => outcome = "replaced");
                        retval = p.then(eventFirer.loaded, eventFirer.failed)/*.then(hashfinder)*/
                                  .then(v => eventFirer.afterPop(outcome));
                    } // else afterPop does not fire because page is reloading
                }
                else
                    retval = new Promise((res, rej) => res(eventFirer.afterPop("cancelled")));
            }
            return retval;
        }
    };

    return spare;      // the object literal that will be assigned to the global SPARE singleton
}();

// This is needed right away even if we haven't pushed any state yet,
// for when someone returns to this site from outside via the back button.
if (SPARE)
    window.addEventListener("popstate", SPARE.onPopStateRestore);
