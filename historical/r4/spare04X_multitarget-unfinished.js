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

// NODO:  TEST multistep back bridging full nav.  Would it be fixable by storing initial url
//        >>>>>  LOOP over known areas on every popstate?     >>>>>  HOW handle nested areas?
//        call addHistory BEFORE replaceContent?  DID NOT HELP.

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
    var sequence = 0;
    var targetsReplaced = {};    // replace with Map in modern version
    var targetCount = 0;

    // semiprivate subclass
    var Replacement = function (targetID, contentURL, contentElementID, order)
    {
        this.targetID = targetID;
        this.contentURL = contentURL;
        this.contentElementID = contentElementID;
        this.order = order;
        this.when = new Date();
    };
    Replacement.prototype.clone = function ()
    {
        var r = new Replacement(this.targetID, this.contentURL, this.contentElementID, this.order);
        r.when = this.when;
        return r;
    }

    // private methods
    var extractAndUse = function (responseText, contentURL, contentElementID, victim)       // returns error message or "" for success
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

        targetsReplaced[victim.id] = new Replacement(victim.id, contentURL, contentElementID, ++sequence);
        // XXX ******** TODO: identify any already registered replacements that this is inside of? *****
        //              ... also look for ones that were inside the stuff we're replacing?
        countTargets();
        var placeholder = document.createElement(victim.tagName);
        victim.parentNode.replaceChild(placeholder, victim);		// do the loops while detached from the dom, for performance
        while (victim.lastChild)
            victim.removeChild(victim.lastChild);
        while (newContentDomParent.firstChild)
            victim.appendChild(newContentDomParent.firstChild);
        placeholder.parentNode.replaceChild(victim, placeholder);
        return "";
    };

    var countTargets()
    {
        targetCount = 0;
        for (var t in targetsReplaced)
            ++targetCount;
    }

    var doCallback(cb, param)
    {
        if (typeof(cb) == "string")
            eval(cb);
        else if (typeof(cb) == "function")
            cb(param);
    }

    var addHistory = function (elementID, pageURL, newElementID, newTitle, pretendURL, simulateDCL, onSuccess, callbackContextData)
    {
        var state = targetsReplaced[elementID].clone();
        // add fields for pretence and starting state:
        state.pretendURL = pretendURL || null;
        state.newTitle      = newTitle || null;
        state.startURL   = initialURL;
        state.startTitle = initialTitle;
        // until we go to promises, let's maintain compatibility with bad legacy field names:
        state.oldId   = state.targetID;
        state.url     = state.contentURL;
        state.newID   = state.contentElementID;
        state.title   = state.newTitle;
        state.showURL = state.pretendURL;

        // this truncates any previous forward history, embarking on a new alternate timeline in which George W Bush somehow became president
        history.pushState(state, "", pretendURL || pageURL);
        if (newTitle)
            document.title = newTitle;
        doCallback(onSuccess, callbackContextData);
        if (simulateDCL)
            dcl();
    };

    var dcl = function ()
    {
        document.dispatchEvent(new Event("DOMContentLoaded"));
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
                var err = extractAndUse(xmlhttp.responseText, url, newElementID, victim);
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
            doCallback(onSuccess, callbackContextData);   // in simulateNavigation, this calls addHistory
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
                fullRestoreThreshold: 1,
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
                replaceContent: function (elementID /*or target element*/, pageURL, newElementID,
                                          postData, callbackContextData, onSuccess, onFailure,
                                          transitionalContentID /*IGNORED*/, timeout)
                {
                    if (!supported)
                        throw new Error("SPARE cannot operate because browser lacks support");
                    if (typeof(pageURL) != "string" || pageURL.length == 0)
                        throw new Error("SPARE - pageURL is required");
                    var victim;
                    if (elementID instanceof HTMLElement)
                        victim = elementID;
                    else
                        victim = document.getElementById(elementID);
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
                    if (!initialURL)
                    {
                        initialURL = location.href;
                        initialTitle = document.title;
                    }
                    var ti = elementID instanceof HTMLElement ? elementID.id : elementID;
                    if (!history.state)
                        history.replaceState({ "startURL":   initialURL,
                                               "startTitle": initialTitle,
                                               "targetID":   ti }, "");
                    this.replaceContent(elementID, pageURL, newElementID, null, callbackContextData,
                                        function (context) { addHistory(ti, pageURL, newElementID, newTitle, pretendURL,
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
                            // ***** XXX TODO: check whole targets list in case of multi-step jumps.....
                            // The hard case is when multistep jumps also involve multiple targets.  In that case, what we have to do is
                            // identify which history state we are jumping from, and all the history states that fall between that one and this,
                            // and for each different target ID, restore the state closest to the current one in whichever direction we're going.
                            // These would be implemented as multiple simultaneous transactions with some kind of wait-all to fire the success stuff.
                            // It gets worse: even for single back hops we may have to revert the tab we are leaving to a state that may be older
                            // than our own, and recognize that the popped state for the current target involves no change.
                            document.title = event.state.title;
                            SPARE.replaceContent(event.state.targetID, event.state.contentURL, event.state.contentElementID, null, event.state);
                            if (SPARE.simulateDCL)
                                dcl();
                            return true;     // return value ignored when this is used directly as handler
                        }
                        // all other cases are for returning to a page state as originally loaded:
                        else if (event.state.startURL != location.href)     // shouldn't happen?
                        {
                            console.log("=== SPARE had to reload initial page because assumed URL does not match current location, or target is missing." +
                                        "\nPretend URL:  " + event.state.pretendURL + "\nInitial URL:  " + event.state.startURL +
                                        "\n*Actual URL:  " + location.href + "\n- Target ID:  " + event.state.targetID);
alert("AAAAAAARRRRRGGH\nexpected: " + (event.state.pretendURL || event.state.startURL) + "\n**actual: " + location.href);
                            location.replace(event.state.startURL);
                        }
                        else if (targetCount <= SPARE.fullRestoreThreshold)
                        {
                            document.title = event.state.startTitle;
                            // XXX TODO: when targets are nested work from outside in *********************************************
                            for (var t in targetsReplaced)
                                SPARE.replaceContent(t, event.state.startURL, t, null, event.state,
                                                     function () { /* XXX ***** update targetsReplaced[t] */;
                                                                   doCallback(SPARE.onSuccess, event.state); });
                            if (SPARE.simulateDCL)
                                dcl();
                            return true;     // ignored when used directly
                        }
                        else
                            location.reload();
                },

                // Returns an array of all target IDs updated since the last full refresh.
                /* targetIDs: function ()
                {
                    var t = [];
                    for (var k in targetsReplaced)
                        t.push(k);
                    return t;
                }, */

                currentReplacements: function ()
                {
                    var t = {};
                    for (var k in targetsReplaced)    // clone the whole collection
                        t[k] = targetsReplaced[k].clone();
                    return t;
                }
            };      // the object literal that will be assigned to the SPARE singleton
}();
