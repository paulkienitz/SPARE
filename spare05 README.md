# SPARE
### Static Page AJAX to Replace Elements — a lightweight client-side library

- *Release 1 was on March 24, 2015, under the terms of the Apache 2.0 license.*
- *Release 2 was on October 16, 2019.  Added simulateNavigation.*
- *Release 3 was on June 12, 2021.  Improved simulateNavigation.*
- *Release 4 was on August 3, 2022, with a new BSD-like license.  Improved onPopStateRestore.*
- *Release 5 was on __ __ 20__.  Replaced callbacks with Promise, breaking compatibility.*

SPARE is a small client-side AJAX framework which requires no server-side support.  In fact, the case it’s optimized for is when the server provides only plain static HTML content.  It’s also super easy to use: you only need to call one method.

How it’s designed to work was originally inspired by ASP&#46;Net’s `UpdatePanel` control, but as implemented, it’s more similar to jQuery’s `load()` method, at lower cost (and as a tradeoff, less support for downlevel browsers than similarly old versions of jQuery).

To use it, you give it the ID of any element on your page (which we will call the target), the URL of a new page, and an ID on that page.  It replaces the contents of the local document’s target element with the content of the named element on the new page.  SPARE is most seamlessly used when you have a site design where many pages share common markup for headers, navigation, and so on, and the real differences are in a bounded content area.  SPARE lets you load new content into that area without refreshing the rest of the page.  In this use case, often the two IDs will be the same.

In that type of usage, you can ask SPARE to fully simulate navigation as if the pages were being loaded normally instead of partially.  This mode is used by invoking a different method.

You can just as easily select content from pages not resembling the calling page.  You can optionally send POST data as well (though not with simulated navigation), and set a timeout duration.  None of these is required for basic usage.

And if the URL you give returns a page fragment, so you don’t have to select an element within it, that’s even simpler.  That mode works for text content that isn’t even HTML (but don’t try it with binary content, such as an image URL, or it will just look like a mess).

The outcome of either of these calls is a `Promise`, to which you can attach asynchronous followup actions with the `then` member function, or error handling with the `catch` member.  Or, if in an ECMAScript 8 environment, you can `await` the operation in an asynchronous function.  This promise-based design makes SPARE 5 **incompatible** with SPARE 4 and earlier, which used callbacks.

The Javascript API consists of an object named **`SPARE`** with three public methods, one of which you can ignore.  Note that you do not use a `new` operator to instantiate SPARE; it’s a singleton static object.

If this code runs in an environment which does not define `Promise`, or omits any other necessary API feature, then the global `SPARE` singleton will be initialized to `null`, and none of the features will be usable.  You may wish to implement fallback navigation in this case.

--------

### replaceContent method

Of the two main methods, the simpler one is **`SPARE.replaceContent`**, which takes the following arguments, all of string type unless stated otherwise:

> **`target`** (required): either the DOM ID of the target element in your document, or a DOM node object representing that element.  This is the element which will have its contents replaced.  If this is not provided or the ID is not found in your document, the resulting promise is rejected with an error.

> **`contentURL`** (required): the web address of the HTML content to be used for that replacement.  This can be a relative URL for content on the same site as the current page.  (Cross-domain URLs are commonly blocked by browser security anyway.)  The resulting promise will be rejected with an error if this is not provided.

> **`contentElementID`**:  the DOM ID of the element within the downloaded page which will be the source of the replacement content.  If you don’t provide any value (or pass a falsey value such as `""`) then it puts the entire content returned by the URL into your target element.  That technique is most appropriate if the server is set up to return fragmentary pages, instead of complete ones with `<html>` tags.  If a complete page is received and this ID is not given, it will use the content of the `<body>` tag.

> **`timeout`**: a number.  If the new data doesn’t download within this many seconds, the operation fails.  The supported range is from 0 to 3600, and the default is to leave it up to the browser.  Fractional values such as 1.25 are supported.  You can set a different default globally by putting a number in the global variable **`SPARE.timeout`**.  If the time expires, the returned promise will be rejected with an `Error` object, extended with an `httpStatus` property set to 408 (Request Timeout), and `httpMessage` set to "SPARE time limit exceeded" instead of "Request Timeout".  (All internal error messages start with the word "SPARE".)  *Note* that setting a large value does not prevent the browser or host from failing the operation sooner.

> **`postData`**: values to be sent to the URL as form arguments.  If null or undefined, it requests the page with a simple GET.  If you pass a string as this parameter, it must be in form-urlencoded format, like a querystring.  (It can be empty, for a post with no arguments.)  We also support passing `URLSearchParams` or `FormData` objects to encapsulate your upload parameters.  `FormData` can even support file uploads.  (Passing in `ReadableStream`, `BufferSource`, or `Blob` objects is untested.)  `URLSearchParams` is a bit less widely supported than `FormData`, but has polyfills available.

