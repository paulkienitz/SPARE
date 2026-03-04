// This is version ...5? of SPARE (Static Page AJAX for Replacing Elements), a JavaScript module.

/* Three-clause BSD-like license with simplified disclaimer and minification allowance:

Copyright (c) 2015-2022 Paul M. Kienitz
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
// This might be released simultaneously with a compatible non-module version, as a fallback for those
// who want to support browsers that can't load modules, which includes some modern mobile browsers.
// That should work pretty far back if Fetch and Promise are polyfilled.

// TODO: INVESTIGATE unhandledrejection event.  TEST error handling in general.
//       ...Add hook to edit downloaded text as string before putting it in the dom?

export var SPARE = function ()	   // IIFE returns the SPARE singleton object, which is our export
{
    // private read-only capability flag
    let canUseAbortController = "AbortController" in window;

    // private properties -- for thread safety, these are read-only after initialization
    var initialURL;
    var initialTitle;

    // private functions
    function makeError(exception, url, errorNumber, statusText)
    {
        if (exception && typeof(exception) === "string")   // for validation errors etc
            exception = new Error(exception);
        if (errorNumber > 0 && !statusText)
            statusText = "HTTP status " + errorNumber;     // for http2 where statusText is absent
        if (!exception && errorNumber)
            exception = new Error(errorNumber + " " + statusText);
        else if (!exception)
            exception = new Error(statusText);
        exception.httpStatus = errorNumber;
        exception.httpMessage = statusText;
        exception.contentURL = url;                 // so catch() handler can easily fall back to navigating there
        exception.isSPARE = true;                   // for unhandledrejection handlers that might get nonspare errors
        return exception;
    }

    function validate(target, contentURL)    // returns target DOM element if it doesn't throw
    {
        if (!contentURL || typeof(contentURL) !== "string")
            throw makeError("SPARE - contentURL is required", contentURL);
        if (target instanceof HTMLElement)
            return target;
        if (!target)
            throw makeError("SPARE - target is required", contentURL);
        var victim = document.getElementById(target);
        if (!victim)
            throw makeError("SPARE could not find target element '" + target + "'", contentURL);
        return victim;
    };

    function normalizeTimeout(timeout, timeout2)
    {
        if (isNaN(timeout))
            timeout = timeout2;
        if (isNaN(timeout) || timeout <= 0 || timeout > 3600)
            return undefined;
        else
            return timeout;
    };

    function extractAndUse(responseText, contentElementID, victim)       // returns error message
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
                return `SPARE could not find element '${contentElementID}' in downloaded content`;
        }

        let placeholder = document.createElement(victim.tagName);
        victim.parentNode.replaceChild(placeholder, victim);		// do the loops while detached from the dom, for performance
        while (victim.lastChild)
            victim.removeChild(victim.lastChild);
        while (newContentDomParent.firstChild)
            victim.appendChild(newContentDomParent.firstChild);
        placeholder.parentNode.replaceChild(victim, placeholder);
        return "";
    };


    // private internal classes... we use traditional function-style constructors
    // instead of ES6 classes, because we need to have internal (and preferably
    // private) member variables visible to the exposed functions, especially
    // fetchComplete and fetchError in Retriever, which have no 'this'
    function EventFirer(useDCL)
    {
        var eventName = useDCL ? "DOMContentLoaded" : "SPAREContentLoaded";
        this.fire = function ()
        {
            document.dispatchEvent(new Event(eventName, { bubbles: true }));
        };
    }

    function HistoryAdder(targetID, contentURL, contentElementID, newTitle, pretendURL)
    {
        var state = { targetID:         targetID,
                      contentURL:       contentURL,
                      contentElementID: contentElementID || null,
                      newTitle:         newTitle || null,
                      pretendURL:       pretendURL || null,
                      startTitle:       initialTitle || null,
                      startURL:         initialURL || null
        };
        var hindstate = { targetID:         targetID,
                          startTitle:       initialTitle || null,
                          startURL:         initialURL || null
        };
        this.add = function ()
        {
            history.pushState(state, "", pretendURL || contentURL);
            if (newTitle)
                document.title = newTitle;
        };
        this.checkBehind = function ()
        {
            if (!history.state)
                history.replaceState(hindstate, "");
        };
    }

    // XXX can this be turned into a true class?
    function Retriever(contentURL, postData, timeout, contentElementID, victim)
    {
        // private members -- per-transaction state is kept here
        var parentResolve = null;
        var parentReject = null;
        var aborted = false;
        var timer = null;
        var fetchAborter = canUseAbortController ? new AbortController() : null;

        // our one internally public method
        // XXX can it just return the promise created by fetch()?  Yes, have the outer promise call resolve(start()).
        this.start = function (resolve, reject)
        {
            parentResolve = resolve;
            parentReject = reject;
            let params;
            if (typeof postData === "string" || (postData !== null && typeof postData === "object"))
            {
                params = { method:  "POST",
                           body:    postData };
                if (typeof postData === "string")    // other parameter types set the header automatically
                    params.headers = { "Content-type": "application/x-www-form-urlencoded" };
                // XXX maybe set postData AFTER header?
            }
            else
                params = { method: "GET" };
            if (fetchAborter)
                params.signal = fetchAborter.signal;
            fetch(contentURL, params).then(fetchComplete).catch(fetchError);
            if (timeout)
                timer = setTimeout(abortBecauseTimeout, timeout * 1000);
        };

        // private methods
        function abortBecauseTimeout()
        {
            aborted = true;
            if (fetchAborter)
                fetchAborter.abort();       // should halt HTTP session; in aborterless browsers, it continues silently in background
            downloadFailed(408, "SPARE time limit exceeded");         // will have no effect if promise already resolved
        }

        function fetchComplete(response)
        {
            if (!aborted)
            {
                clearTimeout(timer);
                if (response.status == 200 || response.status == 201 || response.status == 203)
                    downloadSucceeded(response);
                else
                    downloadFailed(response.status, response.statusText);
            }
        }

        function fetchError(reason)
        {
            if (!aborted)                    // abort calls downloadFailed immediately, so don't do anything here
            {
                clearTimeout(timer);
                if ("name" in reason && "message" in reason)
                    downloadFailed(-2, `SPARE (during fetch) caught exception ${reason.name}: ${reason.message}`, reason);
                else                         // can this ever happen?
                    downloadFailed(-4, `SPARE failed with reason ${reason}`);
            }
        }

        function downloadSucceeded(response)
        {
            try
            {
                response.text().catch(fetchError)
                               .then(responseText =>
                                     {
                                         var err = extractAndUse(responseText, contentElementID, victim);
                                         if (err)
                                             downloadFailed(-1, err);
                                     })
                               .then(parentResolve);
                // XXX pass something to parentResolve, such as victim?
                // XXX move parentResolve OUTSIDE of try/catch, or remove try/catch.
            }
            catch (e)
            {
                downloadFailed(-3, `SPARE (during extraction) caught exception ${e.name}: ${e.message}`, e);
            }
        }

        function downloadFailed(errorNumber, errorText, exception)
        {
            parentReject(makeError(exception, contentURL, errorNumber, errorText));
        }
    }       // class Retriever


    if (!initialURL)
    {
        initialURL = location.href;
        initialTitle = document.title;
    }

    // our IIFE result: create the SPARE object accessed by the caller, or set it null if the browser is lacking
    return  !("fetch" in window && "Response" in window && "Promise" in window && "catch" in Promise.prototype &&
              "history" in window && "pushState" in history &&
              "implementation" in document && "createHTMLDocument" in document.implementation) ? null :
            {
                // global defaulting values settable by the caller
                timeout: undefined,
                simulateDCL: false,
                // XXX add global then-handler here?  or one just for onPopStateRestore?

                // Our core method - see https://github.com/paulkienitz/SPARE/blob/master/README.md for how to use.
                // Note that if you have ES8, going "await SPARE.replaceContent(...)" is an alternative to using .then().
                replaceContent(target /*ID or DOM element*/, contentURL, contentElementID, timeout, postData)
                {
                    return new Promise((resolve, reject) =>
                    {
                        var victim = validate(target, contentURL);     // throws (which Promise turns into rejection) if no victim
                        // Unlike SPARE 2-4, we do not support parsing the timeout parameter early when the last value passed in is a number.
                        timeout = normalizeTimeout(timeout, SPARE.timeout);

                        var retriever = new Retriever(contentURL, postData, timeout, contentElementID, victim);
                        retriever.start(resolve, reject);
                        // XXX is there a cleaner way to do this where start() creates the promise that is returned?
                    });
                },

                // Like replaceContent but also sets history and title.  No postData support.
                // HANDLER IS REQUIRED for popstate!  No cross-domain contentURL values are allowed
                // due to browser security.  Root-relative URLs are recommended.
                simulateNavigation(target, contentURL, contentElementID, timeout, newTitle, pretendURL)
                {
                    var historyAdder, eventFirer, retriever;
                    return new Promise(function (resolve, reject)
                    {
                        var victim = validate(target, contentURL);     // throws (which Promise turns into rejection) if no victim
                        timeout = normalizeTimeout(timeout, SPARE.timeout);
                        eventFirer = new EventFirer(SPARE.simulateDCL);
                        historyAdder = new HistoryAdder(victim.id, contentURL, contentElementID, newTitle, pretendURL);
                        historyAdder.checkBehind();

                        retriever = new Retriever(contentURL, null, timeout, contentElementID, victim);
                        retriever.start(resolve, reject);
                    }).then(historyAdder.add)
                      .then(eventFirer.fire);
                },

                // This is a default handler for the popstate event, which can
                // be used with simulateNavigation if nothing fancier is needed, or
                // called by an extended handler to provide the core functionality.
                onPopStateRestore(event)
                {
                    let ourPromise = undefined;
                    if ("state" in event && event.state && "targetID" in event.state && "startURL" in event.state)
                    {
                        let eventFirer = new EventFirer(SPARE.simulateDCL);
                        let victim = document.getElementById(event.state.targetID);
                        if (!victim || location.href != (event.state.pretendURL || event.state.startURL))   // shouldn't happen
                        {
                            console.log("=== SPARE had to reload initial page because assumed URL does not match current location, or target is missing." +
                                        "\nPretend URL:  " + event.state.pretendURL + "\nInitial URL:  " + event.state.startURL +
                                        "\n*Actual URL:  " + location.href + "\n- Target ID:  " + event.state.targetID);
                            location.replace(event.state.startURL);
                        }
                        else if ("contentURL" in event.state)      // we are recreating a simulated non-original page state
                        {
                            let retriever = new Retriever(event.state.contentURL, null, SPARE.timeout, event.state.contentElementID, victim);
                            ourPromise = new Promise(function (resolve, reject) { retriever.start(resolve, reject); });
                            document.title = event.state.title;
                        }
                        else                                       // we are returning to a page state as originally loaded
                        {
                            let retriever = new Retriever(event.state.startURL, null, SPARE.timeout, event.state.targetID, victim);
                            ourPromise = new Promise(function (resolve, reject) { retriever.start(resolve, reject); });
                            document.title = event.state.startTitle;
                        }
                    }
                    // XXX define a global thenable you can assign to handle completion here when ourPromise is set??
                    return ourPromise;
                    // return value is ignored when this is used directly as the event handler
                }
            };      // the object literal that will be assigned to the SPARE singleton
}();
