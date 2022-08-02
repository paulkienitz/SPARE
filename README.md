# SPARE
### Static Page AJAX to Replace Elements — a lightweight client-side library

- *Release 1 was on March 24, 2015, under the terms of the Apache 2.0 license.*
- *Release 2 was on October 16, 2019 — same terms.  Added simulateNavigation.*
- *Release 3 was on June 12, 2021 — same terms.  Improved simulateNavigation.*
- *Release 4 was on _ _, 2022, with a new BSD-like llicense.  Improved onPopStateRestore.*

SPARE is a small client-side AJAX framework which requires no server-side support.  In fact, the case it’s optimized for is when the server provides only plain static HTML content.  It’s also super easy to use: you only need to call one method.

How it’s designed to work was originally inspired by ASP&#46;Net’s `UpdatePanel` control, but as implemented, it’s more similar to jQuery’s `load()` method, at lower cost (and as a tradeoff, less support for downlevel browsers than 1.x versions of jQuery).

To use it, you give it the ID of any element on your page (which we will call the target), the URL of a new page, and an ID on that page.  It replaces the contents of the local document’s target element with the content of the named element on the new page.  SPARE is most seamlessly used when you have a site design where many pages share common markup for headers, navigation, and so on, and the real differences are in a bounded content area.  SPARE lets you load new content into that area without refreshing the rest of the page.  In this use case, often the two IDs will be the same.

In that scenario, you can ask SPARE to fully simulate navigation as if the pages were being loaded normally instead of partially.  This mode is used by invoking a different method.  In that mode you must attach a `popstate` event handler to support use of the Back button.

You can just as easily select content from pages not resembling the calling page.  You can optionally send POST data as well (though not with simulated navigation at this time).  And there’s an option to invoke callback functions on success or failure.  (We will support a promise-based interface in a future version.)  None of these is required for basic usage.

And if the URL you give returns a page fragment, so you don’t have to select an element within it, that’s even simpler.  That mode works for text content that isn’t even HTML (but don’t try it with binary content, such as an image URL, or it will just look like a mess).

--------

### replaceContent method

The Javascript API consists of an object named **`SPARE`** with five public methods.  Note that you do not use a `new` operator to instantiate SPARE; it’s a singleton static object.

The main method for general use is **`SPARE.replaceContent`**, which takes the following arguments, all of string type unless stated otherwise:

> **`target`** (required): either the DOM ID of the target element in your document, or a DOM node object representing that element.  (In release 3 and earlier, this was named `elementID` and accepted only string values.)  This is the element which will have its contents replaced.  If the ID is not found in your document, SPARE throws an immediate exception.

> **`contentURL`** (required): the web address of the HTML content to be used for that replacement.  This can be a relative URL for content on the same site as the current page.  (Cross-domain URLs are commonly blocked by browser security anyway.)  Was named `pageURL` in release 3 and earlier.

> **`contentElementID`**:  the DOM ID of the element within the downloaded page which will be the source of the replacement content.  If you don’t provide any value (or pass a falsy value such as `""`) then it puts the entire content returned by the URL into your target element.  That technique is most appropriate if the server is set up to return fragmentary pages, instead of complete ones with `<html>` tags.  If a complete page is received and this ID is not given, it will use the content of the `<body>` tag.  (Extracting the body may be unreliable in Internet Explorer 9.  This problem does not affect any other IE version.)  Was named `newElementID` in release 3 and earlier.

> **`postData`**: values to be sent to the URL as form arguments.  If null or undefined, it requests the page with a simple GET.  Version 1 of SPARE supported only form-urlencoded strings, not multipart posts, and if you pass a string as this parameter, it still must be encoded in that format.  But version 2 supports alternate types of post data, including `URLSearchParams` and `FormData` objects if the browser is new enough to support them.  `URLSearchParams` does the form urlencoding for you, and `FormData` translates into multipart/form-data format, which supports file uploads.  (Passing in `ReadableStream`, `BufferSource`, or `Blob` objects is untested.)  `URLSearchParams` is less widely available than `FormData`, but has polyfills available.

