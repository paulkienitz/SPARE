// This is version ...5? of SPARE (Static Page AJAX for Replacing Elements), a JavaScript object.

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


// In this version we move forward, but not too far.  We use XHR's text mode, but return a Promise.
// NOTE: No version of Internet Explorer supports Promise without a polyfill.  (Edge 12 supports it.)
// Some other required features may need polyfills as well for old browsers.

// TODO: INVESTIGATE unhandledrejection event.  TEST error handling in general.
//       ...Add hook to edit downloaded text as string before putting it in the dom?

"use strict";              // since there are polyfills for Promise, let's keep the language ES3-compatible
var SPARE = function ()	   // IIFE returns the SPARE singleton object, or null if unsupported
{
    // private properties -- for thread safety, these are read-only after initialization
    var initialURL;
    var initialTitle;

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
    var EventFirer = function(useDCL)
    {
        var eventName = useDCL ? "DOMContentLoaded" : "SPAREContentLoaded";
        this.fire = function ()
        {
            document.dispatchEvent(new Event(eventName, { bubbles: true }));
        };
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
    };

    var Retriever = function (contentURL, postData, timeout, contentElementID, victim, resolve, reject)
    {
        // private members -- per-transaction state is kept here
        var xmlhttp = null;
        var aborted = false;
        var timer = null;

        // our one internally public method
        this.start = function ()
        {
            if (typeof postData === "string" || (postData !== null && typeof postData === "object"))
            {
                if (typeof postData === "string" || (typeof postData === "object" && postData.constructor.name === "URLSearchParams"))
                    xmlhttp.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
                xmlhttp.send(postData);
            }
            else
                xmlhttp.send();
            if (timeout)
                timer = setTimeout(abortBecauseTimeout, timeout * 1000);
        };

        // private methods
        var abortBecauseTimeout = function ()
        {
            if (xmlhttp && xmlhttp.readyState < 4)
            {
                aborted = true;
                try { xmlhttp.abort(); } catch (e) { }
                downloadFailed(408, "SPARE time limit exceeded");
            }
        };

        var stateChangedHandler = function ()
        {
            if (xmlhttp.readyState == 4 && !aborted)
            {
                clearTimeout(timer);
                if (xmlhttp.status == 200 || xmlhttp.status == 201 || xmlhttp.status == 203)
                    downloadSucceeded(xmlhttp);
                else
                    downloadFailed(xmlhttp.status, xmlhttp.statusText);
            }
        };

        var downloadSucceeded = function (xmlhttp)
        {
            try
            {
                var err = extractAndUse(xmlhttp.responseText, contentElementID, victim);
                if (err)
                {
                    downloadFailed(-1, err);
                    return;
                }
            }
            catch (e)    // unlikely
            {
                downloadFailed(-3, "SPARE caught exception " + e.name + ": " + e.message, e);
                return;
            }
            // no try/catch on this:
            resolve(victim);
        };

        var downloadFailed = function (errorNumber, errorText, exception)
        {
            reject(makeError(exception, contentURL, errorNumber, errorText));
        };

        // initialize xmlhttp
        xmlhttp = new XMLHttpRequest();
        xmlhttp.onreadystatechange = stateChangedHandler;
        xmlhttp.ourUrl = contentURL;
        xmlhttp.open(typeof postData === "string" || (postData !== null && typeof postData === "object") ? "POST" : "GET", contentURL, true);
        xmlhttp.responseType = "text";
    };      // class Retriever


    // load-time initialization -- validate that we have browser support, and save initial location
    var supported = "XMLHttpRequest" in window && "Promise" in window && "catch" in Promise.resolve(0) &&
                    "history" in window && "pushState" in history &&                 // ^^^ some polyfills don't set prototype
                    "implementation" in document && "createHTMLDocument" in document.implementation;
    // minimum browser versions without polyfills are from 2013-15: Edge 12, Firefox 29, Chrome 33, Safari 7.1

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
        // XXX add global then-handler here?  or one just for onPopStateRestore?

        // Our core method - see https://github.com/paulkienitz/SPARE/blob/master/README.md for how to use.
        // Note that if you have ES8, going "await SPARE.replaceContent(...)" is an alternative to using .then().
        replaceContent: function (target /*ID or DOM element*/, contentURL, contentElementID, timeout, postData)
        {
            return new Promise(function (resolve, reject)
            {
                var victim = validate(target, contentURL);     // throws (which Promise turns into rejection) if no victim
                // Unlike SPARE 2-4, we do not support parsing the timeout parameter early when the last value passed in is a number.
                timeout = normalizeTimeout(timeout, SPARE.timeout);
                var retriever = new Retriever(contentURL, postData, timeout, contentElementID, victim, resolve, reject);
                retriever.start();
            });
            // fun fact: attaching properties to this promise doesn't work, though it isn't sealed
        },

        // Like replaceContent but also sets history and title.  No postData support.
        // HANDLER IS REQUIRED for popstate!  No cross-domain contentURL values are allowed
        // due to browser security.  Root-relative URLs are recommended.
        simulateNavigation: function (target, contentURL, contentElementID, timeout, newTitle, pretendURL)
        {
            var historyAdder, eventFirer, retriever;
            return new Promise(function (resolve, reject)
            {
                var victim = validate(target, contentURL);     // throws (which Promise turns into rejection) if no victim
                timeout = normalizeTimeout(timeout, SPARE.timeout);
                eventFirer = new EventFirer(SPARE.simulateDCL);
                historyAdder = new HistoryAdder(victim.id, contentURL, contentElementID, newTitle, pretendURL);
                historyAdder.checkBehind();

                retriever = new Retriever(contentURL, null, timeout, contentElementID, victim, resolve, reject);
                retriever.start();
            }).then(historyAdder.add)
              .then(eventFirer.fire);
        },

        // This is a default handler for the popstate event, which can
        // be used with simulateNavigation if nothing fancier is needed, or
        // called by an extended handler to provide the core functionality.
        onPopStateRestore: function (event)
        {
            var ourPromise = undefined;
            if ("state" in event && event.state && "targetID" in event.state && "startURL" in event.state)
            {
                var eventFirer = new EventFirer(SPARE.simulateDCL);
                var victim = document.getElementById(event.state.targetID);
                // XXX Is this check unnecessary??
                if (!victim || location.href != (event.state.pretendURL || event.state.startURL))   // shouldn't happen
                {
                    console.log("=== SPARE had to reload initial page because assumed URL does not match current location, or target is missing." +
                                "\nPretend URL:  " + event.state.pretendURL + "\nInitial URL:  " + event.state.startURL +
                                "\n*Actual URL:  " + location.href + "\n- Target ID:  " + event.state.targetID);
                    location.replace(event.state.startURL);
                    // XXX what do we return here?
                }
                else if ("contentURL" in event.state)      // we are recreating a simulated non-original page state
                {
                    ourPromise = new Promise(function (resolve, reject)
                    {
                        var retriever = new Retriever(event.state.contentURL, null, SPARE.timeout, event.state.contentElementID, victim, resolve, reject);
                        retriever.start();
                    });
                    document.title = event.state.title;
                }
                else                                       // we are returning to a page state as originally loaded
                {
                    ourPromise = new Promise(function (resolve, reject)
                    {
                        var retriever = new Retriever(event.state.startURL, null, SPARE.timeout, event.state.targetID, victim, resolve, reject);
                        retriever.start();
                    });
                    document.title = event.state.startTitle;
                }
            }
            // XXX define a global function you can assign to be chained here when ourPromise is set??
            return ourPromise;
            // return value is ignored when this is used directly as the event handler
        }
    };      // the object literal that will be assigned to the global SPARE singleton
    return spare;
}();
