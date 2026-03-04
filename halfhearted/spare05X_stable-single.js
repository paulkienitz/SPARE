// This is version 5 of SPARE (Static Page AJAX for Replacing Elements), a JavaScript object.

/* Three-clause BSD-like license with simplified disclaimer and minification allowance:

"SPARE" is Copyright (c) 2015-2022 Paul M. Kienitz
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


// In this version we move on from legacy APIs.  We ignore XHR in favor of fetch, and return a Promise.
// Most browsers only started supporting fetch in 2015-16, so older ones will not work without polyfills.
// IE 11 is the only legacy browser where this was tested with polyfills.

// (This "stable-single" version is the one that seems to fully replace SPARE 4 without adding any
// new functions such as multi-target back button support, saved as a rollback reference point.)

// Minify with https://www.digitalocean.com/community/tools/minify  (activate Eval and Safari10 options)

// TODO: try out unhandledrejection event.


"use strict";              // since there are polyfills for Promise and fetch, let's keep the syntax ES3-compatible
var SPARE = function ()	   // IIFE returns the SPARE singleton object, or null if unsupported
{
    // private read-only capability flag
    var canUseAbortController = "AbortController" in window;

    // private properties -- for thread safety, these are read-only after being set
    var initialURL;
    var initialTitle;
    var popStateHandlerSet = false;


    // private functions
    var makeError = function (exception, url, errorNumber, statusText)
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
    };


    var validate = function(target, contentURL)    // returns target DOM element if it doesn't throw
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


    var normalizeTimeout = function(timeout, timeout2)
    {
        if (isNaN(timeout))
            timeout = timeout2;
        if (isNaN(timeout) || timeout <= 0 || timeout > 3600)
            return undefined;
        else
            return timeout;
    };


    var extractAndUse = function (responseText, contentElementID, victim)       // returns error message or "" for success
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
                return "SPARE could not find element '" + contentElementID + "' in downloaded content";
        }

        var placeholder = document.createElement(victim.tagName);
        victim.parentNode.replaceChild(placeholder, victim);		// do the loops while detached from the dom, for performance
        while (victim.lastChild)
            victim.removeChild(victim.lastChild);
        while (newContentDomParent.firstChild)
            victim.appendChild(newContentDomParent.firstChild);
        placeholder.parentNode.replaceChild(victim, placeholder);
        return "";
    };


    // private internal classes
    var EventFirer = function(simulateDCL, popping)
    {
        var eventName = simulateDCL ? "DOMContentLoaded" : "SPAREContentLoaded";

        this.loaded = function (val)
        {
            var event = new Event(eventName, { bubbles: true });
            event.pop = popping;
            document.dispatchEvent(event);
            return val;
        };
        this.failed = function (error)
        {
            var event = new Event("SPAREPopStateFailed", { bubbles: true });
            event.reason = error;
            document.dispatchEvent(event);
            // any subsequent catch will not be invoked; subsequent then will receive undefined
        }
    }


    var HistoryAdder = function (targetID, contentURL, contentElementID, newTitle, pretendURL)
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

        this.add = function (val)
        {
            history.pushState(state, "", pretendURL || contentURL);
            if (newTitle)
                document.title = newTitle;
            return val;
        };
        this.checkBehind = function ()
        {
            if (!history.state)
                history.replaceState(hindstate, "");
        };
    };


    var Retriever = function (contentURL, postData, timeout, contentElementID, victim)
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
            if (typeof postData === "string" || (postData !== null && typeof postData === "object"))
            {
                params = { method:  "POST",
                           body:    postData };
                if (typeof postData === "string")    // other parameter types set the header automatically
                    params.headers = { "Content-type": "application/x-www-form-urlencoded" };
            }
            else
                params = { method: "GET" };

            if (timeout && canUseAbortController)
            {
                fetchAborter = new AbortController();
                params.signal = fetchAborter.signal;
            }

            callerResolve = resolve;
            callerReject = reject;
            fetch(contentURL, params).then(fetchComplete, fetchError);

            if (timeout)
                timer = setTimeout(abortBecauseTimeout, timeout * 1000);
        };

        // private methods
        var abortBecauseTimeout = function ()
        {
            aborted = true;
            if (fetchAborter)
                fetchAborter.abort();       // should halt HTTP session; in aborterless browsers, it continues silently in background
            downloadFailed(408, "SPARE time limit exceeded");
        };

        var fetchComplete = function (response)
        {
            if (!aborted)
            {
                clearTimeout(timer);
                if (response.status == 200 || response.status == 201 || response.status == 203)
                    downloadSucceeded(response);
                else
                    downloadFailed(response.status, response.statusText);
            }
        };

        var fetchError = function (reason)
        {
            if (!aborted)                    // abort calls downloadFailed immediately, so don't do anything here
            {
                clearTimeout(timer);
                if ("name" in reason && "message" in reason)
                    downloadFailed(-2, "SPARE fetch failed with exception " + reason.name + ": " + reason.message, reason);
                else                         // should not happen?
                    downloadFailed(-4, "SPARE fetch failed with reason " + reason);
            }
        };

        var downloadSucceeded = function (response)
        {
            try
            {
                var extractor = function (responseText)
                {
                    var err = extractAndUse(responseText, contentElementID, victim);
                    if (err)
                        downloadFailed(-1, err);
                    else
                        callerResolve(victim);
                };
                response.text().then(extractor).catch(fetchError);
            }
            catch (e)    // unlikely
            {
                downloadFailed(-3, "SPARE caught exception " + e.name + ": " + e.message, e);
            }
        };

        var downloadFailed = function (statusNumber, statusText, exception)
        {
            callerReject(makeError(exception, contentURL, statusNumber, statusText));
        };
    };      // class Retriever



    // load-time initialization -- validate that we have browser support, and save initial location
    var supported = "fetch" in window && "Response" in window && "Promise" in window && "catch" in Promise.resolve(0) &&
                    "history" in window && "pushState" in history;   // some polyfills don't set prototype ^^^ and that's ok
    // minimum browser versions without polyfills are from 2015-16: Edge 14, Firefox 39, Chrome 42, Safari 10.1
    // ...AbortController support is added 2017-19: Edge 16, Firefox 57, Chrome 66, Safari 12.1

    if (!initialURL)
    {
        initialURL = location.href;
        initialTitle = document.title;
    }


    // our IIFE result: create the SPARE object accessed by the caller, or set it null if the browser is lacking
    var spare = !supported ? null :
    {
        // global defaulting values settable by the caller
        timeout: undefined,
        simulateDCL: false,


        // Our core method - see https://github.com/paulkienitz/SPARE/blob/master/README.md for how to use.
        // Note that if you have ES8, going "await SPARE.replaceContent(...)" is an alternative to using .then().
        replaceContent: function (target /*ID or DOM element*/, contentURL, contentElementID, timeout, postData)
        {
            try
            {
                var victim = validate(target, contentURL);     // throws (which Promise turns into rejection) if no victim
                // Unlike SPARE 2-4, we do not support parsing the timeout parameter early when the last value passed in is a number.
                timeout = normalizeTimeout(timeout, SPARE.timeout);

                var retriever = new Retriever(contentURL, postData, timeout, contentElementID, victim);
                return new Promise(retriever.start);
            }
            catch (ex)
            {
                return Promise.reject(ex);
            }
        },


        // Like replaceContent but also sets history and title.  No postData support.
        // HANDLER IS REQUIRED for popstate!  No cross-domain contentURL values are allowed
        // due to browser security.  Root-relative URLs are recommended.
        simulateNavigation: function (target, contentURL, contentElementID, timeout, newTitle, pretendURL)
        {
            try
            {
                if (!popStateHandlerSet)
                {
                    window.addEventListener("popstate", SPARE.onPopStateRestore);
                    popStateHandlerSet = true;
                }

                var victim = validate(target, contentURL);     // throws (which Promise turns into rejection) if no victim
                timeout = normalizeTimeout(timeout, SPARE.timeout);

                var eventFirer = new EventFirer(SPARE.simulateDCL, false);
                var historyAdder = new HistoryAdder(victim.id, contentURL, contentElementID, newTitle, pretendURL);
                historyAdder.checkBehind();

                var retriever = new Retriever(contentURL, null, timeout, contentElementID, victim);
                return new Promise(retriever.start).then(historyAdder.add)
                                                   .then(eventFirer.loaded);
            }
            catch (ex)
            {
                return Promise.reject(ex);
            }
        },


        // This is a default handler for the popstate event, which can
        // be used with simulateNavigation if nothing fancier is needed, or
        // called by an extended handler to provide the core functionality.
        onPopStateRestore: function (event)
        {
            var retriever, eventFirer;
            if ("state" in event && event.state && "targetID" in event.state && "startURL" in event.state)
            {
                var victim = document.getElementById(event.state.targetID);
                eventFirer = new EventFirer(SPARE.simulateDCL, true);
                // XXX Is this check unnecessary??
                if (!victim || location.href != (event.state.pretendURL || event.state.startURL))   // shouldn't happen
                {
                    console.log("=== SPARE had to reload initial page because assumed URL does not match current location, or target is missing." +
                                "\nPretend URL:  " + event.state.pretendURL + "\nInitial URL:  " + event.state.startURL +
                                "\n*Actual URL:  " + location.href + "\n- Target ID:  " + event.state.targetID);
                    location.replace(event.state.startURL);
                    return false;
                }
                else if ("contentURL" in event.state)      // we are recreating a simulated non-original page state
                {
                    retriever = new Retriever(event.state.contentURL, null, SPARE.timeout, event.state.contentElementID, victim);
                    document.title = event.state.title;
                }
                else                                       // we are returning to a page state as originally loaded
                {
                    retriever = new Retriever(event.state.startURL, null, SPARE.timeout, event.state.targetID, victim);
                    document.title = event.state.startTitle;
                }
            }
            if (retriever)
                return new Promise(retriever.start).then(eventFirer.loaded, eventFirer.failed);
        }
    };      // the object literal that will be assigned to the global SPARE singleton
    return spare;
}();
