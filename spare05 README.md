# SPARE
### Static Page AJAX to Replace Elements — a lightweight client-side library

- *Release 1 was on March 24, 2015, under the terms of the Apache 2.0 license.*
- *Release 2 was on October 16, 2019.
Added simulateNavigation.*
- *Release 3 was on June 12, 2021.
Improved simulateNavigation.*
- *Release 4 was on August 3, 2022, with a new BSD-like license.
Improved onPopStateRestore.*
- *Release 5 was on __ __ 20__.
Replaced callbacks with Promise, breaking compatibility.*

SPARE is a small client-side AJAX framework which requires no server-side support.
In fact, the case it’s optimized for is when the server provides only plain static HTML content.
It’s also super easy to use: you only need to call one method.

How it’s designed to work was originally inspired by ASP&#46;Net’s `UpdatePanel` control, but as implemented, it’s more similar to jQuery’s `load()` method, at lower cost (and as a tradeoff, less support for downlevel browsers than similarly old versions of jQuery).

To use it, you give it the ID of any element on your page (which we will call the target), the URL of a new page, and an ID on that page.
It replaces the contents of the local document’s target element with the content of the named element on the new page.
SPARE is most seamlessly used when you have a site design where many pages share common markup for headers, navigation, and so on, and the real differences are in a bounded content area.
SPARE lets you load new content into that area without refreshing the rest of the page.
In this use case, often the two IDs will be the same.

In that type of usage, you can ask SPARE to fully simulate navigation as if the pages were being loaded normally instead of partially.
This mode is used by invoking a different method.

You can just as easily select content from pages not resembling the calling page.
You can optionally send POST data as well, and set a timeout duration.
None of these is required for basic usage.

And if the URL you give returns a page fragment, so you don’t have to select an element within it, that’s even simpler.
That mode works for text content that isn’t even HTML (but don’t try it with binary content, such as an image URL, or it will just look like a mess).

The outcome of either of these calls is a `Promise`, to which you can attach asynchronous followup actions with the `then` member function, or error handling with the `catch` member.
Or, if in an ECMAScript 8 environment, you can `await` the operation in an asynchronous function.
This promise-based design makes SPARE 5 **incompatible** with SPARE 4 and earlier, which used callbacks.

The Javascript API consists of an object named **`SPARE`** with two public methods.
Note that you do not use a `new` operator to instantiate SPARE; it’s a singleton static object.

If this code fails to load, or runs in an environment which omits a necessary API feature, then the global `SPARE` singleton will be `undefined`, and none of the features will be usable.
You may wish to implement fallback navigation in this case.
And this will not load in old browsers that earlier SPARE versions used to support, such as IE 11, beause it is now a **module** rather than a traditional script.
With SPARE 4, you imported it with a separate script tag, uch as this:

```
    <script type="text/javascript" src="path/spare04min.js"></script>
```

But since this is a module, you instead use an `import` statement within the script you’re invoking it from, like  this:

```
    <script type='module'>
        import {SPARE} from "path/spare05min.js";

        // ...code to invoke SPARE
```

Or maybe dynamically, like this:

```
    <script type='text/javascript'>
        // ...
        if (IWantToActivateSPARE)
        {
            import("path/spare05min.js").then(module =>
            {
                let SPARE = module.SPARE;
                // ...code to invoke SPARE
            });
        }
```

Here is the API of the `SPARE` object, starting with its methods:

--------

### replaceContent method

Of the two methods, the simpler one is **`SPARE.replaceContent`**, which takes the following arguments, all of string type unless stated otherwise:

> **`target`** (required): either the DOM ID of the target element in your document, or a DOM node object representing that element.
This is the element which will have its contents replaced.
If this is not provided or the ID is not found in your document, the resulting promise is rejected with an error.

> **`contentURL`** (required): the web address of the HTML content to be used for that replacement.
This can be a relative URL for content on the same site as the current page.
(Cross-domain URLs are commonly blocked by browser security anyway.)  The resulting promise will be rejected with an error if this is not provided.

