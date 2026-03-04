// This is version 4 of SPARE (Static Page AJAX for Replacing Elements), a JavaScript object.

/* Three-clause BSD-like license with simplified disclaimer and minification allowance:

Copyright (c) 2015-2021 Paul M. Kienitz
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


// In this version we retain compatibility with SPARE 3, but extend our popstate support,
// and begin incorporating features planned for an incompatible promise-based module.

// Goals: handle popstate for all single-target cases, ignore multi-target ones.
//        support new param and property names while retaining full compatibility.
//        simulate DCL or custom event.
//        make extractAndUse roll back content on failure.

// Issue: new content is not loading images sometimes! (Firefox only? relative paths only?)
//        also it often shows old cached shit, but I guess that’s not my problem

// TESTS: Chrome/W: good, Chrome/A: good, Firefox Q69/W: good, Firefox 94/A: good.  ** REDO **
//        Safari 10/M: good, Safari 11/i: good... retest ios.
//        Edge 16: no URLSearchParams, Firefox 56: good, IE11: tried three polyfills, all good.

"use strict";              // do not use any language features incompatible with ECMAScript 3
var SPARE = function ()	   // IIFE returns the SPARE singleton object
{
    // private capability flag
    var supported = false;

    // private properties -- remember initial state and all targets
    var initialURL;
    var initialTitle;

    // private methods
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


    var addHistory = function (targetID, contentURL, contentElementID, newTitle,
                               pretendURL, simulateDCL, onSuccess, callbackContextData)
    {
        var state = { oldId:            targetID,                  // old name
                      targetID:         targetID,                  //   new name
                      url:              contentURL,                // old name
                      contentURL:       contentURL,                //   new name
                      newId:            contentElementID || null,  // old name
                      contentElementID: contentElementID || null,  //   new name
                      title:            newTitle || null,          // old name
                      newTitle:         newTitle || null,          //   new name
                      showURL:          pretendURL  || null,       // old name
                      pretendURL:       pretendURL || null,        //   new name
                      startTitle :      initialTitle,
                      startURL:         initialURL };
        history.pushState(state, "", pretendURL || contentURL);
console.log("]] pushing " + (pretendURL || contentURL));
        if (newTitle)
            document.title = newTitle;
        if (typeof(onSuccess) == "string")
            eval(onSuccess);
        else if (typeof(onSuccess) == "function")
            onSuccess(callbackContextData);
        if (simulateDCL)
            document.dispatchEvent(new Event("DOMContentLoaded"));
    };


    // private internal class
    var Transaction = function (url, postData, timeout, contentElementID, victim, callbackContextData, onSuccess, onFailure)
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
                var err = extractAndUse(xmlhttp.responseText, contentElementID, victim);
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
                simulateDCL: false,

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
                replaceContent: function (target /*ID or DOM element*/, contentURL, contentElementID,
                                          postData, callbackContextData, onSuccess, onFailure,
                                          transitionalContentID /*IGNORED*/, timeout)
                {
                    if (!supported)
                        throw new Error("SPARE cannot operate because browser lacks support");
                    if (typeof(contentURL) != "string" || contentURL.length == 0)
                        throw new Error("SPARE - contentURL is required");
                    var victim;
                    if (target instanceof HTMLElement)
                        victim = target;
                    else
                        victim = document.getElementById(target);
                    if (!victim)
                        throw new Error("SPARE could not find target element '" + target + "'");

                    // Allow the final argument to be timeout if it is numeric, to simulate additional polymorphic signatures.
                    var tmout = timeout;
                    if (arguments.length >= 3 && arguments.length <= 8 && !isNaN(arguments[arguments.length - 1]))
                    {
                        tmout = arguments[arguments.length - 1];
                        switch (arguments.length)
                        {
                            case 3: contentElementID = undefined;       // NO BREAK, fall through
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

                    new Transaction(contentURL, postData, tmout, contentElementID, victim, callbackContextData,
                                    onSuccess || SPARE.onSuccess, onFailure || SPARE.onFailure).start();
                },

                // Like replaceContent but also sets history and title.  No postData support.
                // HANDLER IS REQUIRED for popstate!  No cross-domain contentURL values are allowed
                // due to browser security.  Root-relative URLs are recommended.
                simulateNavigation: function (target, contentURL, contentElementID,
                                              callbackContextData, onSuccess, onFailure,
                                              timeout, newTitle, pretendURL)
                {
                    if (!supported)
                        throw new Error("SPARE is unable to set browser history");
                    if (!initialURL)
                    {
                        initialURL = location.href;
                        initialTitle = document.title;
                    }
                    var ti = target instanceof HTMLElement ? target.id : target;
                    if (!history.state)
{ console.log("]] Replacing state with " + initialURL);
                        history.replaceState({ "startURL":   initialURL,
                                               "startTitle": initialTitle,
                                               "targetID":   ti }, "");
}
                    this.replaceContent(target, contentURL, contentElementID, null, callbackContextData,
                                        function (context) { addHistory(ti, contentURL, contentElementID, newTitle, pretendURL,
                                                                        SPARE.simulateDCL, onSuccess || SPARE.onSuccess, context); },
                                        onFailure, null, timeout);
                },

                // This is a default handler for the popstate event, which can
                // be used with simulateNavigation if nothing fancier is needed, or
                // called by an extended handler to provide the core functionality.
                onPopStateRestore: function (event)
                {
                    if ("state" in event && event.state && "targetID" in event.state && "startURL" in event.state)
                        if ("contentURL" in event.state)  // we are recreating a simulated non-original page state
                        {
                            document.title = event.state.title;
console.log("]] Restoring with " + event.state.contentURL);
                            SPARE.replaceContent(event.state.targetID, event.state.contentURL, event.state.contentElementID, null, event.state);
                            if (SPARE.simulateDCL)
                                document.dispatchEvent(new Event("DOMContentLoaded"));
                            return true;     // return value is ignored when this is used directly
                        }
                        // all other cases are for returning to a page state as originally loaded:
                        else if (event.state.startURL != location.href)     // shouldn't happen?
                        {
                            console.log("[][] SPARE had to reload page because startURL does not match current location.\n" +
                                        "Expected:  " + event.state.startURL + "\n" +
                                        "**Actual:  " + location.href);
console.log("]] Replacing location with " + event.state.startURL);
                            location.replace(event.state.startURL);         // can mess up history in Firefox?
                        }
                        else
                        {
                            document.title = event.state.startTitle;
console.log("]] Resetting to " + event.state.startURL);
                            SPARE.replaceContent(event.state.targetID, event.state.startURL, event.state.targetID, null, event.state);
                            if (SPARE.simulateDCL)
                                document.dispatchEvent(new Event("DOMContentLoaded"));
                            return true;     // ignored when used directly
                        }
                }
            };      // the object literal that will be assigned to the SPARE singleton
}();
