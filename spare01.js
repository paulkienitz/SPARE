// This is version 01 of the SPARE framework, which supports Static Page AJAX
// for Replacing Elements.  By Paul Kienitz, distributable under Attribution
// Share-Alike terms, per http://creativecommons.org/licenses/by-sa/4.0/

// TODO: move callback context param before hooks, give both hooks a global default
//       test timeout (PHP sleep?)
//       test new gotHTML and body fallbacks -- make sure path coverage is complete
//       use try-catch when invoking callbacks
//       try old firefox versions

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
                // This test will succeed in current browsers implementing the latest standards.
                // One case that doesn't work is IE 10 in fragment mode -- it wants complete HTML.
                // We have to detect that case before issuing the request, to avoid bombing here.
                if (xmlhttp.responseType == "document" && xmlhttp.responseXML
                    && (this.documentFragmentMode || xmlhttp.responseXML.getElementById))
                {
                    gotHTML = true;
                    if (this.documentFragmentMode)      // some browsers wrap fragments in simulated <html> and <body> tags
                        newContentDomParent = xmlhttp.responseXML.getElementsByTagName("body")[0] || xmlhttp.responseXML;
                    else
                        newContentDomParent = xmlhttp.responseXML.getElementById(newElementID);
                }
                // This fallback approach works in many browsers that can't handle the first option.
                // In some cases, this path is only available if responseType is initialized to "text".
                if (!newContentDomParent && xmlhttp.responseText)
                {
                    if (this.documentFragmentMode)
                    {
                        // This works in everything I've tested back to IE 7.
                        newContentDomParent = document.createElement("div");
                        newContentDomParent.innerHTML = xmlhttp.responseText;
                        gotHTML = true;
                        // Some browsers may wrap the fragment in a fake body.
                        newContentDomParent = newContentDomParent.getElementsByTagName("body")[0] || newContentDomParent;
                    }
                    else           // expect a complete page, find the named element
                    {
                        // This works in older mobile browsers, and in IE 8-10, but IE 7 has no querySelector.
                        var cage = document.createElement("div");
                        cage.innerHTML = xmlhttp.responseText;
                        gotHTML = true;
                        newContentDomParent = cage.querySelector("#" + newElementID);
                    }
                }
                else       // this might happen if the URL points to non-textual data?
                {
                    newElementID = null;    // take the "could not interpret" path below
                }
                if (!gotHTML)
                {
                    this.fakeErrorNumber = -2;
                    this.fakeErrorText = "SPARE could not interpret the content of " + url + " as HTML";
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

    var Transaction = function (url, postData, timeout, extractor, onSuccess, onFailure, hookData)
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
                exec(onFailure);
            else if (typeof(onFailure) == "function")
                onFailure(hookData, errorNumber, errorText);
            else
                window.location.href = url;
        };

        var downloadSucceeded = function ()
        {
            if (extractor.extractAndUse(xmlhttp))
            {
                if (typeof(onSuccess) == "string")
                    exec(onSuccess);
                else if (typeof(onSuccess) == "function")
                    onSuccess(hookData);
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
        xmlhttp.open(verb, url, true);
        if (canUseResponseXML && (canOverrideMimeType || !extractor.documentFragmentMode))
        {          // heuristic: IE 10 cannot use responseXML in fragment mode ^^^
            xmlhttp.responseType = "document";
            if (canOverrideMimeType)
                xmlhttp.overrideMimeType("text/html");
        }
        else
            xmlhttp.responseType = "text";
    };                    // Transaction


    // initialize the capability flags
    if (window.XMLHttpRequest && document.getElementById)
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
            try
            {
                xhr.responseType = "document";   // under modern rules, setting this is forbidden when synchronous
            }
            catch (e)
            {
                canUseResponseXML = true;         // heuristic: support for HTML in responseXML goes with the above rule
            }
    }

    // create the SPARE object accessed by the caller
    return  {
                // global defaulting values settable by the caller
                timeout: 30,
                transitionalContentID: "",

                // undocumented exposure of semiprivate goodies, for those who read the source
                makeTransaction: function (url, postData, timeout, extractor, onSuccess, onFailure, hookData)
                {
                    return new Transaction(url, postData, timeout, extractor, onSuccess, onFailure, hookData);
                },

                makeResultExtractor: function (newElementID, victim)
                {
                    return new ResultExtractor(newElementID, victim);
                },

                // public methods
                supportLevel: function ()
                {
                    if (!canDoAJAX)
                        return 0;	            // SPARE will not work at all
                    else if (canUseResponseXML && canOverrideMimeType)
                        return 3;	            // the browser appears to support current standards
                    else if (canUseQuerySelector)
                        return 2;                   // the browser is modern enough so SPARE should work
                    else
                        return 1;                   // SPARE can implement fragment downloads only (no newElementID)
                },

                // Our principal method - see https://github.com/paulkienitz/SPARE/blob/master/README.md for how to use.
                replaceContent: function (elementID, pageURL, newElementID, postData,
                                          onSuccess, onFailure, onSuccessFailureData,
                                          transitionalContentID, timeout)
                {
                    if (!canDoAJAX || (newElementID && !canUseQuerySelector && !canUseResponseXML))
                        throw new Error("SPARE cannot operate; supportLevel is " + (canDoAJAX ? 1 : 0));
                    if (typeof(pageURL) != "string" || pageURL.length == 0)
                        throw new Error("SPARE - pageURL is required");
                    var victim = document.getElementById(elementID);
                    if (!victim)
                        throw new Error("SPARE could not find target element '" + elementID + "'");

                    if (!transitionalContentID)
                        transitionalContentID = SPARE.transitionalContentID;
                    if (isNaN(timeout) && !isNaN(SPARE.timeout))
                        timeout = SPARE.timeout;
                    if (isNaN(timeout) || timeout < 1 || timeout > 3600)
                        timeout = null;

                    var extractor = new ResultExtractor(newElementID, victim);
                    var tranny = new Transaction(pageURL, postData, timeout, extractor,
                                                 onSuccess, onFailure, onSuccessFailureData);
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
