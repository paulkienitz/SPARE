// This is version 01 of SPARE (Static Page AJAX for Replacing Elements), a JavaScript object.
// Copyright 2015 Paul Kienitz, Apache 2.0 license: http://www.apache.org/licenses/LICENSE-2.0

// TODO: add form encoder for release 02

var SPARE = function ()
{
    // private variables
    var canDoAJAX = false;
    var canUseResponseXML = false;
    var canUseQuerySelector = false;
    var canOverrideMimeType = false;

    // semi-private classes
    var ResultExtractor = function (newElementID, victim)
    {
        // public members
        this.fakeErrorNumber = 0;
        this.fakeErrorText = "";

        this.documentFragmentMode = !newElementID;

        // public methods
        this.extractAndUse = function (xmlhttp)
        {
            var newContentDomParent = null;
            var gotHTML = false;
            try
            {
                var useDocument = false, useText = false;
                // Modern browsers support either responseXML or responseText depending on
                // responseType, and accessing the wrong one throws an exception.  In older
                // browsers, responseType may have no effect, but we try to set it to "text".
                try
                {
                    useDocument = xmlhttp.responseType == "document" && xmlhttp.responseXML
                               && !!(this.documentFragmentMode ? xmlhttp.responseXML.getElementsByTagName : xmlhttp.responseXML.getElementById);
                }
                catch (e) { }
                try
                {
                    useText = xmlhttp.responseType != "document"
                           && xmlhttp.responseText && xmlhttp.responseText.length;
                }
                catch (e) { }
                // IE10 can use this path *if* the content is completely valid HTML; it bombs on fragments.
                if (useDocument)
                {
                    gotHTML = true;
                    if (this.documentFragmentMode)
                    {
                        // some browsers wrap fragments in simulated <html> and <body> tags
                        var body = xmlhttp.responseXML.getElementsByTagName("body");
                        newContentDomParent = body[0] || xmlhttp.responseXML;
                    }
                    else
                        newContentDomParent = xmlhttp.responseXML.getElementById(newElementID);
                }
                // This approach works in many browsers that can't handle the first option.
                if (!newContentDomParent && useText)
                {
                    if (this.documentFragmentMode)
                    {
                        // This works in everything I've tested back to IE 7, even on invalid HTML.
                        newContentDomParent = document.createElement("div");
                        newContentDomParent.innerHTML = xmlhttp.responseText;
                        gotHTML = true;
                        // Some browsers might wrap the fragment in a fake body.
                        var body = newContentDomParent.getElementsByTagName("body");
                        newContentDomParent = body[0] || newContentDomParent;
                    }
                    else           // expect a complete page, find the named element
                    {
                        // This works in Safari and pre-kitkat Android, and in IE 8-10, but IE 7 has no querySelector.
                        var cage = document.createElement("div");
                        cage.innerHTML = xmlhttp.responseText;
                        gotHTML = true;
                        newContentDomParent = cage.querySelector("#" + newElementID);
                    }
                }
                if (!gotHTML)
                {
                    this.fakeErrorNumber = -2;
                    this.fakeErrorText = "SPARE could not interpret the content of " + xmlhttp.ourUrl + " as HTML";
                    return false;
                }
                else if (!newContentDomParent && newElementID)
                {
                    this.fakeErrorNumber = -1;
                    this.fakeErrorText = "SPARE could not find element '" + newElementID + "' in downloaded content";
                    return false;
                }
                // We have usable DOM content!
                while (victim.firstChild)
                    victim.removeChild(victim.firstChild);
                while (newContentDomParent.firstChild)
                    victim.appendChild(newContentDomParent.firstChild);
                // Note that if you specify no newElementID, but the returned data is a
                // complete HTML document, then in Chrome and FF the above loop will throw
                // an exception because they refuse to put an <html> tag inside another page.
                return true;
            }
            catch (e)
            {
                if (!this.fakeErrorNumber)
                    this.fakeErrorNumber = -3;
                this.fakeErrorText = "SPARE caught exception " + e.name + ": " + e.message;
            }
        }
    };                      // ResultExtractor

    var Transaction = function (url, postData, timeout, extractor, callbackContextData, onSuccess, onFailure)
    {
        // private members
        var xmlhttp = new XMLHttpRequest();
        var verb = "GET";
        var aborted = false;
        var timer = null;

        // public methods
        this.abort = function ()
        {
            if (xmlhttp.readyState < 4)
            {
                aborted = true;
                try { xmlhttp.abort(); } catch (e) { }
                downloadFailed(408, "SPARE time limit exceeded");
            }
        };

        this.start = function ()
        {
            if (verb == "POST")
            {
                xmlhttp.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
                xmlhttp.send(postData);
            }
            else
                xmlhttp.send();
            if (timeout)
                timer = setTimeout(this.abort, timeout * 1000);
        };

        // private methods
        var downloadFailed = function (errorNumber, errorText)
        {
            if (typeof(onFailure) == "string")
                eval(onFailure);
            else if (onFailure)    // trying to tell if it's really a function fails in some browsers
                onFailure(callbackContextData, errorNumber, errorText);
            else
                window.location.href = url;
        };

        var downloadSucceeded = function ()
        {
            if (extractor.extractAndUse(xmlhttp))
            {
                if (typeof(onSuccess) == "string")
                    eval(onSuccess);
                else if (onSuccess)
                    onSuccess(callbackContextData);
            }
            else
                downloadFailed(extractor.fakeErrorNumber, extractor.fakeErrorText);
        };

        var stateChangedHandler = function ()
        {
            if (xmlhttp.readyState == 4 && !aborted)
            {
                clearTimeout(timer);
                if (xmlhttp.status == 200)
                    downloadSucceeded();
                else
                    downloadFailed(xmlhttp.status, xmlhttp.statusText);
            }
        };

        // initialize xmlhttp
        if (typeof(postData) == "string")
            verb = "POST";
        xmlhttp.onreadystatechange = stateChangedHandler;
        xmlhttp.ourUrl = url;
        xmlhttp.open(verb, url, true);
        if (canUseResponseXML && (canOverrideMimeType || !extractor.documentFragmentMode))
        {          // if we set canUseResponseXML for IE 10, ^^^ it still can't handle fragment mode
            xmlhttp.responseType = "document";
            if (canOverrideMimeType)
                xmlhttp.overrideMimeType("text/html");
        }
        else
            xmlhttp.responseType = "text";
    };                    // Transaction


    // initialize the capability flags
    if ("XMLHttpRequest" in window && "getElementById" in document)
    {
        canDoAJAX = true;
        if (document.querySelector)         // false for IE <= 7 and IE compatibility view,
            canUseQuerySelector = true;     // which means that only fragment mode is supported
        var xhr = new XMLHttpRequest();
        // Can we avoid the async test?  It emits a console warning on good browsers.
        xhr.open("GET", window.location.href, false);   // synchronous
        if (xhr.overrideMimeType)           // false for IE <= 10
            try
            {
                xhr.overrideMimeType("text/html");
                canOverrideMimeType = true;
            }
            catch (e) { }
        if (canUseQuerySelector)
            // I don't like this test because it can produce console warnings in good browsers.
            // But I can't find any other approach that doesn't produce false positives for
            // browsers such as Safari and Opera.
            try
            {
                xhr.responseType = "document";    // under modern rules, setting this is forbidden when synchronous
            }
            catch (e)
            {
                canUseResponseXML = true;         // heuristic: support for HTML in responseXML goes with the above rule
            }
    }

    // create the SPARE object accessed by the caller
    return  {
                // global defaulting values settable by the caller
                timeout: null,
                transitionalContentID: null,
                onSuccess: null,
                onFailure: null,

                // undocumented exposure of semiprivate goodies, for those who read the source
                makeTransaction: function (url, postData, timeout, extractor, callbackContextData, onSuccess, onFailure)
                {
                    return new Transaction(url, postData, timeout, extractor, callbackContextData, onSuccess, onFailure);
                },

                makeResultExtractor: function (newElementID, victim)
                {
                    return new ResultExtractor(newElementID, victim);
                },

                // public methods
                supportLevel: function ()
                {
                    if (!canDoAJAX)
                        return 0;                   // SPARE will not work at all
                    else if (canUseResponseXML && canOverrideMimeType)
                        return 3;                   // the browser appears to support current standards
                    else if (canUseQuerySelector)
                        return 2;                   // the browser is modern enough so SPARE should work
                    else
                        return 1;                   // SPARE can implement fragment downloads only (no newElementID)
                },

                // Our principal method - see https://github.com/paulkienitz/SPARE/blob/master/README.md for how to use.
                replaceContent: function (elementID, pageURL, newElementID, postData,
                                          callbackContextData, onSuccess, onFailure,
                                          transitionalContentID, timeout)
                {
                    if (!canDoAJAX || (newElementID && !canUseQuerySelector && !canUseResponseXML))
                        throw new Error("SPARE cannot operate; supportLevel is " + (canDoAJAX ? 1 : 0));
                    if (typeof(pageURL) != "string" || pageURL.length == 0)
                        throw new Error("SPARE - pageURL is required");
                    var victim = document.getElementById(elementID);
                    if (!victim)
                        throw new Error("SPARE could not find target element '" + elementID + "'");

                    if (!onSuccess)
                        onSuccess = SPARE.onSuccess;
                    if (!onFailure)
                        onFailure = SPARE.onFailure;
                    if (!transitionalContentID)
                        transitionalContentID = SPARE.transitionalContentID;
                    if (isNaN(timeout) && !isNaN(SPARE.timeout))
                        timeout = SPARE.timeout;
                    if (isNaN(timeout) || timeout < 1 || timeout > 3600)
                        timeout = null;

                    // OPTIONAL: we could set canUseResponseXML for IE 10 here, by testing for
                    // document.body.style.msTouchAction or the like... I don't because I've found
                    // it's too fragile when it encounters content that isn't complete and valid HTML.

                    var extractor = new ResultExtractor(newElementID, victim);
                    var tranny = new Transaction(pageURL, postData, timeout, extractor,
                                                 callbackContextData, onSuccess, onFailure);
                    if (transitionalContentID)
                    {
                        var tron = document.getElementById(transitionalContentID);
                        if (tron && tron.innerHTML)
                            victim.innerHTML = tron.innerHTML;
                    }
                    tranny.start();     // wait until now just to avoid remote risk of a race
                }
            };                    // the SPARE global object
}();