> **`callbackContextData`**: an arbitrary object which is passed as the first argument to whichever of `onSuccess` or `onFailure` is invoked, so you can give them some information about the context in which they were called.

> **`onSuccess`**: a function to be invoked after the new content is successfully loaded.  If you pass a string, it will be executed with `eval`.  If it’s a function object, it will be passed the `callbackContextData` value.  For compatibility, values that are neither strings nor functions are simply ignored.  If defaulted, no action is taken after updating the content of your target element.  Any exceptions that occur in invoking it will pass through uncaught.  You can set a default value globally by assigning the function to the global variable **`SPARE.onSuccess`**.  This will be used if this parameter is unset or has a falsey value.

> **`onFailure`**: similar, but invoked if there’s a failure in loading the new content.  Again, the first argument is your `callbackContextData` value.  The second argument passed to it is an HTTP result number, such as 404 for page not found, and the third is the text of the error message received.  Note that with many websites transitioning to HTTP 2, the traditional status messages such as "Not Found" for 404 are no longer included in the response; if none is received then SPARE will now substitute a generic text such as "HTTP status 404", whereas SPARE 3 would just provide the empty string.  If the onFailure argument is not given, the default failure behavior is to navigate the browser window to the `contentURL` value passed in.  That is an appropriate fallback if you’re just using AJAX to smooth transitions during normal navigation, but  will not be useful if the server is returning only fragmentary pages.  Again, exceptions are not caught.  You can set a default value globally by assigning the function to the global variable **`SPARE.onFailure`**.  *NOTE*: the error number may also be negative, if SPARE fails to use the content after a successful download:

>> -1 means that `contentElementID` was not found in the downloaded content.

>> -3 means an unexpected exception was caught while importing the content into the document.  (-2 could be returned by SPARE version 1, but is not used anymore.)

>> 0 is also possible, with empty or meaningless text.  Requests do sometimes fail with no explanation available.  This can happen, for instance, when making a forbidden cross-site request.

> **`transitionalContentID`** \[IGNORED\]: a legacy parameter that no longer does anything, and is present only to retain API compatibility with earlier releases.  The global variable **`SPARE.transitionalContentID`** is also ignored.

> **`timeout`**: a number.  If the new data doesn’t download within this many seconds, the operation fails.  The supported range is from 0 to 3600, and the default is to leave it up to the browser.  Fractional values such as 1.25 are supported.  You can set a different default globally by putting a number in the global variable **`SPARE.timeout`**.  If the time expires, `onFailure` will be called with error code 408 (Request Timeout), with the error message being "SPARE time limit exceeded" instead of "Request Timeout".  (All internal messages to `onFailure` start with the word "SPARE".)  *Note* that setting a large value does not prevent the browser or server from failing the operation sooner.

All of these parameters except the first two are optional.  Furthermore, if the final parameter you pass in is a number, it will be taken as `timeout` even if other parameters before it are absent.  This means the function can be called with any one of the following additional polymorphic signatures:

```
SPARE.replaceContent(target, contentURL, timeout)
SPARE.replaceContent(target, contentURL, contentElementID, timeout)
SPARE.replaceContent(target, contentURL, contentElementID, postData, timeout)
SPARE.replaceContent(target, contentURL, contentElementID, postData, callbackContextData, timeout)
SPARE.replaceContent(target, contentURL, contentElementID, postData, callbackContextData, onSuccess, timeout)
SPARE.replaceContent(target, contentURL, contentElementID, postData, callbackContextData, onSuccess, onFailure, timeout)
```

--------

### simulateNavigation method

The second method is **`SPARE.simulateNavigation`**.  This works like `replaceContent` but has the additional effect of adding a history item under the browser’s Back button, and changing the URL visible in the browser’s address box.  This method is intended for a fairly strict and narrow case: when you replace part of a page’s content but wish to behave as if the entire page was replaced.  This makes sense if you have many pages that fit a common template.  The result of loading the partial page from the given URL should look the same as navigating to that page (only smoother); otherwise, using this method may be inappropriate, and produce results that are confusing to the page visitor.