> **`contentElementID`**:  the DOM ID of the element within the downloaded page which will be the source of the replacement content.
If you don’t provide any value (or pass a falsey value such as `""`) then it puts the entire content returned by the URL into your target element.
That technique is most appropriate if the server is set up to return fragmentary pages, instead of complete ones with `<html>` tags.
If a complete page is received and this ID is not given, it will use the content of the `<body>` tag.

> **`postData`**: values to be sent to the URL as form arguments.
If null or undefined, it requests the page with a simple GET.
If you pass a string as this parameter, it should be in form-urlencoded format, like a querystring.
(It can be empty, for a post with no arguments.)  We also support passing `URLSearchParams` or `FormData` objects to encapsulate your upload parameters.
`FormData` can even support file uploads.
(Passing in `ReadableStream`, `BufferSource`, or `Blob` objects is untested.)

> **`timeout`**: a number.
If the new data doesn’t download within this many seconds, the operation fails.
The supported range is from 0 to 3600, and the default is to leave it up to the browser.
Fractional values such as 1.25 are supported.
You can set a different default globally by putting a number in the global variable **`SPARE.timeout`**.
If the time expires, the returned promise will be rejected with a `SPAREError` object, extended with an `httpStatus` property set to 408 (Request Timeout), and `httpMessage` set to "SPARE time limit exceeded (_ seconds)" instead of "Request Timeout".
(All internal error messages start with the word "SPARE".)  *Note* that setting a large value does not prevent the browser or host from failing the operation sooner.

The later parameters are optional, and it is common to call `replaceContent` with only three parameters (or even just two), as most users don’t need to specify a timeout or send a post request.

You can set a timeout for all calls by assigning a value to the `SPARE.timeout` property instead of passing it as a parameter.
That’s one of several exposed properties you can set — the other are described in a later section.
If the parameter is passed, it overrides the property.

The method is polymorphic in a small way, in that you can omit `postData` and pass `timeout` as the fourth parameter.
The value passed must be a number for it to be taken as `timeout`.

The value returned by `replaceContent` is a `Promise`.
This class is defined as a native part of ECMAScript 6, which is supported by all modern browsers.
It replaces the use of callback parameters in SPARE versions 4 and earlier.

When the DOM update completes, its promise is resolved.
Any followup operation that you attached via the promise’s `then` method will then be executed asynchronously, after the new content is in place.
The value passed to the handler added with `then` will be the target’s HTMLElement DOM object.
If you `await` a call of `replaceContent`, that will be its return value.

If the operation fails, the promise will be rejected with the reason being some derived version of an `Error` object (usually a `SPAREEror` object) which has several added properties besides the standard `name` and `message`:

> `contentURL` will be set to the web address you tried to download content from.

> `httpStatus` will, for errors returned by the web host, be the number of the HTTP result code, such as 404 for Not Found.
Negative values are used for errors occurring after a successful download.
A value of -1 is used when the downloaded content does not contain `contentElementID`.
Other negative values are used for unexpected failures during the page update, which normally you should never encounter.

> `httpMessage` will, in the case of host errors, be set to the brief standard message accompanying an HTTP error, such as “Not Found”, if any was sent.
If the server is using HTTP 2 and sent no message, SPARE may substitute a generic message such as "HTTP status ###", where ### is the httpStatus number.
For other errors it can be any explanatory text.
If the content is downloaded but does not contain an ID that matches `contentElementID`, it will be “SPARE could not find element '\_\_\_' in downloaded content”, where \_\_\_ is the ID you provided.
If there is no `httpStatus` and an internal error occurs, this may be set to the name of the error class that was thrown, such as `ReferenceError`.

> `isSPARE` is set to `true`, to help identify SPARE errors if they end up in a general-purpose error handler.

