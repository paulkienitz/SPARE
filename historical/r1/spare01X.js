// THIS IS AN INSTRUMENTED VERSION, INTENDED FOR DEVELOPMENT USE.

// This is version 01 of SPARE (Static Page AJAX for Replacing Elements), a JavaScript object.
// Copyright 2015 Paul Kienitz, Apache 2.0 license: http://www.apache.org/licenses/LICENSE-2.0

// TODO: continue to look for ways to improve the initial capabilities test
//       ...make console.warn temporarily a no-op?
//
// TESTS: Chrome/W: good, Chrome/A: good, Firefox: good, Safari 10/M: no U*, Safari 11/i: no U*,
//        Edge 16: no U, IE11: head leak! no U, IE10/em: head leak! no U (like 11), IE9/em: head leak! no U no F no bad,
//        IE8/em: no U no F no bad, IE8/real: no U no F no bad, IE7/em: frag only no post no bad, IE 5/em: like 7.
// Notes on tests: timeout bug rolled back, objects were permitted for postData (no Safari fix), extractAndUse unchanged from release version.
// (Outcomes: no U means URLSearchParams not supported; no F means FormData not supported; no post means postData not supported;
// frag only means newElementID param not supported; no bad means it failed to parse intentionally bad HTML; head leak! means
// attempting to load body content unintentionally included stylesheets from head tag.  * Safari works in SPARE 2.)

