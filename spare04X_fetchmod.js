// This is version 04 of SPARE (Static Page AJAX for Replacing Elements), a JavaScript object.
// Copyright 2015-21 Paul Kienitz, Apache 2.0 license: http://www.apache.org/licenses/LICENSE-2.0
// In this version we embrace modern features.  We ignore XHR in favor of fetch, and are an ES6 module.
// Browsers have to be pretty up-to-date to support this version, like 2018 or newer.

// TODO: Compare performance on slow devices to Spare 2 and Spare 1?
//       INVESTIGATE unhandledrejection event.
//       Add hook to edit downloaded text as string before putting it in the dom?
//
// TESTS: Chrome/W: good, Chrome/A: good, Firefox Q69: good, Safari 10/M: good, Safari 11/i: good,
//        Edge 16: no URLSearchParams, Firefox 56: fails, IE11: fails as expected.

export var SPARE = function ()	   // IIFE returns the SPARE singleton object, which is our export
{
    // private capability flag
    let canUseAbortController = "AbortController" in window;

    // our only stateful private variable:
    let haveNavigated = false;

    // private methods
    function extractAndUse(responseText, newElementID, victim)       // returns error message
    {
        let sideDocument = document.implementation.createHTMLDocument("");
        let newContentDomParent = sideDocument.documentElement;
        newContentDomParent.innerHTML = responseText;
        if (!newElementID)
        {
            // When given a fragment to parse, documentElement generally wraps it in a simulated body tag.
            let body = newContentDomParent.getElementsByTagName("body");
            newContentDomParent = body[0] || newContentDomParent;
        }
        else           // find the named element
        {
            newContentDomParent = sideDocument.getElementById(newElementID);
            if (!newContentDomParent)
                return `SPARE could not find element '${newElementID}' in downloaded content`;
        }

        let placeholder = document.createElement(victim.tagName);
        victim.parentNode.replaceChild(placeholder, victim);		// do the loops while detached from the dom, for performance
        while (victim.lastChild)
            victim.removeChild(victim.lastChild);
        while (newContentDomParent.firstChild)
            victim.appendChild(newContentDomParent.firstChild);
        placeholder.parentNode.replaceChild(victim, placeholder);
        return "";
    }


    function addHistory(elementID, pageURL, newElementID, newTitle, pretendURL)
    {
        history.pushState({ oldId: elementID, url: pageURL, newId: newElementID, title: newTitle, showURL: pretendURL },
                          newTitle, pretendURL || pageURL);
        if (newTitle)
            document.title = newTitle;
    }


    function makeError(errorNumber, errorText, url, exception)
    {
        if (!exception)
            exception = new Error(errorNumber + " " + errorText);
        exception.httpStatus = errorNumber || 0;
        exception.httpMessage = errorText || (exception ? exception.message : "SPARE - unknown error");		// unknown should not happen
        exception.url = url;                   // so catch() handler can easily fall back to navigating there
        return exception;
    }


    // private internal class... we have to use a traditional function-style constructor
    // instead of an ES6 class, because we need to have internal (and preferably private)
    // member variables visible to fetchComplete and fetchError, which get no 'this'
    function Transaction(url, postData, timeout, newElementID, victim)
    {
        // private members -- per-transaction state is kept here
        var aborted = false;
        var timer = null;
        var parentResolve = null;
        var parentReject = null;
        var fetchAborter = canUseAbortController ? new AbortController() : null;

        // our one internally public method
        this.start = function (resolve, reject)
        {
            parentResolve = resolve;
            parentReject = reject;
            let params;
            if (typeof postData == "string" || (postData != null && typeof postData == "object"))
            {
                params = { method:  "POST",
                           body:    postData };
                if (typeof postData == "string")
                    params.headers = { "Content-type": "application/x-www-form-urlencoded" };
                // XXX set postData AFTER header?
            }
            else
                params = { method: "GET" };
            if (fetchAborter)
                params.signal = fetchAborter.signal;
            fetch(url, params).then(fetchComplete).catch(fetchError);
            if (timeout)
                timer = setTimeout(abortBecauseTimeout, timeout * 1000);
        };

        // private methods
        function abortBecauseTimeout()
        {
            aborted = true;
            if (fetchAborter)
                fetchAborter.abort();       // should halt HTTP session; in aborterless browsers, it continues silently in background
            downloadFailed(408, "SPARE time limit exceeded", null);         // will have no effect if promise already resolved
        }

        function fetchComplete(response)
        {
            if (!aborted)
            {
                clearTimeout(timer);
                if (response.status == 200 || response.status == 201 || response.status == 203)
                    downloadSucceeded(response);
                else
                    downloadFailed(response.status, response.statusText, null);
            }
        }

        function fetchError(reason)
        {
            if (!aborted)                    // abort calls downloadFailed immediately, so don't do anything here
            {
                clearTimeout(timer);
                if ("name" in reason && "message" in reason)
                    downloadFailed(-2, `SPARE (during fetch) caught exception ${reason.name}: ${reason.message}`, reason);
                else                         // can this ever happen?
                    downloadFailed(-4, `SPARE failed with reason ${reason}`, null);
            }
        }

        function downloadSucceeded(response)
        {
            try
            {
                response.text().then(responseText =>
                {
                    var err = extractAndUse(responseText, newElementID, victim);
                    if (err)
                        downloadFailed(-1, err, null);
                    else
                        parentResolve();
                }).catch(fetchError);
            }
            catch (e)
            {
                downloadFailed(-3, `SPARE (during extraction) caught exception ${e.name}: ${e.message}`, e);
            }
        }

        function downloadFailed(errorNumber, errorText, exception)
        {
            parentReject(makeError(errorNumber, errorText, url, exception));
        }
    }       // class Transaction



    // our IIFE result: create the SPARE object accessed by the caller, but not if the browser is insufficiently modern
    return  !("fetch" in window && "Response" in window && "Promise" in window && "catch" in Promise.prototype &&
              "history" in window && "pushState" in history &&
              "implementation" in document && "createHTMLDocument" in document.implementation) ? null :
            {
                // global defaulting value settable by the caller
                timeout: undefined,

                // Our core method - see https://github.com/paulkienitz/SPARE/blob/master/README.md for how to use.
                replaceContent(elementID, pageURL, newElementID, postData, timeout)
                {
                    return new Promise((resolve, reject) =>
                    {
                        if (typeof(pageURL) != "string" || pageURL.length == 0)
                            reject(makeError(0, "", pageURL, new Error("SPARE - pageURL is required")));
                        else
                        {
                            let victim = document.getElementById(elementID);
                            if (!victim)
                                reject(makeError(0, "", pageURL, new Error(`SPARE could not find target element '${elementID}'`)));
                            else
                            {
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
                simulateNavigation(elementID, pageURL, newElementID, timeout, newTitle, pretendURL)
                {
                    if (!haveNavigated && !history.state)
                        history.replaceState({startURL: location.href, startTitle: window.title}, "");
                    haveNavigated = true;
                    return this.replaceContent(elementID, pageURL, newElementID, null, timeout)
                               .then(() => { addHistory(elementID, pageURL, newElementID, newTitle, pretendURL); });
                },

                // This is a default handler for the popstate event, which can
                // be used with simulateNavigation if nothing fancier is needed, or
                // called by an extended handler to provide the core functionality.
                onPopStateRestore(event)
                {
                    if ("state" in event && event.state)
                        if ("url" in event.state && "oldId" in event.state)
                        {
                            var p = SPARE.replaceContent(event.state.oldId, event.state.url, event.state.newId);
                            document.title = event.state.title;
                            return p;                           // promise is ignored when used directly as event handler
                        }
                        else if ("startURL" in event.state)
                            location.replace(event.state.startURL);   // refresh
                }
            };      // the object literal that will be assigned to the SPARE singleton
}();