If the failure is an immediate validation error such as `target` not being found or `contentURL` not being provided, then `httpStatus` and `httpMessage` have no value.
The standard `message` property will describe the error.
For most errors, the `message` property will usually consist of `httpStatus` followed by `httpMessage`, but in unexpected cases it could be anything.

If you do not apply the `catch` method to the returned promise (or the second argument of `then`, which is equivalent), you can alternately process this error in a global handler attached to the `unhandledrejection` event.
The event object passed to that handler has properties `promise` and `reason`.
If you are using other promises besides SPARE ones, their errors may end up here too.
That’s one case where it’s useful to check `e.reason.isSPARE` (assuming your event parameter is named `e`).

If you use `await`, that error object is thrown as an exception once the awaited statement resumes.

--------

### simulateNavigation method

The other main method is **`SPARE.simulateNavigation`**.
This works like `replaceContent` but has the additional effect of adding a history item under the browser’s Back button, and changing the URL visible in the browser’s address box.
This method is intended for a fairly strict and narrow case: when you replace part of a page’s content but wish to behave as if the entire page was replaced.
This makes sense if you have many pages that fit a common template.

The intended idea is that the result of loading the partial page from the given URL should look the same as navigating to that page (only smoother); otherwise, using this method may be inappropriate, and produce results that are confusing to the page visitor.
In other words, you should make sure that if the user fully refreshes the page, the result is consistent with what you displayed with `simulateNavigation`.
If not, the Back button may not be able to work correctly, among other issues.

The Back button will also misbehave if you perform `simulateNavigation` at page load time.
Avoid doing this — stick to `replaceContent` until it’s time to respond to a user action.
Adding extra stuff to the Back button history when the user didn’t take any navigating action is not just poor design, it’s an abuse.
And if you have multiple updates to do in one action, use `simulatrNavigation` for only one of them.

*Note* that due to browser security, navigation between different domains generally will not work with `simulateNavigation`; all pages must be within a single website, unless you configure Cross-Origin Resource Sharing (CORS) in the headers sent by your server.

The parameters of `simulateNavigation` mostly have the same meanings that they do when used with `replaceContent`, and it returns the same promise.
The fourth and fifth parameters, `newTitle` and `pretendURL`, are unique to `simulateNavigation`, as is the final parameter, `contextData`.
The full list of parameters is:

> **`target`** (required): the ID of the existing HTML element which will have its contents replaced, or the DOM element object representing that element.

> **`contentURL`** (required): the URL from which new content will be loaded.

> **`contentElementID`**: the ID of the piece of the new content which will be loaded, or omit to use all of it.

> **`newTitle`**: a string which, if not blank, changes the title shown by the browser on the window or tab containing this page.

> **`pretendURL`**: a string which, if not blank, is shown in the address bar, and saved in the Back-button history, instead of `contentURL`.

> **`postData`**: content to be sent via a POST request.

> **`timeout`**: the number of seconds to wait for the download of new content.

> **`contextData`**: any value you want to pass — it will be included in the info transmitted to events associated with this navigation.

Note that if you supply a `postData` argument, *it must be a value that can be cloned*, or it will fail.
Exactly what values are permitted may vary, but the safest option is to pass only strings or `URLSearchParams` objects (which get converted into strings).
`FormData` does seem to generally work, but no guarantees there.
And `contextData` is subject to the same restriction.
If either is not usable, `simulateNavigation` will immediately return a rejected promise with a validation error.

Also note that the target element *must have an ID*.
`replaceContent` can be passed an `Element` object representing an ID-less HTML tag, but `simulateNavigation` cannot support the Back button in such a case.
So the initial validation also checks for this.

This method is polymorphic — it has an alternate calling signature which can be used instead of passing all eight arguments sequentially.
The alternate form has four parameters:

> **`target`** (required): the ID of the existing HTML element which will have its contents replaced, or the DOM node representing that element.

> **`contentURL`** (required): the URL from which new content will be loaded.

