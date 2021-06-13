# SPARE
### Static Page AJAX to Replace Elements — a lightweight client-side library

- *Release 1 was on March 24, 2015, under the terms of the Apache 2.0 license.*
- *Release 2 was on October 16, 2019 — same terms.  Added simulateNavigation.*
- *Release 3 was on June 12, 2021 — same terms.  Improved simulateNavigation.*

SPARE is a small client-side AJAX framework which requires no server-side support.  In fact, the case it’s optimized for is when the server provides only plain static HTML pages.  It’s also super easy to use: you only need to call one method.

How it’s designed to work was originally inspired by ASP&#46;Net’s `UpdatePanel` control, but as implemented, it’s more similar to jQuery’s `load()` method, at lower cost (and as a tradeoff, less support for downlevel browsers than 1.x versions of jQuery).

To use it, you give it the ID of any element on your page (which we will call the target), the URL of a new page, and an ID on that page.  It replaces the contents of the local document’s target element with the content of the named element on the new page.  SPARE is most seamlessly used when you have a site design where many pages share common markup for headers, navigation, and so on, and the real differences are in a bounded content area.  SPARE lets you load new content into that area without refreshing the rest of the page.  In this use case, often the two IDs will be the same.

In that scenario, you can ask SPARE to fully simulate navigation as if the pages were being loaded normally instead of partially.  This mode is used by invoking a different method.  In that mode you must supply a `popstate` event handler to support use of the Back button.

You can just as easily select content from pages not resembling the calling page.  You can optionally send POST data as well (though not with simulated navigation at this time).  And there’s an option to invoke callback functions on success or failure.  (We will support a promise-based interface in a future version.)  None of these is required for basic usage.

And if the URL you give returns a page fragment, so you don’t have to select an element within it, that’s even simpler.  That mode works for text content that isn’t even HTML (but don’t try it with binary content, such as an image url, or it will just look like a mess).

--------

The Javascript API consists of an object named **`SPARE`** with five public methods.  Note that you do not use a `new` operator to instantiate SPARE; it’s a singleton static object.

The main method you’ll use is **`SPARE.replaceContent`**, which takes the following arguments, all of string type unless stated otherwise:

> **`elementID`** (required): the DOM ID of the target element in your document, which will have its contents replaced.  If the ID is not found in your document, SPARE throws an immediate exception.

> **`pageURL`** (required): the web address of the HTML content to be used for that replacement.  This can be a relative URL for content on the same site as the current page.  (Cross-domain URLs are commonly blocked by browser security anyway.)

> **`newElementID`**:  the DOM ID of the element within the downloaded page which will be the source of the replacement content.  If you don’t provide any value, then it puts the entire content returned by the URL into your target element.  That technique is most appropriate if the server is set up to return fragmentary pages, instead of complete ones with `<html>` tags.  If a complete page is received and this ID is not given, it will use the content of the `<body>` tag.  (Extracting the body may be unreliable in Internet Explorer 9.  This problem does not affect any other IE version.)

> **`postData`**: values to be sent to the URL as form arguments.  If null or undefined, it requests the page with a simple GET; to do a POST with no arguments, pass `""`.  Version 1 of SPARE supported only form-urlencoded strings, not multipart posts, and if you pass a string as this parameter, it still must be encoded in that format.  But version 2 supports alternate types of post data, including `URLSearchParams` and `FormData` objects if the browser is new enough to support them.  `URLSearchParams` does the form urlencoding for you, and `FormData` translates into multipart/form-data format, which supports file uploads.  (Passing in `ReadableStream`, `BufferSource`, or `Blob` objects is untested.)  `URLSearchParams` is less widely available than `FormData`, but has polyfills available.

> **`callbackContextData`**: an arbitrary object which is passed as the first argument to whichever of `onSuccess` or `onFailure` is invoked, so you can give them some information about the context in which they were called.

> **`onSuccess`**: a function to be invoked after the new content is successfully loaded.  If you pass a string, it will be executed with `eval`.  If it’s a function object, it will be passed the `callbackContextData` value.  If defaulted, no action is taken after updating the content of your target element.  Any exceptions that occur in invoking it will pass through uncaught.  You can set a default value globally by assigning the function to the global variable **`SPARE.onSuccess`**.

> **`onFailure`**: similar, but invoked if there’s a failure in loading the new content.  Again, the first argument is your `callbackContextData` value.  The second argument passed to it is an HTTP result number, such as 404 for page not found, and the third is the text of the error message received.  If the onFailure argument is not given, the default failure behavior is to navigate the browser window to the `pageURL` value passed in.  That is an appropriate fallback if you’re just using AJAX to smooth transitions during normal navigation, but  will not be useful if the server is returning only fragmentary pages.  Again, exceptions are not caught.  You can set a default value globally by assigning the function to the global variable **`SPARE.onFailure`**.  *NOTE*: the error number may also be negative, if SPARE fails to use the content after a successful download:

>> -1 means that `newElementID` was not found in the downloaded content.

