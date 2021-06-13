// This is version 04 of SPARE (Static Page AJAX for Replacing Elements), a JavaScript object.
// Copyright 2015-2021 Paul Kienitz, Apache 2.0 license: http://www.apache.org/licenses/LICENSE-2.0
// In this version we move forward, but not too far.  We use only XHR's text mode, but return a Promise.
// NOTE: No version of Internet Explorer supports Promise without a polyfill.  (Edge 12 supports it.)
// Some other required features may need polyfills as well for old browsers.

// TODO: Compare performance on slow devices to Spare 2 and Spare 1?
//       INVESTIGATE unhandledrejection event.
//       TEST new error handling, then migrate to fetch versions.  Test in IE11 with a Promise polyfill.
//
// TESTS: Chrome/W: good, Chrome/A: good, Firefox Q69: good, Safari 10/M: good, Safari 11/i: good,
//        Edge 16: no URLSearchParams, Firefox 56: good, IE11: fails as expected.

"use strict";              // since there are polyfills for Promise, let's keep the language ES3-compatible
var SPARE = function ()	   // IIFE returns the SPARE singleton object, or null if unsupported
{
    // our only stateful private variable:
    var haveNavigated = false;

    // private methods
    var extractAndUse = function (responseText, newElementID, victim)       // returns error message or "" for success
    {
        var sideDocument = document.implementation.createHTMLDocument("");
        var newContentDomParent = sideDocument.documentElement;
        newContentDomParent.innerHTML = responseText;
        if (!newElementID)
        {
            // When given a fragment to parse, documentElement generally wraps it in a simulated body tag.
            var body = newContentDomParent.getElementsByTagName("body");
            newContentDomParent = body[0] || newContentDomParent;
        }
        else           // find the named element
        {
            newContentDomParent = sideDocument.getElementById(newElementID);
            if (!newContentDomParent)
                return "SPARE could not find element '" + newElementID + "' in downloaded content";
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


    var addHistory = function (elementID, pageURL, newElementID, newTitle, pretendURL)
    {
        history.pushState({ oldId: elementID, url: pageURL, newId: newElementID, title: newTitle, showURL: pretendURL },
                          newTitle, pretendURL || pageURL);
        if (newTitle)
            document.title = newTitle;
    };


    var makeError = function (errorNumber, errorText, url, exception)
    {
        if (!exception)
            exception = new Error(errorNumber + " " + errorText);
        exception.httpStatus = errorNumber || 0;
        exception.httpMessage = errorText || (exception ? exception.message : "SPARE - unknown error");		// unknown should not happen
        exception.url = url;                   // so catch() handler can easily fall back to navigating there
        return exception;
    };


    // private internal class
    var Transaction = function (url, postData, timeout, newElementID, victim)
    {
        // private members -- per-transaction state is kept here
        var xmlhttp = null;
        var aborted = false;
        var timer = null;
        var parentResolve = null;
        var parentReject = null;

        // our one internally public method
        this.start = function (resolve, reject)
        {
            parentResolve = resolve;
            parentReject = reject;
            if (typeof postData == "string" || (postData != null && typeof postData == "object"))
            {
                if (typeof postData == "string" || (typeof postData == "object" && postData.constructor.name == "URLSearchParams"))
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
            aborted = true;
            if (xmlhttp && xmlhttp.readyState < 4)
            {
                try { xmlhttp.abort(); } catch (e) { }
                downloadFailed(408, "SPARE time limit exceeded", null);
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
                    downloadFailed(xmlhttp.status, xmlhttp.statusText, null);
            }
        };

        var downloadSucceeded = function (xmlhttp)
        {
            try
            {
                var err = extractAndUse(xmlhttp.responseText, newElementID, victim);
                if (err)
                    downloadFailed(-1, err, null);
                else
                    parentResolve();
            }
            catch (e)
            {
                downloadFailed(-3, "SPARE caught exception " + e.name + ": " + e.message, e);
            }
        };

        var downloadFailed = function (errorNumber, errorText, exception)
        {
            parentReject(makeError(errorNumber, errorText, url, exception));
        };

        // initialize xmlhttp
        xmlhttp = new XMLHttpRequest();
        xmlhttp.onreadystatechange = stateChangedHandler;
        xmlhttp.ourUrl = url;
        xmlhttp.open(typeof postData == "string" || (postData != null && typeof postData == "object") ? "POST" : "GET", url, true);
        xmlhttp.responseType = "text";
    };      // class Transaction


    // our IIFE result: create the SPARE object accessed by the caller, or set it null if the browser is insufficiently modern
    return  !("XMLHttpRequest" in window && "Promise" in window && "catch" in Promise.prototype &&
              "history" in window && "pushState" in history &&
              "implementation" in document && "createHTMLDocument" in document.implementation) ? null :
            {
                // global defaulting value settable by the caller
                timeout: undefined,

                // Our core method - see https://github.com/paulkienitz/SPARE/blob/master/README.md for how to use.
                replaceContent: function (elementID, pageURL, newElementID, postData, timeout)
                {
                    return new Promise(function (resolve, reject)
                    {
                        if (typeof(pageURL) != "string" || pageURL.length == 0)
                            reject(makeError(0, "", pageURL, new Error("SPARE - pageURL is required")));
                        else
                        {
                            var victim = document.getElementById(elementID);
                            if (!victim)
                                reject(makeError(0, "", pageURL, new Error("SPARE could not find target element '" + elementID + "'")));
                            else
                            {
                                // Unlike SPARE 2 & 3, we do not support parsing the timeout parameter early when the last value passed in is a number.
                                if (isNaN(timeout))
                                    timeout = SPARE.timeout;
                                if (isNaN(timeout) || timeout <= 0 || timeout > 3600)
                                    timeout = undefined;
                                new Transaction(pageURL, postData, timeout, newElementID, victim).start(resolve, reject);
                            }
                        }
                    });
                },

                // Like replaceContent but also sets history and title.  No postData support.
                // HANDLER IS REQUIRED for popstate!  No cross-domain pageURL values are allowed
                // due to browser security.  Root-relative URLs are recommended.
                simulateNavigation: function (elementID, pageURL, newElementID, timeout, newTitle, pretendURL)
                {
                    if (!haveNavigated && !history.state)
                        history.replaceState({startURL: location.href, startTitle: window.title}, "");
                    haveNavigated = true;
                    return this.replaceContent(elementID, pageURL, newElementID, null, timeout)
                               .then(function () { addHistory(elementID, pageURL, newElementID, newTitle, pretendURL); });
                },

                // This is a default handler for the popstate event, which can
                // be used with simulateNavigation if nothing fancier is needed, or
                // called by an extended handler to provide the core functionality.
                onPopStateRestore: function (event)
                {
                    if ("state" in event && event.state)
                        if ("url" in event.state && "oldId" in event.state)
                        {
                            var p = SPARE.replaceContent(event.state.oldId, event.state.url, event.state.newId);
                            document.title = event.state.title;
                            return p;                           // promise is ignored when used directly as event handler
                        }
                        else if ("startURL" in event.state)
                            location.replace(event.state.startURL);   // refresh needed
                }
            };      // the object literal that will be assigned to the SPARE singleton
}();