> **`contentElementID`**: the ID of the piece of the new content which will be loaded, or omit to use all of it.

> **`options`**: an object which contains properties for any or all of the remaining parameters you wish to pass: `newTitle`, `pretendURL`, `postData`, `timeout`, and `contextData`.

The latter signature is useful when you want to use one or two of the later options without filling in empty placeholder values for the options before them.
For example, you can specify a timeout by saying `simulateNavigation(myTarget, myUrl, myElementID, { timeout: 10 })`, whereas otherwise you would have to say something like `simulateNavigation(myTarget, myUrl, myElementID, null, null, null, 10)`.
You may wish to use the `options` syntax even if most are specified, just so that each is explicitly labeled instead of depending on memory of the parameter order.

One gotcha to be aware of with `simulateNavigation` is that pretend URLs saved in the history affect what path is “current” for relative URLs.
Unless all pages and pretend URLs are in the same directory, it’s safer to always use root-relative or absolute URLs throughout any pages that use SPARE.
I recommend root-relative URLs, because browser security does not normally permit us to simulate navigation to any other domains.

SPARE sets up a `popstate` event handler, which is described in the next section.
Without this, when the user clicks the Back button after simulated navigation, the page content would not change.
In SPARE 4 and earlier, you had to attach the `popstate` handler yourself, but it’s now automatic.
The handler, `SPARE.onPopStateRestore`, is described in the next section.

This method can optionally take one further step in simulating the loading of a complete page: it can fire the `DOMContentLoaded` event, just as happens after a page is loaded by normal navigation.
This is so that pages can initialize themselves after loading in the same way that they would after arrival from normal navigation.
Whether it does this is decided by a value you assign to the global flag property `SPARE.simulateDCL`.
If you set it to a truthy value, this event will be triggered just before the returned promise is fulfilled.
Note that the event is *not* triggered by `replaceContent`, only by `simulateNavigation` and `onPopStateRestore`.
Also note that the `load` event, which occurs later than this in actual navigation, is not simulated.

If `SPARE.simulateDCL` is falsey, it still fires an event, but the event is called `SPAREContentLoaded` instead of `DOMContentLoaded`.
You can simply ignore that event, and it will have no effect.
If you are interested in responding to it, you can attach a handler function with `window.addEventListener('SPAREContentLoaded', mySpareContentLoadedHandler);`.
The `Event` object passed to your handler has two added properties which are not present for a `DOMContentLoaded` event after normal navigation: first, the `contextData` value that you passed in, and second, a flag named `isSPARE` which is set true.
These are also present in simulated `DOMContentLoaded` events — real ones carry no added properties, so other handlers will not be affected by the addition.
You can tell simulated from real with `"isSPARE" in event`.

--------

### onPopStateRestore event handler

There is a third method, but not one you call directly: **`SPARE.onPopStateRestore`**, the popstate handler just mentioned.
In previous versions of SPARE, you had to attach this to the `popstate` event yourself, and you were free to extend or modify its behavior to suit your needs.
But the tradeoff was that it did a poor job of handling any but the simplest types of simulated navigation.
Multiple panes?  Updated areas with smaller updates inside them?  You were on your own back then.
But SPARE 5 actually handles these situations, at the cost of the SPARE script being less lightweight than it used to be.
The tradeoff is that the option of trying to roll your own popstate handler is largely infeasible now.
The built-in one is bound to the event immediately, and circumventing this is discouraged.

But you can still add your own functionality, or take over for this handler in specific cases, if you wish.
This is made possible by two new events that you can attach your own handlers to.
One is called `SPAREBeforePopState`, which lets you know about what changes `onPopStateRestore` intends to apply, and intervene in advance if necessary.
The other is called `SPAREAfterPopState`, which lets you know the outcome once it’s done, including any error that interrupted the process.
Also, if it does load any content, it fires `SPAREContentLoaded` (or `DOMContentLoaded` if `SPARE.simulateDCL` is true) in the middle.
The handler may need to do more than one update to the page if the user jumped multiple steps in the history; if so, the content-loaded event fires only once.
It’s also possible that no updates are needed; in this case, the content-loaded event does not fire, but `SPAREAfterPopState` does.
Any of these three may be a suitable place to apply your own navigation-related handling, depending on your needs.