*Note* that due to browser security, navigation between different domains will not work with `simulateNavigation`; all pages must be within a single website.  *Also note* that `simulateNavigation` does not at this time try to support use cases in which multiple sections of the page are independently updated.  Correctly implementing Back-button behavior in such cases is an order of magnitude more complex than in cases where just a single region is updated to hold various content.  I might attempt it in a future release.

The parameters of `simulateNavigation` mostly have the same meanings that they do when used with `replaceContent`.  Only the final two parameters, `newTitle` and `pretendURL`, are unique to `simulateNavigation`.  The latter was new in release 3.  The full list of parameters is:

> **`target`** (required): the ID of the existing HTML element which will have its contents replaced, or the DOM node representing that element.  (Formerly `elementID`.)

> **`contentURL`** (required): the URL from which new content will be loaded.  (Formerly `pageURL`.)

> **`contentElementID`**: the ID of the piece of the new content which will be loaded, or omit to use all of it.  (Formerly `newElementID`.)

> **`callbackContextData`**: arbitrary value passed to `onSuccess` or `onFailure`.

> **`onSuccess`**: callback function or expression invoked after new content is loaded.

> **`onFailure`**: callback function or expression invoked if the new content cannot be loaded.

> **`timeout`**: the number of seconds to wait for the download of new content.

> **`newTitle`**: a string which, if not blank, changes the title shown by the browser on the window or tab containing this page.

> **`pretendURL`**: a string which, if not blank, is shown in the address bar, and saved in the Back-button history, instead of `contentURL`.

Note that this method does not have the `postData` or `transitionalContentID` parameters that `replaceContent` offers.  Those features are not supported by this method.  We could in theory add `postData`, but it would be risky: the range of data that could be supplied to it may be sharply restricted, and it may not be possible to accurately pretest whether a post parameter will avoid causing exceptions later.

Also, at this time, `simulateNavigation` does not support omitting arguments before `timeout` the way that `replaceContent` does.

One gotcha to be aware of with `simulateNavigation` is that pretend URLs pushed into the history affect what path is “current” for relative URLs.  Unless all pages and pretend URLs are in the same directory, it’s safer to always use root-relative or absolute URLs throughout any pages that use SPARE.  I recommend root-relative URLs, because browser security does not permit us to simulate navigation to any other domains.

**IMPORTANT:** In order to use `simulateNavigation` effectively, you *must* set up a `popstate` event handler.  Otherwise, when the user clicks the Back button, the page content will not change!  SPARE includes a suitable handler which you can use or extend.

This event handler can be set by adding a line of code, either `window.onpopstate = SPARE.onPopStateRestore;` or `window.addEventListener('popstate', SPARE.onPopStateRestore);`.  Or you can substitute your own handler function, but its primary operation should be to call the supplied one.  Releases 2 and 3 of SPARE included a simple example of a popstate handler which you could use instead of the built-in one, but these simple versions have been found to be insufficient for some use cases.

--------

### onPopStateRestore event handler

The third method is **`SPARE.onPopStateRestore`**, the mandatory popstate handler just mentioned.  There is no need to call this method directly, unless you are invoking it from your own wrapper function which is set as the handler, so that you can perform additional actions before or after handling the popstate event.  This is mainly useful if something must be done before invoking it, or if you identify cases where a full reload or redirect should be done instead.  Note that code added after the return of `onPopStateRestore` will run *before* the content is updated, as the download is asynchronous.  If you want to invoke an action after the restoration is complete, you need to set a default `SPARE.onSuccess` handler function.  It will be called from `onPopStateRestore` with the event’s `state` object as its context parameter.  (`SPARE.onFailure` may also be called, but this is unlikely when returning to previously successful content.)  This `onSuccess` handler will be invoked for both new `simulateNavigation` calls and popstate restorations, unless you pass a different handler to `simulateNavigation`.  Passing an explicit null to disable success handling won’t work as that is falsey, meaning it will default to `SPARE.onSuccess`.  Another alternative is to listen for a content-loaded event, which is explained below.  If you are calling `onPopStateRestore` from your own handler, note that it returns a value of `true` in cases where it replaced content, and returns `undefined` if it did not.  (When used directly as an event handler these return values are ignored.)

