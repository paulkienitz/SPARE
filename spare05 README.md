# SPARE
### Static Page AJAX to Replace Elements — a lightweight client-side library

- *Release 1 was on March 24, 2015, under the terms of the Apache 2.0 license.*
- *Release 2 was on October 16, 2019 — same terms.  Added simulateNavigation.*
- *Release 3 was on June 12, 2021 — same terms.  Improved simulateNavigation.*
- *Release 4 was on __ __ __, now using a looser BSD-like license.  Replaced callbacks with Promise.*

SPARE is a small client-side AJAX framework which requires no server-side support.  In fact, the case it’s optimized for is when the server provides only plain static HTML pages.  It’s also super easy to use: you only need to call one method.

How it’s designed to work was originally inspired by ASP.Net’s `UpdatePanel` control, but as implemented, it’s more similar to jQuery’s `load()` method, at lower cost (and as a tradeoff, less support for downlevel browsers than some versions of jQuery).

To use it, you give it the ID of any element on your page (which we will call the target), the URL of a new page, and an ID on that page.  It replaces the contents of the local document’s target element with the content of the named element on the new page.  SPARE is most seamlessly used when you have a site design where many pages share common markup for headers, navigation, and so on, and the real differences are in a bounded content area.  SPARE lets you load new content into that area without refreshing the rest of the page.  In this use case, often the two IDs will be the same.

In that scenario, you can ask SPARE to fully simulate navigation as if the pages were being loaded normally instead of partially.  This mode is used by invoking a different method.  In that mode you must attach a `popstate` event handler to support use of the Back button.  A suitable handler is included.

You can just as easily select content from pages not resembling the calling page.  You can optionally send POST data as well (though not with simulated navigation), and set a timeout duration.  None of these is required for basic usage.

And if the URL you give returns a page fragment, so you don’t have to select an element within it, that’s even simpler.  That mode works for text content that isn’t even HTML (but don’t try it with binary content, such as an image url, or it will just look like a mess).

The outcome of this is a Promise, to which you can attach asynchronous followup actions with the `then` member function, or error handling with the `catch` member.  Or, if in an ECMAScript 8 environment, you can `await` the operation in an asynchronous function.  This promise-based design makes SPARE 4 **incompatible** with SPARE 3 and earlier, which used callbacks.

--------

The Javascript API consists of an object named **`SPARE`** with four public methods and one settable property.  Note that you do not use a `new` operator to instantiate SPARE; it’s a singleton static object.

If this code runs in an environment which does not define `Promise`, or omits any other necessary API feature, then the global `SPARE` singleton will be initialized to `null`, and none of the features will be usable.  You may wish to implement fallback navigation in this case.

The main method you’ll usually use is **`SPARE.replaceContent`**, which takes the following arguments, all of string type unless stated otherwise:

> **`target`** (required): either the ID of the target element in your document, or the DOM object of that element.  It will have its contents replaced.  If the ID is not found in your document, the method fails immediately, returning an `Error` object to any `catch` handler you’ve attached.  In SPARE 3 and earlier this parameter was called `elementID` and had to be a string.

> **`contentURL`** (required): the web address of the HTML content to be used for that replacement.  This can be a relative URL for content on the same site as the current page.  (Cross-domain URLs are commonly blocked by browser security anyway.)  In SPARE 3 and earlier this was called `pageURL`.

> **`contentElementID`**:  the ID of the element within the downloaded page which will be the source of the replacement content.  If you don’t provide any value, then it puts the entire content returned by the URL into your target element.  That technique is most appropriate if the server is set up to return fragmentary pages, instead of complete ones with `<html>` tags.  If a complete page is received and this ID is not given, it will use the content of the `<body>` tag.  In SPARE 3 and earlier this was called `newElementID`.

> **`postData`**: values to be sent to the URL as form arguments.  If null or undefined, it requests the page with a simple GET.  Version 1 of SPARE supported only form-urlencoded strings, not multipart posts, and if you pass a string as this parameter, it still must be encoded in that format (or be empty, for a post with no arguments).  But later versions support alternate types of post data, including `URLSearchParams` and `FormData` objects if the browser is new enough to support them.  `URLSearchParams` does the form urlencoding for you, and `FormData` translates into multipart/form-data format, which supports file uploads.  (Passing in `ReadableStream`, `BufferSource`, or `Blob` objects is untested.)  `URLSearchParams` is less widely available than `FormData`, but has polyfills available.