var SPARE = function ()
{
    // private variables
    var canDoAJAX = false;
    var canUseResponseXML = false;
    var canUseQuerySelector = false;
    var canOverrideMimeType = false;
    var canFixHistory = false;
    var pathUsed = 0;
    var progress = 0;

    // private classes (semi-private in 1.0)
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
            progress = 13;
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
                    progress = 14;
                    pathUsed += 2000;
                    if (this.documentFragmentMode)
                    {
                        // some browsers wrap fragments in simulated <html> and <body> tags
                        var body = xmlhttp.responseXML.getElementsByTagName("body");
                        newContentDomParent = body[0] || xmlhttp.responseXML;
                        pathUsed += body[0] ? 4000 : 2000;      // covered with body[0]
                    }
                    else
                    {
                        newContentDomParent = xmlhttp.responseXML.getElementById(newElementID);
                        pathUsed += 1000;       // covered
                    }
                    progress = 15;
                }
                progress = 16;
                // This approach works in many browsers that can't handle the first option.
                if (!newContentDomParent && useText)
                {
                    if (useDocument)
                        pathUsed += 1000000;
                    if (this.documentFragmentMode)
                    {
                        progress = 17;
                        pathUsed += 40000;
                        // This works in everything I've tested back to IE 7, even on invalid HTML.
                        newContentDomParent = document.createElement("div");
                        newContentDomParent.innerHTML = xmlhttp.responseText;
                        gotHTML = true;
                        // Some browsers might wrap the fragment in a fake body.
                        var body = newContentDomParent.getElementsByTagName("body");
                        newContentDomParent = body[0] || newContentDomParent;
                        pathUsed += body[0] ? 20000 : 10000;    // covered without body[0]
                    }
                    else           // expect a complete page, find the named element
                    {
                        progress = 18;
                        pathUsed += 20000;
                        // This works in Safari <8 and pre-kitkat Android, and in IE 8-10, but IE 7 has no querySelector.
                        var cage = document.createElement("div");
                        cage.innerHTML = xmlhttp.responseText;
                        gotHTML = true;
                        newContentDomParent = cage.querySelector("#" + newElementID);
                        pathUsed += 10000;              // covered
                    }
                }
                if (!gotHTML)
                {
                    progress = useText ? 20 : 19;       // covered without useText
                    this.fakeErrorNumber = -2;
                    this.fakeErrorText = "SPARE could not interpret the content of " + xmlhttp.ourUrl + " as HTML";
                    return false;
                }
                else if (!newContentDomParent && newElementID)
                {
                    progress = useText ? 22 : 21;       // covered without useText
                    this.fakeErrorNumber = -1;
                    this.fakeErrorText = "SPARE could not find element '" + newElementID + "' in downloaded content";
                    return false;
                }
                // We have usable DOM content!
                progress = 23;
                while (victim.firstChild)
                    victim.removeChild(victim.firstChild);
                while (newContentDomParent.firstChild)
                    victim.appendChild(newContentDomParent.firstChild);
                // Note that if you specify no newElementID, but the data in newContentDomParent
                // is a complete HTML document, then in Chrome and FF the above loop would throw
                // an exception because they refuse to put an <html> tag inside another page.
                // This is why we selected the <body> tag in these cases.
                progress = 24;
                return true;
            }
            catch (e)
            {
                progress = 25;
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
            progress = 26;
            pathUsed += 100000;
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
                pathUsed += 500;
                if (typeof(postData) == "string")
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
            else if (onFailure)    // trying to test if it's really a function fails in some browsers
                onFailure(callbackContextData, errorNumber, errorText);
            else
                window.location.href = url;
        };

        var downloadSucceeded = function ()
        {
            if (extractor.extractAndUse(xmlhttp))
            {
                progress = 30;
                if (typeof(onSuccess) == "string")
                    eval(onSuccess);
                else if (onSuccess)
                    onSuccess(callbackContextData);
            }
            else
            {
                progress += 50;
                downloadFailed(extractor.fakeErrorNumber, extractor.fakeErrorText);
            }
        };

        var stateChangedHandler = function ()
        {
            if (xmlhttp.readyState == 4 && !aborted)
            {
                progress = 10;
                clearTimeout(timer);
                if (xmlhttp.status == 200)
                {
                    progress = 11;
                    downloadSucceeded();
                }
                else
                {
                    progress = 12;
                    downloadFailed(xmlhttp.status, xmlhttp.statusText);
                }
            }
        };

        // initialize xmlhttp
        if (typeof(postData) == "string" || typeof(postData) == "object")
            verb = "POST";
        // TODO: accept string->string associative array as postData, and format it
        xmlhttp.onreadystatechange = stateChangedHandler;
        xmlhttp.ourUrl = url;
        xmlhttp.open(verb, url, true);
        if (canUseResponseXML && (canOverrideMimeType || !extractor.documentFragmentMode))
        {          // if we set canUseResponseXML for IE 10, ^^^ it still can't handle fragment mode
            xmlhttp.responseType = "document";
            pathUsed = 200;         // covered
            if (canOverrideMimeType)
            {
                xmlhttp.overrideMimeType("text/html");
                pathUsed = 300;     // covered
            }
        }
        else
        {
            xmlhttp.responseType = "text";
            pathUsed = 100;         // covered
        }
    };                    // Transaction


    // initialize the capability flags
    if ("XMLHttpRequest" in window && "getElementById" in document)
    {
        canDoAJAX = true;
        if (document.querySelector)         // false for IE <= 7 and IE compatibility view,
            canUseQuerySelector = true;     // which means that only fragment mode is supported
        var xhr = new XMLHttpRequest();
        // Can we avoid the async test?  It emits a console warning on good browsers.
        // TODO: redirect console.warn or something?
        xhr.open("GET", window.location.href, false);   // synchronous
        if (xhr.overrideMimeType)           // false for IE <= 11
            try
            {
                xhr.overrideMimeType("text/html");
                canOverrideMimeType = true;
            }
            catch (e) { }
        if (canUseQuerySelector)
            // I don't like this test because it can produce console warnings in good browsers.
            // But I can't find any other approach that doesn't produce false positives for
            // browsers such as Safari and Opera.  TODO: redirect console.warn or something?
            try
            {
                xhr.responseType = "document";    // under modern rules, setting this is forbidden when synchronous
            }
            catch (e)
            {
                canUseResponseXML = true;         // heuristic: support for HTML in responseXML goes with the above rule
            }
        // TODO: restore console warn here
        if (history && history.pushState)
            canFixHistory = true;
    }
    progress = 1;

    // create the SPARE object accessed by the caller
    return  {
                // global defaulting values settable by the caller
                timeout: null,
                transitionalContentID: null,		// SEMI-DEPRECATED
                onSuccess: null,
                onFailure: null,
/*
                // undocumented exposure of semiprivate goodies, for those who read the source
                makeTransaction: function (url, postData, timeout, extractor, callbackContextData, onSuccess, onFailure)
                {
                    return new Transaction(url, postData, timeout, extractor, callbackContextData, onSuccess, onFailure);
                },

                makeResultExtractor: function (newElementID, victim)
                {
                    return new ResultExtractor(newElementID, victim);
                },
*/

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

                // History handling can't fit into the existing supportLevel ranks.
                canSimulateNavigation: function ()
                {
                    return canFixHistory;
                },

                // instrumentation for testing
                pathAndProgress: function ()
                {
                    return pathUsed + progress;
                },

                // Our core method - see https://github.com/paulkienitz/SPARE/blob/master/README.md for how to use.
                replaceContent: function (elementID, pageURL, newElementID, postData,
                                          callbackContextData, onSuccess, onFailure,
                                          transitionalContentID /*SEMI-DEPRECATED*/, timeout)
                {
                    progress = 2;
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
                    if (isNaN(timeout) || timeout <= 0 || timeout > 3600)
                        timeout = null;

                    // OPTIONAL: we could set canUseResponseXML for IE 10 or 11 here, by testing for
                    // document.body.style.msTouchAction or the like... I don't because I've found
                    // it's too fragile when it encounters content that isn't complete and valid HTML.

                    var extractor = new ResultExtractor(newElementID, victim);
                    progress = 5;
                    var tranny = new Transaction(pageURL, postData, timeout, extractor,
                                                 callbackContextData, onSuccess, onFailure);
                    progress = 6;
                    if (transitionalContentID)
                    {
                        var tron = document.getElementById(transitionalContentID);
                        if (tron && tron.innerHTML)
                        {
                            victim.innerHTML = tron.innerHTML;
                            progress = 7;
                        }
                    }
                    tranny.start();     // wait until now just to avoid remote risk of a race
                    progress = 8;
                },

                // Like replaceContent but also sets history and title.  No postData support.
                // No title change without a newElementId.
                simulateNavigation: function (elementID, pageURL, newElementID,
                                              callbackContextData, onSuccess, onFailure,
                                              transitionalContentID, timeout)
                {
                    // XXX  WRITE THIS
                }
            };                    // the SPARE global object
}();