If you supply your own popstate handler function, it takes a single parameter, which will be an `Event` object with a property called `state`.  That same event should be passed on to the supplied handler.  This `state` property will be null when returning to a page that the user actually navigated away from, in which case the handler has nothing to do.  But when returning to simulated navigation done by SPARE, the property will contain an object with these members, mostly taken directly from the parameters passed to `simulateNavigation`:

> **`state.targetID`**: the ID of the document element whose contents were replaced.  Also present as `oldId` for compatibility with the poorly chosen property names used in releases 2 and 3.

> **`state.contentURL`**: the URL from which the content was loaded.  Also present as `url`.

> **`state.contentElementID`**: the ID of the element from that URL that the content was extracted from.  Also present as `newId`.

> **`state.newTitle`**: the title shown on the page’s window or tab, if given, otherwise null.  Also present as `title`.

> **`state.pretendURL`**: the URL shown in the browser's address box, if given, otherwise null, in which case `contentURL` was used.  Also present as `showURL` for compatibility.

> **`state.startURL`**: the URL of the original page before `simulateNavigation` updated it.  In release 3 this was not always present.

> **`state.startTitle`**: the title that was shown on the window or tab for that original page.  In release 3 this was not always present.

So if the parameter to your handler function is named `e`, you would access these values as `e.state.targetID`, `e.state.contentURL`, and so on.

If the user presses the Back button on the first page loaded by `simulateNavigation`, to return to the original page as first loaded from the site, then the `state` property will not contain most of those members, but instead will only have `startURL`, `startTitle`, and the `targetID` which got replaced.  Use the `in` operator to check which members are present, if making your own handler.

If the user presses Back under other conditions, such as between two pages that did not use `simulateNavigation` at all, then you can expect the `state` property to be null.  In this case, the supplied `onPopStateHandler` takes no action.  So you should first test whether `state` has a value at all.

At the time the handler function is called, the browser will have restored the URL to the address bar, but it will *not* have changed any of the content visible on the page, or the title.  The handler needs to do this.  The supplied handler essentially invokes `replaceContent` to refill the target with what was put there at that point in history, while also setting the page title and the visible URL.

If extending the functionality of the handler, don’t forget that there is also a Forward button, and dropdowns to go back or forward nonsequentially.

This method can optionally take one further step in simulating the loading of a complete page: it can fire the `DOMContentLoaded` event, just as happens after a page is loaded by normal navigation.  Whether it does this is decided by a value you assign to the global flag `SPARE.simulateDCL`.  If you set it to a truthy value, this event will be triggered after `onSuccess` (if applicable) is called.  Note that the event is *not* triggered by `replaceContent`, only by `simulateNavigation` and `onPopStateRestore`.  Also note that the `load` event, which occurs later than this in actual navigation, is not simulated.

If `SPARE.simulateDCL` is falsey, it still fires an event, but the event is called `SPAREContentLoaded` instead of `DOMContentLoaded`.  You can simply ignore that event, and it will have no effect.  If you are interested in responding to it, you can attach a handler function with `window.addEventListener('SPAREContentLoaded', mySpareContentLoadedHandler);`.  The `Event` object passed to it is completely generic with no added properties, just as with `DOMContentLoaded`.

NOTE:  During testing of `simulateNavigation`, an issue with Firefox was discovered for which I did not find a solution.  Sometimes if you load a block of content which includes images, the images don’t load, and show as broken until you refresh.  As far as I can tell, this happens only if you use relative paths for the image source URLs, particularly ones that begin with `../`.  When I converted such paths to root-relative ones starting with `/`, the problem disappeared.  If you are unable to make that change in the content you are downloading, there may not be a workaround.  The usual script tricks that are used for preloading images did not help.

--------

### canSimulateNavigation method

The fourth method is **`SPARE.canSimulateNavigation`**.  This takes no parameters and returns a boolean value.  If it returns false, `simulateNavigation` is not supported by your browser, and cannot be used — it will throw an exception.  Internet Explorer 9 and earlier are browsers for which it returns false, as are any browser versions older than about 2011.  If you want to use `simulateNavigation`, check this early, and provide a fallback path to do traditional whole-page navigation if `canSimulateNavigation` returns false.