>> -3 means an unexpected exception was caught while importing the content into the document.  (-2 could be returned by SPARE version 1, but is not used anymore.)

>> 0 is also possible, with empty or meaningless text.  Requests do sometimes fail with no explanation available.  This can happen, for instance, when making a forbidden cross-site request.

> **`transitionalContentID`** \[IGNORED\]: a legacy parameter that no longer does anything, and is present only to retain API compatibility with earlier releases.  The global variable **`SPARE.transitionalContentID`** is also ignored.

> **`timeout`**: a number.  If the new data doesn’t download within this many seconds, the operation fails.  The supported range is from 0 to 3600, and the default is to leave it up to the browser.  Fractional values such as 1.25 are supported.  You can set a different default globally by putting a number in the global variable **`SPARE.timeout`**.  If the time expires, `onFailure` will be called with error code 408 (Request Timeout), with the error message being "SPARE time limit exceeded" instead of "Request Timeout".  (All internal messages to `onFailure` start with the word "SPARE".)  *Note* that setting a large value does not guarantee that the browser won’t fail the operation sooner.

All of these parameters except the first two are optional.  Furthermore, if the final parameter you pass in is a number, it will be taken as `timeout` even if other parameters before it are absent.  This means the function can be called with any one of the following additional polymorphic signatures:

```
replaceContent(elementID, pageURL, timeout)
replaceContent(elementID, pageURL, newElementID, timeout)
replaceContent(elementID, pageURL, newElementID, postData, timeout)
replaceContent(elementID, pageURL, newElementID, postData, callbackContextData, onSuccess, timeout)
replaceContent(elementID, pageURL, newElementID, postData, callbackContextData, onSuccess, onFailure, timeout)
```

--------

The second method is **`SPARE.simulateNavigation`**.  This works like `replaceContent` but has the additional effect of adding a history item under the browser’s Back button, and changing the URL visible in the browser’s address box.  This method is intended for a fairly strict and narrow case: when you replace part of a page’s content but wish to behave as if the entire page was replaced.  This makes sense if you have many pages that fit a common template.  The result of loading the partial page from the given URL should look the same as navigating to that page (only smoother); otherwise, using this method may be inappropriate, and produce results that are confusing to the page visitor.  *Note* that due to browser security, navigation between different domains will not work with `simulateNavigation`; all pages must be within a single website.

The parameters of `simulateNavigation` mostly have the same meanings that they do when used with `replaceContent`.  Only the final two parameters, `newTitle` and `pretendURL`, are unique to `simulateNavigation`.  The latter is new in release 03.  The full list of parameters is:

> **`elementID`** (required): the ID of the existing HTML element which will have its contents replaced.

> **`pageURL`** (required): the URL from which new content will be loaded.

> **`newElementID`**: the ID of the piece of the new content which will be loaded, or blank to use all of it.

> **`callbackContextData`**: arbitrary value passed to `onSuccess` or `onFailure`.

> **`onSuccess`**: callback function or expression invoked after new content is loaded.

> **`onFailure`**: callback function or expression invoked if the new content cannot be loaded.

> **`timeout`**: the number of seconds to wait for the download of new content.

> **`newTitle`**: a string which, if not blank, changes the title shown by the browser on the window or tab containing this page.

> **`pretendURL`**: a string which, if not blank, is shown in the address bar, and saved in the Back-button history, instead of the `pageURL` value where the content actually comes from.

Note that this method does not have the `postData` or `transitionalContentID` parameters that `replaceContent` offers.  Those features are not supported by this method.  We could in theory add `postData`, but it would be risky: the range of data that could be supplied to it may be sharply restricted, and it may not be possible to accurately pretest whether a post parameter will avoid causing exceptions later.

Also, at this time, `simulateNavigation` does not support omitting arguments before `timeout` the way that `replaceContent` does.

**Important:** In order to use `simulateNavigation` effectively, you *must* set up an `popstate` event handler.  Otherwise, when the user clicks the Back button, the page content will not change!

This event handler can be set by going `window.onpopstate = myPopStateHandler;` or `window.addEventListener('popstate', myPopStateHandler);`.  The handler function takes a single parameter, which will be an object with a property called `state`.  This `state` property will be null when returning to a page that the user actually navigated away from, but when returning from simulated navigation done by SPARE, the property will contain an object with five members:

> **`oldId`**: the ID of the document element whose contents were replaced (taken from `elementID`),

> **`url`**: the URL from which `simulateNavigation` loaded content (taken from `pageURL`),

> **`newId`**: the ID of the element extracted from that URL (taken from `newElementID`),

> **`title`**: the title shown on the page’s window or tab (taken from `newTitle`).

> **`showUrl`**: the URL shown in the browser's address box, if different from `url` (taken from `pretendURL`).

If the user presses the Back button on the first page loaded by `simulateNavigation`, to return to the original page as first loaded from the site, then the `state` property will not contain any of those members, but instead will have these two:

> **`startURL`**: the URL of the original page before `simulateNavigation` updated it.

> **`startTitle`**: the title that was shown on the window or tab for that original page.

If the user presses Back under other conditions, such as between two pages that did not use `simulateNavigation` at all, then you can expect the `state` property to be null.

At the time your handler function is called, the browser will have restored the URL to the address bar, but it will *not* have changed any of the content visible on the page, or the title.  Your handler needs to do this.  The simplest way is to reload the old URL, but you will probably want to simulate this with `replaceContent`.  Make sure you only do this if the `state` property of the event parameter contains the object just described.  Here is a simple example.  (If `replaceContent` fails in this example, it will fall back by navigating to the old URL, which is usually what you want in this scenario.)  If this example is sufficient for your needs, then you can just use the provided `SPARE.onPopStateHandler` instead of writing it out yourself — see below.

```
function myPopStateHandler(event)
{
    if ("state" in event && event.state)
        if ("url" in event.state && "oldId" in event.state)
        {
            SPARE.replaceContent(event.state.oldId, event.state.url, event.state.newId);
            document.title = event.state.title;
        }
        else if ("startURL" in event.state)
            location.replace(event.state.startURL);   // refresh
}
```

If extending this functionality, don’t forget that there is also a Forward button, and dropdowns to go back or forward nonsequentially.  For instance, trying to handle the `startURL` case with `replaceContent` may yield unexpected results if they used Forward.

Another gotcha to be aware of with `simulateNavigation` is that URLs pushed into the history affect what directory is “current” for relative URLs.  Unless all pages are in the same directory, it’s safer to always use root-relative or absolute URLs.  I recommend root-relative URLs, because browser security does not permit us to simulate navigation to any other domains.

--------

The third method is **`SPARE.onPopStateRestore`**.  It is exactly like the `myPopStateHandler` example given above.  If you’re using `simulateNavigation` and don’t need anything fancier than that example, then you can just add one line such as `window.onpopstate = SPARE.onPopStateRestore;` and be ready to go.  There is no need to call this method directly, unless you are invoking it from a wrapper function so that you can perform additional actions in response to the popstate event.

--------

The fourth method is **`SPARE.canSimulateNavigation`**.  This takes no parameters and returns a boolean value.  If it returns false, `simulateNavigation` is not supported by your browser, and cannot be used — it will throw an exception.  Internet Explorer 9 and earlier are browsers for which it returns false, as are any browser versions older than about 2011.  If you want to use `simulateNavigation`, check this early, and provide a fallback path to do traditional whole-page navigation if `canSimulateNavigation` returns false.

--------

The final method is **`SPARE.supportLevel`**, which takes no arguments.  It returns a number indicating how well SPARE expects to work in the current browser environment.  It’s a good practice to check this before invoking `replaceContent`, and fall back to a non-AJAX approach if the value it returns is too low.  The values it can return are:

> **0**:  This browser has insufficient support and SPARE will not operate at all.

> **2**:  All features of `replaceContent` should be fully functional (though `simulateNavigation` might not work).

> (SPARE release 1 could also return the values **1** and **3** from `supportLevel`, but these are no longer used.)

In release 2 there were browsers which could return a nonzero value from `supportLevel` but return false from `canSimulateNavigation`.  This is no longer the case, and the two are now equivalent.

**IMPORTANT**:  It is easier than you think to get into a state where your `supportLevel` value is 0 and SPARE doesn’t work.  This doesn’t just happen if your user is running something ancient like IE 6 — it will happen even in IE 11 if your page provokes IE into Compatibility View mode.  **Make sure your markup is up to snuff so IE uses Standards mode.**

--------

Savvy readers may note that in the most modern browsers, XHR is somewhat obsolete, replaced by the `fetch` API.  I expect that a future version of SPARE will switch over to using `fetch`.  That version will no longer use `onSuccess` and `onFailure` callback parameters, but instead will return a `Promise` object, which will allow you to handle success with a `then` method (or let you use an `await` expression) and failure with a `catch` method.  With the callback hooks gone, `replaceContent` has only five parameters instead of eight.

In fact, three future versions of SPARE have already been drafted.  One returns a `Promise` but is still based on XHR; a second uses `fetch`, and the third also uses `fetch` but is implemented as an ECMAScript 6 module.  All three are compatible with each other at the API level, but are incompatible with SPARE versions 1, 2, and 3.  These represent successive steps of abandoning support for older browsers.   `Promise` support got going in 2014 and came to Edge 12 in 2015 (with polyfills available to stretch that further back).  Then `fetch` came along in 2015 and reached Edge 14 in 2016 (the `AbortController` class needed for efficient timeouts didn’t come to Chrome until 2018, but we can manage without it).  Finally, modules came to the majority of browsers in 2017.

In these future versions, there are no longer any `supportLevel` or `canSimulateNavigation` methods.  If the browser does not have sufficient support, then the singleton global `SPARE` object will be initialized to null.  If it’s present, then all features will work.
