// This is version 5 of SPARE (Static Page AJAX for Replacing Elements), a JavaScript module, with nested pop support.

// Argh, in Firefox XHR tends to return old cached results even if a full refresh saw something newer!
// Is fetch going to do the same thing?  Note -- full refresh sets Cache-control: no-cache on the parent page,
// but I don't think we have any way to detect that.  Cache-control: etag is unofficial?
// What does Chrome do differently?  it sends if-modified-since and if-none-match headers, absent in firefox.
// .........Wait, has Firefox now fixed itself so the bug doesn't happen anymore?

// TODO: set a SPARELoading CSS class on the target during the transition.
//       test out unhandledrejection event for a way to have pop failure do a reload.
//       have SPAREContentLoaded fire once per update, not consolidated.
//       TEST multi-target popstate support.  SET UP TESTS WITH NESTING.
//           ...See G spreadsheet.  Run through cases, see what more is needed besides de-currenting inners.
// FUTURE FEATURE TO CONSIDER: optional finer control over restoring scroll position.


/* Three-clause BSD-like license with simplified disclaimer and minification allowance:

"SPARE" is Copyright (c) 2015-2026 Paul M. Kienitz
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

// In this version we embrace modern features.  We ignore XHR in favor of fetch, and are an ES6 module.
// Browsers have to be pretty up-to-date to support this version, like 2018 or newer.
// Any browser that new is generally evergreen, so realistically we could use recent features
// like top-level await while hardly losing any users, but I will use only ES6 syntax here,
// so that it will be guaranteed to run if it can load.

// Minify with https://www.digitalocean.com/community/tools/minify (based on Terser) in Module mode — eval option too?


/*export*/ class SPAREError extends Error
{
    httpStatus;
    httpMessage;
    contentURL;
    isSPARE = true;
} // this class mostly just exists so its name is prominently visible in console messages