--------

### supportLevel method

The fifth and final method is **`SPARE.supportLevel`**, which takes no arguments.  This is a compatibility holdover from earlier releases in which some browsers could support `replaceContent` but not `simulateNavigation`.  Since release 3, no such browsers remain.  If `simulateNavigation` is true this returns the number 2, otherwise it returns 0.  This means that if `simulateNavigation` cannot be used, then `replaceContent` can’t either.

**IMPORTANT**:  It is easier than you think to get into a state where your `supportLevel` value is 0 and SPARE doesn’t work.  This doesn’t just happen if your user is running something ancient like IE 6 — it will happen in IE 11 if your page provokes IE into Compatibility View mode.  Make sure your markup is up to snuff so IE uses Standards mode.  Fortunately, like all IE-related issues, this one is now receding into the past.

--------

### properties

Having descripbed all of the five methods, I will also put a list of the global properties together in one place here.  All have been already described in greater detail above.  They are:

> **`SPARE.timeout`**: the upper limit of how long a request is allowed to wait for content, if no explicit `timeout` value is passed as a parameter.

> **`SPARE.onSuccess`**: the callback function to invoke (or string to execute) upon completion of the page update, if no explicit `onSuccess` parameter is given.

> **`SPARE.onFailure`**: the callback function to invoke (or string to execute) if the page update fails to complete, if no explicit `onFailure` parameter is given.

> **`SPARE.simulateDCL`**: if true, cause `simulateNavigation` to trigger a fake `DOMContentLoaded` event after invoking `onSuccess`.

> **`SPARE.transitionalContentID`**: does nothing, present only for API compatibility.

All are originally initialized to a value of `undefined`, except `simulateDCL` which is initially set to `false`.  They all affect all three methods, `replaceContent`, `simulateNavigation`, and `onPopStateRestore`, except that `replaceContent` does not fire the event configured by `simulateDCL`.  NOTE that this means that restoring content with the Back button can fail due to `SPARE.timeout` being set, thereby causing `SPARE.onFailure` to be invoked.

--------

### the future

SPARE is based on a technology known as XHR.  Savvy readers may note that in modern browsers, XHR is somewhat obsolete, replaced by the simpler `fetch` API.  A future version of SPARE will switch over to using `fetch`.  That version will no longer use `onSuccess` and `onFailure` callback parameters, but instead will return a `Promise` object, which will allow you to handle success with a `then` method (or let you use an `await` expression) and failure with a `catch` method.  With the callback hooks gone, `replaceContent` has only five parameters instead of nine.

In fact, three future versions of SPARE were drafted.  One returned a `Promise` but was still based on XHR; a second used `fetch`, and the third also used `fetch` but was implemented as an ECMAScript 6 module, so that it no longer had to restrict itself to ECMAScript 3 syntax.  All three were compatible with each other at the API level, but incompatible with SPARE versions 1 through 4.  These represented successive steps of abandoning support for older browsers.   `Promise` support got going in 2014 and came to Edge 12 in 2015 (with polyfills available to stretch that back to IE).  Then `fetch` came along in 2015 and reached Edge 14 in 2016 (the `AbortController` class needed for efficient timeouts didn’t come to Chrome until 2018, but we can manage without it).  Finally, modules came to the majority of browsers in 2017.

Eventually, I made a tentative decision to skip the partial upgrades and go directly to the module format for the new version, as in recent years legacy browsers have become much less prevalent.  But then I saw that unfortunately there are still some mildly popular mobile browsers that don’t support modules, such as UC, Baidu, and the KaiOS browser, so this might have to be reconsidered; we might need to support both module and non-module versions of the fetch-based API.  I’m aware of just one current browser that doesn’t yet support fetch: Opera Mini.  So the Promise-with-XHR version will definitely be skipped.

In this new incompatible API, there are no longer any `supportLevel` or `canSimulateNavigation` methods.  If the browser does not have sufficient support, then the singleton global `SPARE` object will be initialized to null.  If the object is present, then all features will work.