All event handler functions you attach take a single parameter, which is an `Event` object.
That object has added properties to convey the details needed to process each type of event.
The before and after events carry a lot more detail than the content-loaded event.

* * * * * * * * * * * * * * *

The purpose of the `onPopStateRestore` handler is to update the page so that it matches the content it had at the time the history was stored.
SPARE keeps an internal record of all the `simulateNavigation` updates that have been made since the page was loaded, and the history state carries a copy of that record.
The handler’s job is, in the abstract, to roll back any changes that the page currently has on it, and then redo any changes that the historical state had in it.
Of course, some changes don’t need to be undone and redone, as that part of the page is the same.
The handler optimizes its updates so that no part of the page gets updated unnecessarily.
In most cases, of course, there is only one element that needs an update.





/**************************************************************
.............................
To support the more complicated cases of undoing or redoing simulated navigation, the `state` property has many fields:

> **`SPAREtargetID`**: the ID of the document element whose contents were replaced (taken from `target`, or from its ID if a DOM object was passed in),

> **`SPAREcontentURL`**: the URL from which `simulateNavigation` loaded content,

> **`SPAREcontentElementID`**: the ID of the element extracted from that URL, or null,

> **`SPAREnewTitle`**: the updated title shown on the page’s window or tab (taken from `newTitle`), or null.

> **`SPAREvisibleURL`**: the URL shown in the browser's address box, which is taken from `pretendURL` if given, otherwise from `contentURL`.

> **`SPAREcontextData`**: the value you passed in to the `simulateNavigation` call that this pop is restoring.

> **`SPAREinitialURL`**: the URL from which this page was initially loaded, before SPARE changed anything.

> **`SPAREinitialTitle`**: the title that was shown on the page's window or tab, before SPARE changed anything.

The overall idea is that if you do two simulated navigations and then hit the Back button, this data describes the first one, and restoring it undoes the second one.
If you then hit Forward, the handler gets the data from the second navigation, so it can be redone.
What `onPopStateRestore` does with this data essentially boils down to `replaceContent(state.targetID, state.contentURL, state.contentElementID)`.
But if the user does a skip back over several history steps, and different targets were updated, the handler may do more than one update.
In this case content downloads may occur in parallel for efficiency.

When returning from simulated navigation to a page that was loaded by real navigation — the original page that `simulateNavigation` started from — the `state` object is simpler, omitting the fields describing the simulated change.
It contains only `startURL` and `startTitle`, and the `targetID` of the first element to be changed from its initial state.
In this case the action boils down in simple cases to `replaceContent(state.targetID, state.startURL, state.targetID)`, restoring the target's original content.

At the time the handler function is called, the browser will have already restored the URL to the address bar, but it will not have changed the title.
The handler does this, along with updating the content.

If extending this functionality, don’t forget that there is also a Forward button, and dropdowns to go back or forward nonsequentially.
From what I've seen of the major browsers, if you use these dropdowns to skip over several navigations, and one of the steps was done with real unsimulated navigation, then the browser will do a full navigation to the URL stored in the history node (`pretendURL`), rather than invoking the popstate handler.

Also note that although `replaceContent` can act on an element that has no ID when you pass the DOM element object directly, such elements are *not* supported for the popstate event, so they should not be passed to `simulateNavigation`.
To restore a page with SPARE when the back button is used, the target element must have an ID.
*****************************************************************/

------

What does the future hold for SPARE?  The whole process of restoring past state when the back button is used will probably need ongoing work, as it is complex and prone to edge cases that are tricky to get right.
But as for features, I don’t really expect to add anything more.