export var SPARE = function ()	   // IIFE returns the SPARE singleton object, which is our export
{
    // private properties
    const canUseAbortController = "AbortController" in window;
    const initialURL = location.href;       // preserve anchor but trim when comparing
    const initialTitle = document.title;

    let logToConsole = true;
    let urlsCaseInsensitive = false;        // can also be a function hook?  not yet


    // private functions

    function typeName(anything)                             // returns a descriptive name for what type of value something is
    {
        let name = typeof anything;
        if (name === "object")
            if (anything === null)
                name = "null";
            else if (anything.constructor)
                name = anything.constructor.name;
        return name;
    }


    function makeError(exception, url, errorNumber, statusText)
    {
        if (errorNumber > 0 && !statusText)
            statusText = "HTTP status " + errorNumber;      // for http2 where statusText is absent (but some browsers may fill it in)
        if (typeof exception === "object" && !statusText)
            statusText = typeName(exception);
        if (exception == null)                              // with the loose comparison operators, undefined == null
        {
            if (errorNumber)
                exception = new SPAREError(errorNumber + " " + statusText);
            else
                exception = new SPAREError(statusText);
        }
        else if (typeof exception !== "object")             // for validation errors etc we just pass a string as exception
            exception = new SPAREError(String(exception));
        // for non-SPAREError exceptions these get added as ad-hoc properties, so it quacks like a SPAREError:
        exception.httpStatus = errorNumber;
        exception.httpMessage = statusText;
        exception.contentURL = url;                         // so catch() handler can easily fall back to navigating there
        exception.isSPARE = true;                           // for unhandledrejection handlers etc that might get nonspare errors
        if (logToConsole)
            console.error(exception);
        return exception;
    }


    function validate(target, contentURL, checkID, postData, contextData)   // returns target DOM element if it doesn't throw
    {
        if (!contentURL || typeof contentURL !== "string")      // allow URL object?
            throw makeError("SPARE - contentURL string is required", contentURL);
        if (target instanceof HTMLElement)
        {
            if (checkID && !target.id)
                throw makeError("SPARE - target has no ID", contentURL);
            return target;
        }
        if (!target)
            throw makeError("SPARE - target ID or object is required", contentURL);
        let victim = document.getElementById(target);
        if (!victim)
            throw makeError(`SPARE could not find target element '${target}' in ${contentURL}`, contentURL);
        if (postData)
            try { structuredClone(postData); }
            catch (ex) { throw makeError("SPARE postData is not cloneable - type " + typeName(postData), contentURL); }
        if (contextData)
            try { structuredClone(contextData); }
            catch (ex) { throw makeError("SPARE contextData is not cloneable - type " + typeName(contextData), contentURL); }
        return victim;
    }


    function normalizeTimeout(timeout, timeout2)            // returns a validated timeout interval or undefined
    {
        if (typeof timeout !== "number")
            timeout = timeout2;               // allow decimal string?
        if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 3600)
            return undefined;
        else
            return timeout;
    }


    function normalizeURL(url)                              // normalize a URL for comparison to another
    {
        if (!url)
            return url;
        if (urlsCaseInsensitive)
            url = url.toLowerCase();
        return url.split('#')[0];                           // exclude the anchor portion
    }



    // private internal classes and classlike features (sometimes just a factory
    // or plain function, when the class syntactic sugar gets too salty)

    // this simple object needs to be cloneable
    function Change(targetID, contentURL, contentElementID, postData)
    {
        // Represents one instance of a page element which has been replaced by content from another source.
        if (postData === null)
            postData = undefined;                   // make null and undefined be ===, but not ""
        this.targetID         = targetID;
        this.contentURL       = contentURL;                 // XXX TODO: CONVERT TO ABSOLUTE??
        this.contentElementID = contentElementID || null;
        this.postData         = postData;                   // MUST be cloneable!
        this.containedBy      = null;
        // don't need to save initialURL as navigating from another page will load the whole
        // page from the history url first, resetting this script
    }

    class SetOfChanges
    {
        saved = new Map();

        // retrieve the current Change for a given target ID... UNUSED?
        get(id)
        {
            return this.saved.get(id);
        }

        values()
        {
            return Array.from(this.saved.values());
        }

        preAdd(idToBeAdded)
        {
            idToBeAdded = "#" + idToBeAdded;
            for (let c of this.saved.values())
            {
                let itsElement = document.getElementById(c.targetID);
                if (itsElement && itsElement.parentElement.closest(idToBeAdded))
                    this.saved.get(c.targetID).willBeErasedBy = idToBeAdded;
                // TODO: clean that up if simulateNavigation fails
            }
        }

        // update or add the current Change for a target ID, then synchronizes affected containedBy chains
        add(up)
        {
            this.saved.set(up.targetID, up);
            // make a CSS selector for all IDs that are present:
            let allIDs = Array.from(this.saved.keys(), k => '#' + k).join(', ');
            // find if any other changes identify an element that encloses ours, picking the nearest if more than one:
            let target = document.getElementById(up.targetID);
            let container = target.parentElement.closest(allIDs);
            up.containedBy = container ? container.targetID : null;
            // if this now contains some old changes, those all just got erased, so forget them
            //target.querySelectorAll(allIDs).forEach(el => this.saved.delete(el.id));
            this.saved.values().filter(c => c.willBeErasedBy === up.targetID)
                               .forEach(d => this.saved.delete(d.targetID));
        }

        // compare a list of historical changes to the current saved set, returning a new
        // list of changes which would update the existing state to match the one passed in...
        // though internally we store changes in a Map, this takes and returns simple arrays
        needToRestore(changesToRestore)
        {
            // XXX TODO: handle ids no longer existing in document (their containedBy should be informative)
            // XXX TODO: handle relative vs absolute urls -- store always as absolute?

            const isMismatch = other =>             // true if other (a Change) differs from what's in saved for its ID
            {
                let curr = this.saved.get(other.targetID);
                return !curr || normalizeURL(other.contentURL) !== normalizeURL(curr.contentURL) ||
                       other.contentElementID !== curr.contentElementID ||
                       JSON.stringify(other.postData) !== JSON.stringify(curr.postData);    // XXX is there a better option here?
            };
            const descendsFromID = (ancestralID, child) =>
            {
                if (!child || !child.containedBy)
                    return false;
                if (child.containedBy == ancestralID)
                    return true;
                let parent = this.saved.get(child.containedBy);
                return descendsFromID(ancestralID, parent);
            };
            const descendsFromAny = (ancestors, child) =>
            {
                return ancestors.indexOf(child) < 0 &&
                       ancestors.findIndex(a => descendsFromID(a.targetID, child)) >= 0;
            };
            const containersFirst = (a, b) =>       // a and b are two Change objects; compare them for sorting purposes
            {
                if (a.contentURL !== "!" && b.contentURL === "!")
                    return -1;
                if (b.contentURL !== "!" && a.contentURL === "!")
                    return 1;
                if (a.containedBy === b.targetID)
                    return -1;
                if (b.containedBy === a.targetID)
                    return 1;
                if (a.containedBy && !b.containedBy)
                    return -1;
                if (b.containedBy && !a.containedBy)
                    return 1;
                return 0;                           // don't move anything else
            };
            const setUndoURL = (c) =>
            {
                let original = this.saved.get(c.targetID);
                if (!c.containedBy && !original.containedBy)
                    c.contentURL = initialURL;
                else if (!c.containedBy)
                    c.contentURL = original.contentURL;
                else if ((original.containedBy || c.containedBy) === c.containedBy)
                    map.delete(c);                  // the parent is already resetting it (should this never happen?)
                // else... jeez, I don't fuckin' know...
            };
            // Update targets where the current state disagrees with the popped state passed in, but don't update ones contained by
            // another that is also needing an update, if they came from the same URL.  If URLs differ, the container must come first.
            // This depends on a SIMPLIFYING ASSUMPTION: that a given fetch will produce the same DOM tree each time, though text may vary.
            // So there are three types of change to return: undo (missing in passed-in state), do (missing in current state), and fix
            // (versions disagree, passed-in version wins)... order doesn't matter except that containers must precede their containees?
            changesToRestore = changesToRestore || [];
            let toDoOrRedo = changesToRestore.filter(isMismatch);
            // If any element has different contents, we also need to reload all of its descendants:
            toDoOrRedo.concat(changesToRestore.filter(c => descendsFromAny(toDoOrRedo, c)))
                      .map(c => new Change(c.targetID, c.contentURL, c.contentElementID, c.postData));  // shallow copy for modifiability
            let toUndo = Array.from(this.saved.values().filter(v => !changesToRestore.find(u => u.targetID === v.targetID))
                                                       .map(c => new Change(c.targetID, /*initialURL*/ "!", c.targetID)));
            // there are no duplicate IDs, so we can make a map, and use that to produce local containedBys within the returned set

///// ******* XXX WAIT, all undos before all redos, right?  and shouldn't containedBy only apply within each half??
            let map = new Map(toUndo.concat(toDoOrRedo).map(c => [c.targetID, c]));
            let allIDs = Array.from(map.keys(), k => '#' + k).join(', ');
            for (let c of map.values())
            {
                let itsElement = document.getElementById(c.targetID);
                let itsContainer = itsElement ? itsElement.parentElement.closest(allIDs) : null;
                map.get(c.targetID).containedBy = itsContainer ? itsContainer.targetID : null;
            }
            // now that we know the containment order, we can figure out the undo urls
            // === If you are undoing an inner area which is contained by an existing outer one which is
            // not a delta, the contentURL to use is that which filled in the outer update
            // ...If the undo is contained by another element in the delta, it can be dropped.  If it is contained
            // by something in the current saved map that isn't in the list, use that change's url for the undo.
            // THE TRICKY PART can be deciding which conflicting ancestry points to the nearer container.
            let delta = Array.from(map.values()).sort(containersFirst);
            delta.filter(c => c.contentURL === "!").forEach(setUndoURL);
            return delta;
        }

        toString(change)                // mainly for debuggery
        {
            return change.targetID + " -> " + change.contentURL + (change.contentElementID ? '#' + change.contentElementID : "");
        }
    }  // class SetOfChanges

    // This static collection tracks all changes made by simulateNavigation, relative to the page as originally loaded.
    // It does not include changes made by replaceContent, as the intent is to mimic navigation and reload the page
    // as it would have come from the server.  If the page content is dynamic and added by some means other than
    // original loading or simulateNavigation, it's up to the page to handle that dynamic content restoration via
    // a SPAREContentLoaded handler or whatever, before the popstate proceeds to the next replacement.
    const allChanges = new SetOfChanges();



    // History stuff doesn't work as a true class because methods can't be used as then() callbacks.
    // XXX TODO: turn into a class with lambda methods:  add = result => { ... }; ?
    function makeHistoryAdder(targetID, contentURL, contentElementID, newTitle, pretendURL, contextData, postData)
    {
        return function (val)
        {
            allChanges.add(new Change(targetID, contentURL, contentElementID, postData));
            let changesToSave = allChanges.values();                    // convert to dumb serializable form
            let state = { SPAREtargetID:         targetID,
                          SPAREnewTitle:         newTitle,
                          SPAREvisibleURL:       pretendURL || contentURL,
                          SPAREcontextData:      contextData,           // MUST be serializable, like postData!
                          SPAREchanges:          changesToSave,
                          SPAREinitialTitle:     initialTitle,
                          SPAREinitialURL:       initialURL
                          // add scroll position, to be used optionally?  (Chrome might benefit, Firefox is doing fine on its own)
                        };
            history.pushState(state, "", pretendURL || contentURL);
            if (newTitle)
                document.title = newTitle;
            return val;
        };
    }

    function historyBackfill(targetID, contextData)
    {
        if (history.state && history.state.SPAREinitialURL)
            return;
        let hindstate = { SPAREcontextData:     contextData,            // MUST be serializable!
                          SPAREinitialTitle:    initialTitle,
                          SPAREinitialURL:      initialURL
                          // add scroll position, to be used optionally?  (Chrome might benefit, Firefox is doing fine on its own)
                        };
        if (history.state)
        {
            var t = history.state;
            Object.assign(t, hindstate);                                // merge the fields
            hindstate = t;
        }
        history.replaceState(hindstate, "");
    }


