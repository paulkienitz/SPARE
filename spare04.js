// This is version 4 of SPARE (Static Page AJAX for Replacing Elements), a JavaScript object.

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


// In this version we retain compatibility with SPARE 3, but extend our popstate support,
// and begin incorporating features planned for an incompatible promise-based module.

"use strict";              // do not use any language features incompatible with ECMAScript 3
var SPARE = function ()	   // IIFE returns the SPARE singleton object
{
    // private properties -- for thread safety, these are read-only after initialization
    var initialURL;
    var initialTitle;

    // private functions
    var validate = function(supported, target, contentURL)    // returns target DOM element if it doesn't throw
    {
        if (!supported)
            throw new Error("SPARE cannot operate because browser lacks support");
        if (!contentURL || typeof(contentURL) !== "string")
            throw new Error("SPARE - contentURL is required");
        if (target instanceof HTMLElement)
            return target;
        if (!target)
            throw new Error("SPARE - target is required");
        var victim = document.getElementById(target);
        if (!victim)
            throw new Error("SPARE could not find target element '" + target + "'");
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
                      startTitle :      initialTitle || null,
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

    var Reactor = function (callbackContextData, onSuccess, onFailure, historyAdder, eventFirer)
    {
        this.succeed = function ()
        {
            if (historyAdder)
                historyAdder.add();
            if (typeof(onSuccess) === "string")
                eval(onSuccess);
            else if (typeof(onSuccess) === "function")
                onSuccess(callbackContextData);
            if (eventFirer)
                eventFirer.fire();
        };
        this.fail = function (errorNumber, errorText)
        {
            if (typeof(onFailure) === "string")
                eval(onFailure);
            else if (typeof(onFailure) === "function")
            {
                if (!errorText && errorNumber > 0)   // for http2
                    errorText = "HTTP status " + errorNumber;
                onFailure(callbackContextData, errorNumber, errorText);
            }
            else
                window.location.href = contentURL;
        };
    }

    var Retriever = function (contentURL, postData, timeout, contentElementID, victim, reactor)
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
            aborted = true;
            if (xmlhttp && xmlhttp.readyState < 4)
            {
                try { xmlhttp.abort(); } catch (e) { }
                reactor.fail(408, "SPARE time limit exceeded");
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
                    reactor.fail(xmlhttp.status, xmlhttp.statusText);
            }
        };

        var downloadSucceeded = function (xmlhttp)
        {
            try
            {
                var err = extractAndUse(xmlhttp.responseText, contentElementID, victim);
                if (err)
                {
                    reactor.fail(-1, err);
                    return;
                }
            }
            catch (e)    // unlikely
            {
                reactor.fail(-3, "SPARE caught exception " + e.name + ": " + e.message);
                return;
            }
            // no try/catch on this:
            reactor.succeed();
        };

        // initialize xmlhttp
        xmlhttp = new XMLHttpRequest();
        xmlhttp.onreadystatechange = stateChangedHandler;
        xmlhttp.ourUrl = contentURL;
        xmlhttp.open(typeof postData === "string" || (postData !== null && typeof postData === "object") ? "POST" : "GET", contentURL, true);
        xmlhttp.responseType = "text";
    };      // class Retriever


    // load-time initialization -- validate that we have browser support, and save initial location
    var supported = "XMLHttpRequest" in window && "querySelector" in document &&
                    "history" in window && "pushState" in history &&
                    "implementation" in document && "createHTMLDocument" in document.implementation;
    // minimum browser versions are from 2010-12: IE 10, Firefox 4, Chrome 5, Safari 5
    // (Firefox may have to be a bit later than 4 to be reliable?)

    if (!initialURL)
    {
        initialURL = location.href;
        initialTitle = document.title;
    }

    // our IIFE result: create the SPARE object accessed by the caller
    return  {
                // global defaulting values settable by the caller
                timeout: undefined,
                transitionalContentID: undefined,   // IGNORED - present for release 1 API compatibility only
                onSuccess: undefined,
                onFailure: undefined,
                simulateDCL: false,

                // public methods
                supportLevel: function ()           // format retained for release 1 API compatibility
                {
                    if (!supported)
                        return 0;                   // SPARE will not work at all (IE 9 now returns this)
                    else
                        return 2;                   // it's good to go (we no longer return levels 1 or 3)
                },

                // History handling formerly couldn't fit into the existing supportLevel ranks.
                canSimulateNavigation: function ()
                {
                    return supported;
                },

                // Our core method - see https://github.com/paulkienitz/SPARE/blob/master/README.md for how to use.
                replaceContent: function (target /*ID or DOM element*/, contentURL, contentElementID,
                                          postData, callbackContextData, onSuccess, onFailure,
                                          transitionalContentID /*IGNORED*/, timeout)
                {
                    var victim = validate(supported, target, contentURL);    // throws if no victim found

                    // Allow the final argument to be timeout if it is numeric, to simulate additional polymorphic signatures.
                    if (arguments.length >= 3 && arguments.length <= 8 && !isNaN(arguments[arguments.length - 1]))
                    {
                        timeout = arguments[arguments.length - 1];
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
                    timeout = normalizeTimeout(timeout, SPARE.timeout);

                    var reactor = new Reactor(callbackContextData, onSuccess || SPARE.onSuccess,
                                              onFailure || SPARE.onFailure, null, null);
                    var retriever = new Retriever(contentURL, postData, timeout, contentElementID, victim, reactor);
                    retriever.start();
                },

                // Like replaceContent but also sets history and title.  No postData support.
                // HANDLER IS REQUIRED for popstate!  No cross-domain contentURL values are allowed
                // due to browser security.  Root-relative URLs are recommended.
                simulateNavigation: function (target, contentURL, contentElementID,
                                              callbackContextData, onSuccess, onFailure,
                                              timeout, newTitle, pretendURL)
                {
                    var victim = validate(supported, target, contentURL);    // throws if no victim found
                    timeout = normalizeTimeout(timeout, SPARE.timeout);

                    var eventFirer = new EventFirer(SPARE.simulateDCL);
                    var historyAdder = new HistoryAdder(victim.id, contentURL, contentElementID, newTitle, pretendURL);
                    historyAdder.checkBehind();
                    var reactor = new Reactor(callbackContextData, onSuccess || SPARE.onSuccess,
                                              onFailure || SPARE.onFailure, historyAdder, eventFirer);

                    var retriever = new Retriever(contentURL, null, timeout, contentElementID, victim, reactor);
                    retriever.start();
                },

                // This is a default handler for the popstate event, which can
                // be used with simulateNavigation if nothing fancier is needed, or
                // called by an extended handler to provide the core functionality.
                onPopStateRestore: function (event)
                {
                    if ("state" in event && event.state && "targetID" in event.state && "startURL" in event.state)
                    {
                        var eventFirer = new EventFirer(SPARE.simulateDCL);
                        var reactor = new Reactor(event.state, SPARE.onSuccess, SPARE.onFailure, null, eventFirer);
                        var victim = document.getElementById(event.state.targetID);
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
                            new Retriever(event.state.contentURL, null, SPARE.timeout, event.state.contentElementID, victim, reactor).start();
                            document.title = event.state.title;
                            return true;     // return value is ignored when this is used directly
                        }
                        else                                       // we are returning to a page state as originally loaded
                        {
                            new Retriever(event.state.startURL, null, SPARE.timeout, event.state.targetID, victim, reactor).start();
                            document.title = event.state.startTitle;
                            return true;     // ignored when used directly
                        }
                    }
                }
            };      // the object literal that will be assigned to the SPARE singleton
}();
