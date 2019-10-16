// This is version 02 of SPARE (Static Page AJAX for Replacing Elements), a JavaScript object.
// Copyright 2015-19 Paul Kienitz, Apache 2.0 license: http://www.apache.org/licenses/LICENSE-2.0

// TODO: Can the fallback code for IE 9 be improved?  If not, strip it out and support IE 10 minimum in next version.

"use strict";              // do not use any language features incompatible with ECMAScript 3
var SPARE = function ()	   // IIFE returns the SPARE singleton object
{
    // private capability flags
    var canDoAjax = false;
    var canUseCreateDoc = false;
    var canFixHistory = false;
    var doStripHead = false;


    // private methods
    var extractAndUse = function (responseText, newElementID, victim)       // returns error message
    {
        // The main code branch here is valid for IE 10 and later.  We have workarounds for IE 9 and IE 8.
        // We support IE 8 because it's the most popular version before IE 11, since it shipped with Windows 7.
        var sideDocument = canUseCreateDoc ? document.implementation.createHTMLDocument("") : null;		// null in IE 8 or earlier
        var newContentDomParent = sideDocument ? sideDocument.documentElement
                                               : document.createElement("div");     // fallback for IE <= 9
        // (Some documentation says IE8 does not have createElement or replaceChild.  It does have them.)

        if (doStripHead)
        {
            // For some browsers, IE 9 in particular, this may be the only way to keep head tags content from
            // getting into the body.  I've tried many alternate approaches with IE 9, and couldn't find a
            // way to avoid the need for this.  Some other old browsers may need this too.  (IE 8 does not.)
            var headhead = responseText.indexOf("<head"), headtail = responseText.indexOf("</head>"), bodhead = responseText.indexOf("<body");
            if (headhead > 0 && headtail > headhead && bodhead > headtail)
                responseText = responseText.substring(0, headhead) + responseText.substring(bodhead);
        }
        newContentDomParent.innerHTML = responseText;
        if (!newElementID)
        {
            // When given a fragment to parse, documentElement generally wraps it in a simulated body tag.  A div does not.
            var body = newContentDomParent.getElementsByTagName("body");
            newContentDomParent = body[0] || newContentDomParent;
        }
        else           // find the named element
        {
            // newer browsers would use newContentDomParent = sideDocument.getElementById(newElementID);
            // ...to support IE7 we would probably need to use newContentDomParent.all.item(newElementID)
            newContentDomParent = newContentDomParent.querySelector("#" + newElementID);
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


    var addHistory = function (elementID, pageURL, newElementID, newTitle, onSuccess, callbackContextData)
    {
        history.pushState({ oldId: elementID, url: pageURL, newId: newElementID, title: newTitle }, newTitle, pageURL);
        if (newTitle)
            document.title = newTitle;      // not all browsers set it in pushState, nor do all restore it in popState
        if (typeof(onSuccess) == "string")
            eval(onSuccess);
        else if (onSuccess)                 // trying to test if it's really a function fails in some browsers
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
                if (xmlhttp.status == 200)              // other "ok" responses are not good enough
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
            else if (onSuccess)    // trying to test if it's really a function fails in some browsers
                onSuccess(callbackContextData);
        };

        var downloadFailed = function (errorNumber, errorText)
        {
            if (typeof(onFailure) == "string")
                eval(onFailure);
            else if (onFailure)    // trying to test if it's really a function fails in some browsers
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


    // initialize the capability flags
    if ("XMLHttpRequest" in window && "getElementById" in document && /*we no longer support IE 7:*/ "querySelector" in document)
    {
        canDoAjax = true;
        if ("implementation" in document && "createHTMLDocument" in document.implementation)
        {
            canUseCreateDoc = true;                     // false for IE 8
            var testMarkup = "<html><head><title>1</title></head><body>2<p></body></html>";
            var testMarkee;
            try {
                testMarkee = document.implementation.createHTMLDocument("").documentElement;
                testMarkee.innerHTML = testMarkup;
            } catch (e) {
                canUseCreateDoc = false;                // false for IE 9, and early Firefox
                testMarkee = document.createElement("div");
                testMarkee.innerHTML = testMarkup;
            }
            if (testMarkee.innerHTML.indexOf("1") >= 0 && testMarkee.innerHTML.toLowerCase().indexOf("<body") < 0)
                doStripHead = true;                     // true for IE 9
        }
        if ("history" in window && "pushState" in history)
            canFixHistory = true;                       // false for IE 9
    }

    // our IIFE result: create the SPARE object accessed by the caller
    return  {
                // global defaulting values settable by the caller
                timeout: undefined,
                transitionalContentID: undefined,   // retained for 01 API compatibility only
                onSuccess: null,
                onFailure: null,

                // public methods
                supportLevel: function ()
                {
                    if (!canDoAjax)
                        return 0;                   // SPARE will not work at all (IE 7 now returns this)
                    else
                        return 2;                   // it's good to go (we no longer return levels 1 or 3)
                },

                // History handling can't fit into the existing supportLevel ranks.
                canSimulateNavigation: function ()
                {
                    return canFixHistory;
                },

                // Our core method - see https://github.com/paulkienitz/SPARE/blob/master/README.md for how to use.
                replaceContent: function (elementID, pageURL, newElementID, postData,
                                          callbackContextData, onSuccess, onFailure,
                                          transitionalContentID /*DEPRECATED*/, timeout)
                {
                    if (!canDoAjax)
                        throw new Error("SPARE cannot operate because browser lacks support");
                    if (typeof(pageURL) != "string" || pageURL.length == 0)
                        throw new Error("SPARE - pageURL is required");
                    var victim = document.getElementById(elementID);
                    if (!victim)
                        throw new Error("SPARE could not find target element '" + elementID + "'");

                    // Allow the final argument to be timeout if it is numeric, to simulate additional polymorphic signatures.
                    var tmout = timeout;		// separate var in case this is an ancient browser that ignores "use strict"
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

                    var tranny = new Transaction(pageURL, postData, tmout, newElementID, victim, callbackContextData,
                                                 onSuccess || SPARE.onSuccess, onFailure || SPARE.onFailure);
                    if (!transitionalContentID)
                        transitionalContentID = SPARE.transitionalContentID;
                    if (transitionalContentID)
                    {
                        var tron = document.getElementById(transitionalContentID);
                        if (tron && tron.innerHTML)
                            victim.innerHTML = tron.innerHTML;
                    }
                    tranny.start();     // wait until now to avoid risk of a race... but that makes errors unrecoverable if you use transitionalContentID
                },

                // Like replaceContent but also sets history and title.  No postData support.  HANDLER IS REQUIRED for popstate!
                // No cross-domain pageURL values are allowed due to browser security.  Root-relative URLs are recommended.
                simulateNavigation: function (elementID, pageURL, newElementID,
                                              callbackContextData, onSuccess, onFailure,
                                              timeout, newTitle)
                {
                    if (!canFixHistory)
                        throw new Error("SPARE is unable to set browser history");
                    this.replaceContent(elementID, pageURL, newElementID, null, callbackContextData,
                                        function (context) { addHistory(elementID, pageURL, newElementID, newTitle,
                                                                        onSuccess || SPARE.onSuccess, context); },
                                        onFailure, null, timeout);
                },

                // This is a default handler for the popstate event, which can
                // be used with simulateNavigation if nothing fancier is needed, or
                // called by an extended handler to provide the core functionality.
                onPopStateRestore: function (event)
                {
                    if (event.state && "url" in event.state)
                    {
                        SPARE.replaceContent(event.state.oldId, event.state.url, event.state.newId);
                        document.title = event.state.title;           // just in case browser didn't already do this
                    }
                }
            };      // the object literal that will be assigned to the SPARE singleton
}();