/* experimental feature for scrolling:
    var HashFinder = function(href)
    {
        var hash = new URL(href).hash;
        if (hash && hash.charAt(0) === "#")
            hash = hash.substring(1);
        if (!hash)
            this.find = function () { };
        else
            this.find = function ()
            {
                var ankh = document.getElementById(hash);
                if (ankh)
                {
                    var arec = ankh.getBoundingClientRect();    // coordinates are relative to viewport
                    if (arec.top < 0 || arec.bottom > document.documentElement.clientHeight)
                        ankh.scrollIntoView({ block: "start", behavior: "instant" });
                }
            }
    };
*/



    // This especially doesn't want to be a true class... BUT WAIT, could lambda methods handle this correctly as callbacks??
    // Returns an object containing functions for different event types 
    // XXX TODO: turn into a class with lambda methods:  loaded = result => { ... }; ?
    function makeEventFirer(simulateDCL, contentURL, contextData)
    {
        function makeEvent(name, canCancel)
        {
            let event = new Event(name, { bubbles: true, cancelable: !!canCancel });
            event.contextData = contextData;
            event.contentURL = contentURL;
            event.isSPARE = true;
            if (canCancel)
                event.cancel = function () { this.preventDefault(); this.stopPropagation(); };
            return event;
        }

        return {
                 loaded: function (val)
                 {
                    let event = makeEvent(simulateDCL ? "DOMContentLoaded" : "SPAREContentLoaded");
                    document.dispatchEvent(event);
                    // XXX TODO: include a field with the id(s) of victim(s) that got updated?
                    return val;
                 },

                 failed: function (error)
                 {
                    let event = makeEvent("SPAREPopStateFailed");
                    event.error = error;
                    document.dispatchEvent(event);
                    // subsequent then() will receive undefined; no error is thrown to trigger catch()
                 },

                 beforePop: function (changes)
                 {
                    let event = makeEvent("SPAREBeforePopState", true);
                    event.changes = changes;        // either an array of Change objects, or a string error condition
                    document.dispatchEvent(event);
                    return !event.defaultPrevented;
                 },

                 afterPop: function (successes, failures, changesWithOutcomes)
                 {
                    let event = makeEvent("SPAREAfterPopState");
                    event.replaced = successes;
                    event.failed = failures;
                    event.changes = changesWithOutcomes;
                    document.dispatchEvent(event);
                 }
               };
    }       // makeEventFirer



    function Retrieve(contentURL, postData, timeout)
    {
        let aborted = false, retrieved = false;
        let timer = undefined;
        let fetchAborter = null;
        let promGood = null, promBad = null;

        function fail(statusNumber, statusText, exception)
        {
            throw makeError(exception, contentURL, statusNumber, statusText);
        }

        function fetchComplete(response)
        {
            if (!aborted)
            {
                clearTimeout(timer);
                if (response.status == 200 || response.status == 201 || response.status == 203)
                    return response.text().then((t) => { retrieved = true; return t; }, fetchError);
                else
                    fail(response.status, response.statusText);
            }
        }

        function fetchError(reason)
        {
            if (!aborted)                    // abort throws its own rejection, so don't do anything here in that case
            {
                clearTimeout(timer);
                if ("name" in reason && "message" in reason)
                    fail(-2, `SPARE fetch${retrieved ? " text" : ""} failed with exception ${reason.name}: ${reason.message}`, reason);
                else                         // shouldn't happen, I hope
                    fail(-4, `SPARE fetch${retrieved ? " text" : ""} failed with reason ${reason}`, reason);
            }
        }

        function abortBecauseTimeout(reject)
        {
            if (!aborted)                       // probably unnecessary to check this
            {
                aborted = true;
                if (fetchAborter)
                    fetchAborter.abort();       // should halt HTTP session; in aborterless browsers, it continues silently in background
                reject(makeError(null, contentURL, 408, `SPARE time limit exceeded (${timeout} seconds)`));
            }
        }

        let params;
        if (typeof postData === "string")
            params = { method:  "POST",
                       headers: { "Content-type": "application/x-www-form-urlencoded" },
                       body:    postData };
        else if (postData !== null && typeof postData === "object")
            params = { method:  "POST",
                       body:    postData };     // in supported cases the content-type header is set automatically
        else
            params = { method: "GET" };

        if (timeout && canUseAbortController)
        {
            fetchAborter = new AbortController();
            params.signal = fetchAborter.signal;
        }
        if (timeout)
            promBad = new Promise((resolve, reject) => timer = setTimeout(abortBecauseTimeout, timeout * 1000, reject));
        promGood = fetch(contentURL, params).then(fetchComplete, fetchError);
        return promBad ? Promise.race([promBad, promGood]) : promGood;
    }       // Retrieve



    function makeExtractor(victim, contentURL /*for error reporting only*/, contentElementID)
    {
        return function (responseText)
        {
            let err;
            try
            {
                let sideDocument = document.implementation.createHTMLDocument("");
                let newContentDomParent = sideDocument.documentElement;
                newContentDomParent.innerHTML = responseText;
                if (!contentElementID)
                {
                    // When given a fragment to parse, documentElement generally wraps it in a simulated body tag.
                    let body = newContentDomParent.getElementsByTagName("body");
                    newContentDomParent = body[0] || newContentDomParent;
                }
                else           // find the named element
                {
                    newContentDomParent = sideDocument.getElementById(contentElementID);
                    if (!newContentDomParent)
                        err = `SPARE could not find element '${contentElementID}' in downloaded content from ${contentURL}`;
                }

                if (!err)
                {
                    let placeholder = document.createElement(victim.tagName);
                    victim.parentNode.replaceChild(placeholder, victim);    // do the loops while detached from the dom, for performance
                    while (victim.lastChild)
                        victim.removeChild(victim.lastChild);
                    while (newContentDomParent.firstChild)
                        victim.appendChild(newContentDomParent.firstChild);
                    placeholder.parentNode.replaceChild(victim, placeholder);
                    return victim;
                }
            }
            catch (ex)    // other than the -1 case, exceptions here shouldn't happen
            {
                throw makeError(ex, contentURL, -3, "SPARE content update failed with exception " + ex.name + ": " + ex.message);
            }
            if (err)
                throw makeError(null, contentURL, -1, err);
        }
    }       // makeExtractor



    // "MAIN PROGRAM" TIME...
    // load-time initialization -- validate that we have browser support, and save initial location
    let supported = "fetch" in window && "Response" in window && "closest" in HTMLElement.prototype;
    // Minimum browser versions are from 2015-17: Edge 16, Firefox 60, Chrome 61, Safari 11...
    // so in practice the test is pretty pointless, as every browser that can load modules passes it.
    // AbortController support is added 2017-19: Edge 16, Firefox 57, Chrome 66, Safari 12.1


    // our IIFE result: create the SPARE object accessed by the caller, or set it null if the browser is lacking
    let spare = !supported ? undefined :
    {
        // global defaulting values settable by the caller
        timeout: undefined,

        simulateDCL: false,

        get logErrorsToConsole()
        {
            return logToConsole;
        },
        set logErrorsToConsole(flag)
        {
            logToConsole = !!flag;
        },

        get treatURLsAsCaseInsensitive()
        {
            return urlsCaseInsensitive;
        },
        set treatURLsAsCaseInsensitive(flag)
        {
            urlsCaseInsensitive = !!flag;
        },


        // Our core method - see https://github.com/paulkienitz/SPARE/blob/master/README.md for how to use.
        // Going "await SPARE.replaceContent(...)" is an alternative to using .then() for 2018+ browsers.
        replaceContent(target /*ID or DOM element*/, contentURL, contentElementID, postData, timeout)
        {
            try
            {
                let victim = validate(target, contentURL);      // throws (which Promise turns into rejection) if no victim
                if (Number.isFinite(postData) && arguments.length === 4)
                    timeout = postData, postData = undefined;   // we allow timeout to use either param position polymorphically
                timeout = normalizeTimeout(timeout, SPARE.timeout);
                return Retrieve(contentURL, postData, timeout)
                            .then(makeExtractor(victim, contentURL, contentElementID));
            }
            catch (ex)
            {
                return Promise.reject(ex);
            }
        },


        // Like replaceContent but also sets history and title.  Root-relative URLs are recommended,
        // because cross-domain contentURL values will generally fail due to browser security.
        // Both contextData and postData must be cloneable into a popState context.  This is validated.
        simulateNavigation(target, contentURL, contentElementID, newTitle, pretendURL, timeout, postData, contextData)
        {
            try
            {
                if (postData instanceof URLSearchParams)
                    postData = postData.toString();     // make it cloneable
                let victim = validate(target, contentURL, true, postData, contextData);     // throws if any are bad
                // we polymorphically allow an options param in place of newTitle:  // or pretendURL
                let op = arguments[arguments.length - 1];
                if (arguments.length /* >= 4 && arguments.length <= 5 */ === 4 && typeof op === "object")
                {
                    // if (arguments.length < 5)
                    newTitle    = op.newTitle;
                    pretendURL  = op.pretendURL;
                    timeout     = op.timeout;
                    postData    = op.postData;
                    contextData = op.contextData;
                }
                timeout = normalizeTimeout(timeout, SPARE.timeout);

                let eventFirer = makeEventFirer(SPARE.simulateDCL, contentURL, contextData);
                let historyAdder = makeHistoryAdder(victim.id, contentURL, contentElementID, newTitle, pretendURL, contextData, postData);
                historyBackfill(victim.id, contextData);
                allChanges.preAdd(victim.id);
                return Retrieve(contentURL, postData, timeout)
                            .then(makeExtractor(victim, contentURL, contentElementID))
                            .then(historyAdder)
                            .then(eventFirer.loaded);
            }
            catch (ex)
            {
                return Promise.reject(ex);
            }
        },


        // our handler for the popstate event, already attached
        onPopStateRestore(event)
        {
            let retval = undefined;
            if (event.state && event.state.SPAREinitialURL)
            {
                let eventFirer = makeEventFirer(SPARE.simulateDCL, undefined, event.state.SPAREcontextData);
////                if (eventFirer.beforePop())
////                {
//                    let victim = document.getElementById(event.state.SPAREtargetID);
//                    if (!victim)        // should not happen... XXX are there any other sanity checks we can do here?
//                    {
//                        if (eventFirer.beforePop("SPARE target missing"))
//                        {
//                            console.log("=== SPARE had to reload initial page because history state target is missing." +
//                                        "\nVisible URL:  " + event.state.SPAREvisibleURL + "\nInitial URL:  " + event.state.SPAREinitialURL +
//                                        "\nCurrent URL:  " + location.href + "\n- Target ID:  " + event.state.SPAREtargetID);
//                            location.replace(event.state.SPAREvisibleURL);
//                            retval = false;
//                            eventFirer.afterPop(-1);    // -1 means it's moot because the page is about to be reloaded
//                        }
//                        else
//                            eventFirer.afterPop(0);
//                    }
//                    else                                // undo or redo simulated navigations
//                    {
                        // be aware that event.SPAREinitialURL might not match our actual initialURL if a reload has occurred...
                        // so far this seems to work fine in such cases, but watch out for gotchas
                        let toUpdate = allChanges.needToRestore(event.state.SPAREchanges);
//alert(toUpdate.map(toUpdate.toString).join('\n') || "no updates needed?");
                        if (eventFirer.beforePop(toUpdate))
                        {
                            let replacedCount = 0, failedCount = 0;
                            toUpdate.forEach(u => u.outcome = "pending");
                            let promises = toUpdate.map((u) =>
                            {
                                let p = Retrieve(u.contentURL, u.postData, SPARE.timeout);  // XXX ** HOW BETTER HANDLE A TIMEOUT HERE??
                                u.outcome = "requested";
                                p.then(t => u.outcome = t.length ? "retrieved" : "empty");  // branch, don't return this
                                return p.catch(reason => u.error = reason);
                            });
                            /* var hashfinder = makeHashFinder(location.href); */
                            retval = Promise.all(promises).then(texts =>
                            {
                                // those fetches happened in parallel but the extractions must be done in order
                                for (let i in toUpdate)
                                    if (toUpdate[i] /*Before handler can delete elements*/ && !("error" in toUpdate[i]))
                                        try
                                        {
                                            let victim = document.getElementById(toUpdate[i].targetID);
                                            let extract = makeExtractor(victim, toUpdate[i].contentURL, toUpdate[i].contentElementID);
                                            extract(texts[i]);
                                            allChanges.add(toUpdate[i]);
                                            toUpdate[i].outcome = "updated";
                                            replacedCount++;
                                        }
                                        catch (e)
                                        {
                                            toUpdate[i].error = e;
                                        }
                                let airs = toUpdate.filter(u => "error" in u && !!u.error);
                                if ((failedCount = airs.length))
                                    throw airs[0];
                            }).then(eventFirer.loaded, eventFirer.failed)/*.then(hashfinder)*/
                              .then(() => eventFirer.afterPop(replacedCount, failedCount, toUpdate));
                        }
                        else
                        {
                            toUpdate.forEach(u => u.outcome = "cancelled");
                            retval = new Promise((res, rej) => res(eventFirer.afterPop(0, 0, toUpdate)));
                        }
//                    }
////                }
////                else
////                    eventFirer.afterPop(0);
            }
            return retval;
        }
    };

    return spare;      // the object literal that will be assigned to the global SPARE singleton
}();

// This is needed right away even if we haven't pushed any state yet,
// for when someone returns to this site from outside via the back button.
if (SPARE)
    window.addEventListener("popstate", SPARE.onPopStateRestore);