The later parameters are optional, and it is common to call `replaceContent` with only three parameters (or even just two), as most users don't need to specify a timeout or send a post request.

You can set a timeout for all calls by assigning a value to `SPARE.timeout` instead of passing it as a parameter.  That's one of two exposed properties you can set — the other is described in the next section.  If the parameter is passed, it overrides the property.

The value returned by `replaceContent` is a `Promise`.  This class is defined as a native part of ECMAScript 6, which is supported by almost all modern browsers.  It replaces the use of callback parameters in SPARE versions 4 and earlier.  To support browsers which predate that specification, such as Internet Explorer 11, you will need to include a *polyfill* — an additional script which defines the Promise class if it is not already there.  I have tried out three common polyfills in IE 11, which all seem to work perfectly well: [one by Taylor Hakes](https://github.com/taylorhakes/promise-polyfill), [one by Kyle Simpson](https://github.com/getify/native-promise-only), and [one by Katz, Dale, and Penner](https://github.com/stefanpenner/es6-promise).  I will not recommend one over another.

Such browsers will also need a polyfill for the `fetch` API.  SPARE uses `fetch` from release 5 forward.  Older releases used the more cumbersome technology known as XHR.

When the DOM update completes, its promise is resolved.  Any followup operation that you attached via the promise's `then` method will then be executed asynchronously, after the new content is in place.  The value passed to the handler added with `then` will be the target's HTMLElement DOM object.  If you `await` a call of `replaceContent`, that will be its return value.

If the operation fails, the promise will be rejected with the reason being an `Error` object (or perhaps a derived object such as `TypeError` or `URIError`) which has several added properties besides the standard `name` and `message`:

> `contentURL` will be set to the web address you tried to download content from.

> `httpStatus` will, for errors returned by the web host, be the number of the HTTP result code, such as 404 for Not Found.  Negative values are used for errors occurring after a successful download.  A value of -1 is used when the downloaded content does not contain `contentElementID`.  -2 through -4 are used for unexpected failures during the page update — I don't think you'll encounter these.

> `httpMessage` will, in the case of host errors, be set to the brief standard message accompanying an HTTP error, such as “Not Found”, if any was sent.  If the server is using HTTP 2 and sent no message, SPARE may substitute a generic message such as "HTTP status ###", where ### is the httpStatus number.  For other errors it can be any explanatory text.  If the content is downloaded but does not contain an ID that matches `contentElementID`, it will be “SPARE could not find element '\_\_\_' in downloaded content”, where \_\_\_ is the ID you provided.

> `isSPARE` is set to `true`, to help identify SPARE errors if they end up in a general-purpose error handler.

If the failure is an immediate validation error such as `target` not being found or `contentURL` not being provided, then `httpStatus` and `httpMessage` have no value.  The standard `message` property will describe the error.  For other errors, the `message` property will usually consist of `httpStatus` followed by `httpMessage`, but in unexpected cases it could be anything.

If you do not apply the `catch` method to the returned promise (or the second argument of `then`, which is equivalent), you can alternately process this error in a global handler attached to the `unhandledrejection` event.  The event object passed to that handler has properties `promise` and `reason`.  If you are using other promises besides SPARE ones, their errors may end up here too.  That's one case where it's useful to check `e.reason.isSPARE` (assuming your event parameter is named `e`).

If you use `await`, that error object is thrown as an exception once the awaited statement resumes.

--------

### simulateNavigation method

The other main method is **`SPARE.simulateNavigation`**.  This works like `replaceContent` but has the additional effect of adding a history item under the browser’s Back button, and changing the URL visible in the browser’s address box.  This method is intended for a fairly strict and narrow case: when you replace part of a page’s content but wish to behave as if the entire page was replaced.  This makes sense if you have many pages that fit a common template.

The intended idea is that the result of loading the partial page from the given URL should look the same as navigating to that page (only smoother); otherwise, using this method may be inappropriate, and produce results that are confusing to the page visitor.  In other words, you should make sure that if the user fully refreshes the page, the result is consistent with what you displayed with `simulateNavigation`.  If not, the back button may not be able to work correctly, among other issues.

The back button will also misbehave if you perform `simulateNavigation` at page load time.  Avoid doing this — stick to `replaceContent` until it’s time to respond to a user action.  Adding extra stuff to the back button history when the user didn't take any navigating action is not just poor design, it's an abuse.

*Note* that due to browser security, navigation between different domains will not work with `simulateNavigation`; all pages must be within a single website.

The parameters of `simulateNavigation` mostly have the same meanings that they do when used with `replaceContent`, and it returns the same promise.  The final two parameters, `newTitle` and `pretendURL`, are unique to `simulateNavigation`.  The full list of parameters is:

> **`target`** (required): the ID of the existing HTML element which will have its contents replaced, or the DOM node representing that element.

> **`contentURL`** (required): the URL from which new content will be loaded.

> **`contentElementID`**: the ID of the piece of the new content which will be loaded, or omit to use all of it.

> **`newTitle`**: a string which, if not blank, changes the title shown by the browser on the window or tab containing this page.

> **`pretendURL`**: a string which, if not blank, is shown in the address bar, and saved in the Back-button history, instead of `contentURL`.

> **`timeout`**: the number of seconds to wait for the download of new content.

> **`postData`**: content to be sent via a POST request.

> **`contextData`**: any value you want to pass — it will be included in the info transmitted to events associated with this navigation.

Note that if you supply a `postData` argument, *it must be a value that can be serialized*, or it will fail.  Exactly what values are permitted may vary by browser, but the safest option is to pass only strings.  You can make use of the `URLSearchParams` class to assemble the content, but instead of passing that object directly, use its `toString` method to convert it to a safe format.  (`FormData` cannot be converted by any such easy means.)

This method is polymorphic — it has an alternate calling signature which can be used instead of passing all eight arguments sequentially.  The alternate form has four parameters:

> **`target`** (required): the ID of the existing HTML element which will have its contents replaced, or the DOM node representing that element.

> **`contentURL`** (required): the URL from which new content will be loaded.

> **`contentElementID`**: the ID of the piece of the new content which will be loaded, or omit to use all of it.

> **`options`**: an object which contains properties for any or all of the remaining parameters you wish to pass: `newTitle`, `pretendURL`, `timeout`, `postData`, and `contextData`.

The latter signature is useful when you want to use one or two of the later options without filling in empty placeholder values for the options before them.  For example, you can specify a timeout by saying `simulateNavigation(myTarget, myUrl, myElementID, { contextData: myContext })`, whereas otherwise you would have to say something like `simulateNavigation(myTarget, myUrl, myElementID, null, null, null, null, myContext)`.  You may wish to use the `options` syntax even if most are specified, just so that each is explicitly labeled instead of depending on memory of the parameter order.

One gotcha to be aware of with `simulateNavigation` is that pretend URLs saved in the history affect what path is “current” for relative URLs.  Unless all pages and pretend URLs are in the same directory, it’s safer to always use root-relative or absolute URLs throughout any pages that use SPARE.  I recommend root-relative URLs, because browser security does not normally permit us to simulate navigation to any other domains.

The first time `simulateNavigation` is called, it sets up a `popstate` event handler, which is described in the next section.  Without this, when the user clicks the Back button, the page content would not change.  In SPARE 4 and earlier, you had to attach the popstate handler yourself, but it’s now automatic.

This method can optionally take one further step in simulating the loading of a complete page: it can fire the `DOMContentLoaded` event, just as happens after a page is loaded by normal navigation.  This is so that pages can initialize themselves after loading in the same way that they would after arrival from normal navigation.  Whether it does this is decided by a value you assign to the global flag `SPARE.simulateDCL` — the other of the two exposed properties you can set.  If you set it to a truthy value, this event will be triggered just before the returned promise is fulfilled.  Note that the event is *not* triggered by `replaceContent`, only by `simulateNavigation` and `onPopStateRestore`.  Also note that the `load` event, which occurs later than this in actual navigation, is not simulated.

If `SPARE.simulateDCL` is falsey, it still fires an event, but the event is called `SPAREContentLoaded` instead of `DOMContentLoaded`.  You can simply ignore that event, and it will have no effect.  If you are interested in responding to it, you can attach a handler function with `window.addEventListener('SPAREContentLoaded', mySpareContentLoadedHandler);`.  The `Event` object passed to your handler has two added properties which are not present for a `DOMContentLiaded` event after normal navigation: first, the `contextData` value that you passed in, and second, a flag named `pop`.  This flag is false when the event is invoked by `simulateNavigation` and true when it’s invoked by the popstate handler.

--------

### onPopStateRestore event handler

The third method is **`SPARE.onPopStateRestore`**, the popstate handler just mentioned.  There is no need to call this method directly, unless you are wrapping your own handler around the provided one.  This is mainly useful if something must be done before invoking it, or if you identify cases where a full reload or redirect should be done instead.

If overriding the default with your own handler, you can redefine the value of the `onPopStateRestore` member of the SPARE object before the first time `simulateNavigation` is called, with a switcheroo that might look something like this:

```
        var originalPopStateRestore = SPARE.onPopStateRestore;
        SPARE.onPopStateRestore = function (event)
        {
            if (someSpecialCase)
                /* . . . do whatever you need to handle special cases . . . */ ;
            else
                originalPopStateRestore(event);    // for non-special cases, let SPARE do its thing
        };
```

Or you could just attach your handler with `window.addEventHandler('popstate', myPopStateHandler)`, but this is problematic as a means of replacement because you also need to remove the automatic handler, and that isn't added until the first call of `simulateNavigation`.  So you'd have to put a special check into a `then` action to invoke `window.removeEventListener` the first time it's called.  But this is only necessary if you want to override or replace the automatic handler; if you are doing something independent of it, such as highlighting a navigation link to indicate what view the user has currently got open, then you can add your own handler without invoking or removing SPARE's.

\[TODO?  Add a "SPAREbeforePopStateHandler" event which allows aborting the normal handler?\]

Note that when you wrap the provider as in the example above, if you add code code to your handler at the bottom, following the return of `onPopStateRestore`, it will run *before* the content is updated, as the download is asynchronous.  But in the cases where `onPopStateRestore` does an update, it returns a promise which you can attach `then` actions to.  But be sure to test that, because it can also return `undefined` for cases when it took no action.  In rare cases it may return `false`, if it decided that it had to reload the whole page.  In this case any followup steps you add will probably be moot.

If you want to invoke an action after the restoration is complete, you don’t have to add your own handler.  You can just listen for the `DOMContentLoaded` or `SPAREContentLoaded` event, as described above — whichever of the two is selected by `SPARE.simulateDCL`.  Within this event handler you can check the global property `window.history.state` to examine the same state object that is passed to a popstate handler.  However, that value also occurs when the event is fired by `simulateNavigation`.  Check the `pop` property of the event parameter to separate these cases, and disregard `history.state` unless it's true.  The event parameter also includes the `contextData` property that you passed in for the `simulateNavigation` call that this is restoring.

All event handler functions take a single parameter, which is an `Event` object. For the popstate handler itself, that event object has a property called `state`, which refers to the same object that `history.state` does.  When returning to a page that the user navigated to normally, the event is not invoked and this value is null, but when returning to a simulated page done by SPARE, the `state` property's value will be an object with seven members, which describe the change which was made by a previous call of `simulateNavigation`:

> **`targetID`**: the ID of the document element whose contents were replaced (taken from `target`, or from its ID if a DOM object was passed in),

> **`contentURL`**: the URL from which `simulateNavigation` loaded content,

> **`contentElementID`**: the ID of the element extracted from that URL, or null,

> **`newTitle`**: the updated title shown on the page’s window or tab (taken from `newTitle`), or null.

> **`pretendURL`**: the URL shown in the browser's address box, if different from `contentURL`, or null.

> **`contextData`**: the value you passed in to the `simulateNavigation` call that this pop is restoring.

> **`startURL`**: the URL from which this page was initially loaded, before SPARE changed anything.

> **`startTitle`**: the title that was shown on the page's window or tab, before SPARE changed anything.

The overall idea is that if you do two simulated navigations and then hit the Back button, this data describes the first one, and restoring it undoes the second one.  If you then hit Forward, the handler gets the data from the second navigation, so it can be redone.  What `onPopStateRestore` does with this data essentially boils down to `replaceContent(state.targetID, state.contentURL, state.contentElementID)`.  But if the user does a skip back over several history steps, and different targets were updated, the handler may do more than one update.  In this case content downloads may occur in parallel for efficiency.

When returning from simulated navigation to a page that was loaded by real navigation — the original page that `simulateNavigation` started from — the `state` object is simpler, omitting the fields describing the simulated change.  It contains only `startURL` and `startTitle`, and the `targetID` of the first element to be changed from its initial state.  In this case the action boils down in simple cases to `replaceContent(state.targetID, state.startURL, state.targetID)`, restoring the target's original content.

At the time the handler function is called, the browser will have already restored the URL to the address bar, but it will not have changed the title.  The handler does this, along with updating the content.

If extending this functionality, don’t forget that there is also a Forward button, and dropdowns to go back or forward nonsequentially.  From what I've seen of the major browsers, if you use these dropdowns to skip over several navigations, and one of the steps was done with real unsimulated navigation, then the browser will do a full navigation to the URL stored in the history node (`pretendURL`), rather than invoking the popstate handler.

Also note that although `replaceContent` can act on an element that has no ID when you pass the DOM element object directly, such elements are *not* supported for the popstate event, so they should not be passed to `simulateNavigation`.  To restore a page with SPARE when the back button is used, the target element must have an ID.

------

What does the future hold for SPARE?  Maybe I'll look into supporting cross-origin loading with access control headers.  The whole process of restoring past state when the back button is used will probably need ongoing work, as there are many cases that are tricky to get right.  But as for features, I don't really expect to add anything more.

I may at some point convert it from a script into a module, which would allow me to modernize the syntax to ECMAScript 6 levels.  I considered doing that in this release, but at this time some mobile browsers can't load modules.  Now I'm hesitant because the benefits would be minimal.
