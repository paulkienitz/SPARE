// This is version 03 of SPARE (Static Page AJAX for Replacing Elements), a JavaScript object.
// Copyright 2015-2021 Paul Kienitz, Apache 2.0 license: http://www.apache.org/licenses/LICENSE-2.0

"use strict";              // do not use any language features incompatible with ECMAScript 3
var SPARE = function ()	   // IIFE returns the SPARE singleton object
{
    // private capability flag
    var supported = false;

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


    var addHistory = function (elementID, pageURL, newElementID, newTitle, pretendURL, onSuccess, callbackContextData)
    {
        history.pushState({ oldId: elementID, url: pageURL, newId: newElementID, title: newTitle, showURL: pretendURL },
                          newTitle, pretendURL || pageURL);
        if (newTitle)
            document.title = newTitle;
        if (typeof(onSuccess) == "string")
            eval(onSuccess);
        else if (typeof(onSuccess) == "function")
            onSuccess(callbackContextData);
    };


    // private internal class
    var Transaction = function (url, postData, timeout, newElementID, victim, callbackContextData, onSuccess, onFailure)
    {
        // private members -- per-transaction state is kept here
        var xmlhttp = null;
        var aborted = false;
        var timer = null;

        // our one internally public method
        this.start = function ()
        {
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
                var err = extractAndUse(xmlhttp.responseText, newElementID, victim);
                if (err)
                {
                    downloadFailed(-1, err);
                    return;
                }
            }
            catch (e)
            {
                downloadFailed(-3, "SPARE caught exception " + e.name + ": " + e.message);
                return;
            }
            if (typeof(onSuccess) == "string")
                eval(onSuccess);
            else if (typeof(onSuccess) == "function")
                onSuccess(callbackContextData);
        };

        var downloadFailed = function (errorNumber, errorText)
        {
            if (typeof(onFailure) == "string")
                eval(onFailure);
            else if (typeof(onFailure) == "function")
                onFailure(callbackContextData, errorNumber, errorText);
            else
                window.location.href = url;
        };

        // initialize xmlhttp
        xmlhttp = new XMLHttpRequest();
        xmlhttp.onreadystatechange = stateChangedHandler;
        xmlhttp.ourUrl = url;
        xmlhttp.open(typeof postData == "string" || (postData != null && typeof postData == "object") ? "POST" : "GET", url, true);
        xmlhttp.responseType = "text";
    };      // class Transaction


    // validate that we have browser support
    supported = "XMLHttpRequest" in window && "querySelector" in document &&
                "history" in window && "pushState" in history &&
                "implementation" in document && "createHTMLDocument" in document.implementation;
    // minimum browser versions are from 2010-12: IE 10, Firefox 4*, Chrome 5, Safari 5
    // (* Firefox may have to be a bit later than 4 to be reliable?)

    // our IIFE result: create the SPARE object accessed by the caller
    return  {
                // global defaulting values settable by the caller
                timeout: undefined,
                transitionalContentID: undefined,   // IGNORED - present for 01 API compatibility only
                onSuccess: null,
                onFailure: null,

                // public methods
                supportLevel: function ()
                {
                    if (!supported)
                        return 0;                   // SPARE will not work at all (IE 9 now returns this)
                    else
                        return 2;                   // it's good to go (we no longer return levels 1 or 3)
                },

                // History handling formerly couldn't fit into the existing supportLevel ranks.
                canSimulateNavigation: function ()  // retained for 02 API compatibility
                {
                    return supported;
                },

                // Our core method - see https://github.com/paulkienitz/SPARE/blob/master/README.md for how to use.
                replaceContent: function (elementID, pageURL, newElementID, postData,
                                          callbackContextData, onSuccess, onFailure,
                                          transitionalContentID /*IGNORED*/, timeout)
                {
                    if (!supported)
                        throw new Error("SPARE cannot operate because browser lacks support");
                    if (typeof(pageURL) != "string" || pageURL.length == 0)
                        throw new Error("SPARE - pageURL is required");
                    var victim = document.getElementById(elementID);
                    if (!victim)
                        throw new Error("SPARE could not find target element '" + elementID + "'");

                    // Allow the final argument to be timeout if it is numeric, to simulate additional polymorphic signatures.
                    var tmout = timeout;
                    if (arguments.length >= 3 && arguments.length <= 8 && !isNaN(arguments[arguments.length - 1]))
                    {
                        tmout = arguments[arguments.length - 1];
                        switch (arguments.length)
                        {
                            case 3: newElementID = undefined;       // NO BREAK, fall through
                            case 4: postData = undefined;
                            case 5: callbackContextData = undefined;
                            case 6: onSuccess = undefined;
                            case 7: onFailure = undefined;
                            default: transitionalContentID = undefined;
                        }
                    }
                    if (isNaN(tmout))
                        tmout = SPARE.timeout;
                    if (isNaN(tmout) || tmout <= 0 || tmout > 3600)
                        tmout = undefined;

                    new Transaction(pageURL, postData, tmout, newElementID, victim, callbackContextData,
                                    onSuccess || SPARE.onSuccess, onFailure || SPARE.onFailure).start();
                },

                // Like replaceContent but also sets history and title.  No postData support.
                // HANDLER IS REQUIRED for popstate!  No cross-domain pageURL values are allowed
                // due to browser security.  Root-relative URLs are recommended.
                simulateNavigation: function (elementID, pageURL, newElementID,
                                              callbackContextData, onSuccess, onFailure,
                                              timeout, newTitle, pretendURL)
                {
                    if (!supported)
                        throw new Error("SPARE is unable to set browser history");
                    if (!haveNavigated && !history.state)
                        history.replaceState({startURL: location.href, startTitle: window.title}, "");
                    haveNavigated = true;
                    this.replaceContent(elementID, pageURL, newElementID, null, callbackContextData,
                                        function (context) { addHistory(elementID, pageURL, newElementID, newTitle, pretendURL,
                                                                        onSuccess || SPARE.onSuccess, context); },
                                        onFailure, null, timeout);
                },

                // This is a default handler for the popstate event, which can
                // be used with simulateNavigation if nothing fancier is needed, or
                // called by an extended handler to provide the core functionality.
                onPopStateRestore: function (event)
                {
                    if ("state" in event && event.state)
                        if ("url" in event.state && "oldId" in event.state)
                        {
                            SPARE.replaceContent(event.state.oldId, event.state.url, event.state.newId);
                            document.title = event.state.title;
                        }
                        else if ("startURL" in event.state)
                            location.replace(event.state.startURL);   // refresh
                }
            };      // the object literal that will be assigned to the SPARE singleton
}();