> **`timeout`**: a number.  If the new data doesn’t download within this many seconds, the operation fails.  The supported range is from 0 to 3600, and the default is to leave it up to the browser.  Fractional values such as 1.25 are supported.  You can set a different default globally by putting a number in the global variable **`SPARE.timeout`**.  If the time expires, the returned promise will be rejected with an `Error` object, coniaining an `httpStatus` value of 408 (Request Timeout), with `httpMessage` being "SPARE time limit exceeded" instead of "Request Timeout".  (All internal `httpMessage` texts start with the word "SPARE".)  *Note* that setting a large value does not prevent the browser or host from failing the operation sooner.

All of these parameters except the first two are optional.  As mentioned, you can set a timeout for all calls by assigning a value to `SPARE.timeout` instead of passing it as a parameter.  That's one of three exposed properties — see the `onPopStateRestore` section below for the other two.

The value returned by `replaceContent` is a `Promise`.  This class is defined as a native part of ECMAScript 6, and replaces the use of callback parameters in SPARE versions 3 and earlier.  To support browsers which predate that specification, such as Internet Explorer 11, you will need to include a *polyfill* — an additional script which defines the Promise constructor if it is not already there.  I have tried out three common polyfills in IE 11, which all seem to work well enough: [one by Taylor Hakes](https://github.com/taylorhakes/promise-polyfill), [one by Kyle Simpson](https://github.com/getify/native-promise-only), and [one by Katz, Dale, and Penner](https://github.com/stefanpenner/es6-promise).  I will not recommend one over another.

When the DOM update completes, its promise is resolved.  Any followup operation that you attached via the promise's `then` method will then be executed asynchronously.  The value passed to the handler added with `then` will be the target's HTMLElement DOM object.  If you `await` a call of `replaceContent`, that will be its return value.

If the operation fails, the promise will be rejected with the reason being an `Error` object which has several added properties:
> `url` will be set to the web address you tried to download content from.
> `httpMessage` will, in the case of server errors, be set to the brief standard message accompanying an HTTP error, such as “Not Found”.  For other errors it can be any explanatory text.  If the content is downloaded but does not contain an ID that matches `contentElwmentID`, it will be “SPARE could not find element '\_\_\_' in downloaded content”, where \_\_\_ is the ID value you provided.
> `httpStatus` will, for server errors, be the number of the HTTP result code, such as 404 for Not Found.  Negative values are used for errors occurring after a successful download.  A value of -1 is used when the downloaded content does not contain `contentElementID`.  -3 is used if an exception occurs during the page update — a situation I do not expect.  0 is used for immediate validation errors such as `target` not being found or `contentURL` being blank.
> `isSPARE` is always `true`, to help identify SPARE errors if they end up in a general-purpose error handler.

The standard `message` property will usually consist of `httpStatus` followed by `httpMessage`, unless the status is 0, in which case `message` and `httpMessage` should be the same, or the status is -3, in which case `message` comes from the original exception and `httpMessage` prepends “SPARE caught exception \_\_\_:” to that, where \_\_\_ is the type of error object caught.

If you do not apply the `catch` method to the returned promise (or the second argument of `then`, which is equivalent), you can alternately process this error in a global handler attached to the `unhandledrejection` event.  The event object passed to that handler has properties `promise` and `reason`.  If you are using other promises besides SPARE ones, their errors may end up here too.  That's when it's useful to check `e.reason.isSPARE` (assuming your event parameter is named `e`).

If you use `await`, that error object is thrown as an exception.

--------

The second method is **`SPARE.simulateNavigation`**.  This works like `replaceContent` but has the additional effect of adding a history item under the browser’s Back button, and changing the URL visible in the browser’s address box.  This method is intended for a fairly strict and narrow case: when you replace part of a page’s content but wish to behave as if the entire page was replaced.  This makes sense if you have many pages that fit a common template.

The result of loading the partial page from the given URL should look the same as navigating to that page (only smoother); otherwise, using this method may be inappropriate, and produce results that are confusing to the page visitor.  In other words, you should make sure that if the user fully refreshes the page, the result is consistent with what you displayed with `simulateNavigation`.  If not, the back button may not be able to work correctly, among other issues.

The back button may also misbehave if you perform `simulateNavigation` at page load time.  Avoid doing this — stick to `replaceContent` until it’s time to respond to a user action.  Adding extra stuff to the back button history when the user didn't take any navigating action is not just poor design, it's an abuse.

*Note* that due to browser security, navigation between different domains will generally not work with `simulateNavigation`; all pages must be within a single website.

The parameters of `simulateNavigation` mostly have the same meanings that they do when used with `replaceContent`, and it returns the same promise.  The final two parameters, `newTitle` and `pretendURL`, are unique to `simulateNavigation`.  The full list of parameters is:

> **`target`** (required): the ID of the existing HTML element which will have its contents replaced, or the DOM object of that element.

> **`contentURL`** (required): the URL from which new content will be loaded.

> **`contentElementID`**: the ID of the piece of the new content which will be loaded, or blank to use all of it.

> **`timeout`**: the number of seconds to wait for the download of new content.

> **`newTitle`**: a string which, if not blank, changes the title shown by the browser on the window or tab containing this page.

> **`pretendURL`**: a string which, if not blank, is shown in the address bar, and saved in the Back-button history, instead of the `contentURL` value where the content actually comes from.

Note that this method does not have the `postData` parameter that `replaceContent` offers.  That feature is not supported by this method.  We could in theory add it, but it would be risky: the range of data that could be supplied to it may be sharply restricted by some browsers, and it may not be possible to accurately pretest whether a post parameter will avoid causing exceptions later.

**Important:** In order to use `simulateNavigation` effectively, you *must* set up an `popstate` event handler.  Otherwise, when the user clicks the Back button, the page content will not change!

This event handler can be set by going `window.onpopstate = myPopStateHandler;` or `window.addEventListener('popstate', myPopStateHandler);`.  The handler function takes a single parameter, which will be an event object with a property called `state`, which is also available globally as `window.history.state`.  When returning to a page that the user navigated to normally, the event is not invoked and `history.state` is null, but when returning to a simulated page done by SPARE, the `state` property's value will be an object with seven members:

> **`targetID`**: the ID of the document element whose contents were replaced (taken from `target`, or from its ID if a DOM object was passed in),

> **`contentURL`**: the URL from which `simulateNavigation` loaded content,

> **`contentElementID`**: the ID of the element extracted from that URL, or null,

> **`title`**: the updated title shown on the page’s window or tab (taken from `newTitle`), or null.

> **`pretendURL`**: the URL shown in the browser's address box, if different from `contentURL`, or null.

> **`startURL`**: the URL from which this page was initially loaded, before SPARE changed anything.

> **`startTitle`**: the title that was shown on the page's window or tab, before SPARE changed anything.

Note that most of these fields had different names in SPARE 3, and some were not present at all in that version.  Since SPARE 4 is already incompatible in other ways, I figured this would be the best time to correct the poor names that were formerly used.

When returning from simulated navigation to a page that was loaded by real navigation — the page that `simulateNavigation` started from — your popstate handler has to have an additional code path to restore it.  In this case you receive a different `state` object which is simpler, omitting the fields used for calling `replaceContent`.  It contains:

> **`targetID`**: the ID of the document element which had its contents replaced.  If no other elements have been modified, you may only need to restore this part.

> **`startURL`**: the URL of the original page before `imulateNavigation` updated it.

> **`startTitle`**: the title that was shown on the window or tab for that original page.

At the time your handler function is called, the browser will have restored the URL to the address bar, but it will *not* have changed any of the content visible on the page, or the title.  If `simulateNavigation` was used, your handler needs to do this, either with `replaceContent` or with a full reload.  Make sure you only do the former if the `state` property of the event parameter contains the object with `targetID` and `contentURL` in it.  Here is a basic example handler.  (If `replaceContent` fails in this example, which it shouldn't, it will fall back by navigating the whole page to the old URL, which is usually what you want in this scenario.)  If this example is sufficient for your needs, then you can just use the provided `SPARE.onPopStateHandler` instead of writing it out yourself — see below.

```
function myPopStateHandler(event)
{
    if ("state" in event && event.state && "targetID" in event.state)
        if ("contentURL" in event.state)
        {
            document.title = event.state.title;
            SPARE.replaceContent(event.state.targetID, event.state.contentURL, event.state.contentElementID)
                 .catch(function () { location.replace(event.state.pretendURL || event.state.contentURL); });
        }
        else
            location.replace(event.state.startURL);
    }
}
```

If extending this functionality, don’t forget that there is also a Forward button, and dropdowns to go back or forward nonsequentially.  From what I've seen of the major browsers, if you use these dropdowns to skip over several navigations, and one of the steps was done with real unsimulated navigation, then the browser will do a full navigation to the URL stored in the history node (`pretendURL`), rather than invoking your popstate handler.

Another gotcha to be aware of with `simulateNavigation` is that URLs pushed into the history affect what directory is “current” for relative URLs.  Unless all pages are in the same directory, it’s safer to always use root-relative or absolute URLs.  I recommend root-relative URLs, because browser security does not permit us to simulate navigation to any other domains.

Also note that although `replaceContent` can act on an element that has no ID when you pass the DOM element object directly, such elements are *not* supported for the popstate event, so they should not be passed to `simulateNavigation`.  To restore a page with SPARE when the back button is used, the target element must have an ID.

--------

The third method is **`SPARE.onPopStateRestore`**.  It is somewhat like the `myPopStateHandler` example given above, but with additional features.  If you’re using `simulateNavigation` and don’t need anything fancier than that example, then you can just add one line such as `window.onpopstate = SPARE.onPopStateRestore;` and be ready to go.

There is no need to call this method directly, unless you are invoking it from a wrapper function so that you can perform additional actions in response to the popstate event.  In that case, `onPopStateRestore` returns the resulting promise if it invoked `replaceContent`, or `undefined` if it did not.

If you don't need that promise, it may make just as much sense to do any additional work in your own separate handler, such as for instance highlighting one link in your navigation area as currently selected.  This can happen in parallel with the content update.  For example:

```
function myHighlighter(e)
{
    if ("state" in e && e.state)
    {
        var currentPage = e.state.pretendURL || e.state.startURL;
        // ...highlight the link that matches currentPage
    }
}

window.addEventListener('popstate', SPARE.onPopStateRestore);
window.addEventListener('popstate', myHighlighter);
```

The `SPARE.onPopStateRestore` handler has the ability to optimize restoring the original page with `replaceContent` instead of a full reload.  It does this only if all `simulateNavigation` changes have used the same target.  It restores the page by loading the target's contents from the `startURL` page.  But note that this optimization is not always usable.  For instance, if your page works by programmatically modifying the target contents when first loaded (for instance, by doing an initial `replaceContent` based on a parameter), then reloading the target from the server won't restore it correctly.  You can turn off the optimization, and have it do a reload instead, by setting the boolean property `SPARE.fullRestore` to true.

--------

The fourth and final method is **`targetIDs`**.  It takes no parameters, and returns an array of strings.  Each string in the array is a distinct ID of a target element in your document which has been updated by `replaceContent` or `simulateNavigation`.  This list gets reset whenever a new page is loaded with true navigation.

If you make several consecutive updates to the same target element, this will return only the one ID.  In this case, when one target is the subject of all updates, the popstate handler can take advantage of this knowledge in the case where `startURL` is set but `contentURL` is not — that is, when returning a page to its original form prior to all simulated navigation.  If several targets have been updated, it's usually best to reload the whole page, but if only one has changed, it can use `replaceContent` instead.  If your own popstate handler is fancy, you may be able to do this in cases with two or more targets, but it’ll be up to you to keep track of the moving parts to pull that off.

--------

Internally, the download is still performed with `XMLHttpRequest`, known as XHR for short.  Savvy readers may note that in modern browsers, XHR is somewhat obsolete, replaced by the `fetch` API.  I expect that a future version of SPARE will switch over to using `fetch`.  For now I’m deferring that change as browser support for it is not quite to a universal enough level yet.  That version of SPARE is already drafted, and might become SPARE 5, if a good reason comes along for releasing an update.

This modernization keeps making SPARE simpler.  The original 2015 release was by far the most complicated and difficult version, even though it couldn’t simulate navigation yet, because of backward browsers that were still in fairly common use back then.  (It was also a lot slower than later versions, in some browsers.)

I’ve also drafted a future version that uses `fetch` but is implemented as an ECMAScript 6 module instead of as an ordinary script.  This allows modern syntax such as arrow functions.

Both fetch-based versions are compatible with this one at the API level, and are incompatible with SPARE versions 1, 2, and 3.  They represent successive steps of abandoning support for older browsers.  `Promise` support got going in 2014 and came to Edge 12 in 2015.  Then `fetch` came along in 2015, and reached Edge in 2016 and Safari in 2017 (the `AbortController` class needed for efficient timeouts didn’t come to Chrome until 2018, but we can manage without it).  Finally, modules came to the majority of browsers in 2017.

So I probably won’t bother with the non-module fetch version.  If the module is SPARE 5, the workaround to support old browsers would be to use `<script nomodule>` tags to load SPARE 4 and any polyfills.  Just make sure to avoid modern syntax such as arrow functions in non-module scripts.