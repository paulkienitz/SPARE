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

In that type of usage, you can ask SPARE to fully simulate navigation as if the pages were being loaded normally instead of partially, so the Back button works as expected.
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

But since this is a module, you instead use an `import` statement within the script you’re invoking it from, like this:

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
(Cross-domain URLs are commonly blocked by browser security anyway.)
The resulting promise will be rejected with an error if this is not provided.

> **`contentElementID`**: the DOM ID of the element within the downloaded page which will be the source of the replacement content.
If you don’t provide any value (or pass a falsey value such as `""`) then it puts the entire content returned by the URL into your target element.
That technique is most appropriate if the server is set up to return fragmentary pages, instead of complete ones with `<html>` tags.
If a complete page is received and this ID is not given, it will use the content of the `<body>` tag.

> **`postData`**: values to be sent to the URL as form arguments.
If null or undefined, it requests the page with a simple GET.
If you pass a string as this parameter, it should be in form-urlencoded format, like a querystring.
(It can be empty, for a post with no arguments.)
We also support passing `URLSearchParams` or `FormData` objects to encapsulate your upload parameters.
`FormData` can even support file uploads.
(Passing in `ReadableStream`, `BufferSource`, or `Blob` objects is untested.)

> **`timeout`**: a number.
If the new data doesn’t download within this many seconds, the operation fails.
The supported range is from 0 to 3600, and the default is to leave it up to the browser.
Fractional values such as 1.25 are supported.
If the time expires, the returned promise will be rejected with a `SPAREError` object, extended with an `httpStatus` property set to 408 (Request Timeout), and `httpMessage` set to "SPARE time limit exceeded (_ seconds)" instead of "Request Timeout".
(All internal error messages start with the word "SPARE".)
*Note* that setting a large value does not prevent the browser or host from failing the operation sooner.

The later parameters are optional, and it is common to call `replaceContent` with only three parameters (or even just two), as most users don’t need to specify a timeout or send a post request.

You can set a default timeout for all calls by assigning a value to the **`SPARE.timeout`** property instead of passing it as a parameter.
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
Other negative values are used for unexpected exceptions, which normally you should never encounter: -2 or -4 if it occurred during content retrieval, or -3 if during the page update.

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
And if you have multiple updates to do in one action, use `simulateNavigation` for only one of them.

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
If either is clearly not usable, `simulateNavigation` will immediately return a rejected promise with a validation error, but there is no guarantee that it can catch all problematic cases.

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

SPARE sets up a `popstate` event handler.
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
The `Event` object passed to your handler has three added properties which are not present for a `DOMContentLoaded` event after normal navigation: the `contentURL` you used, the `contextData` value that you passed in, and a flag named `isSPARE` which is set true.
These are also present in simulated `DOMContentLoaded` events — real ones carry no added properties, so other handlers will not be affected by the addition.
You can tell simulated from real with `event.isSPARE`, which is `undefined` for nonsimulated events.

--------

### onPopStateRestore event handler

There is a third method, but not one you call directly: **`SPARE.onPopStateRestore`**, the popstate handler just mentioned.
In previous versions of SPARE, you had to attach this to the `popstate` event yourself, and you were free to extend or modify its behavior to suit your needs.
But the tradeoff was that it did a poor job of handling any but the simplest types of simulated navigation.
Multiple panes?
Updated areas with smaller updates inside them?
You were on your own back then.
But SPARE 5 actually handles these situations (which does make SPARE less lightweight than it used to be).

The purpose of the `onPopStateRestore` handler is to update the page so that it matches the content it had at the time the history was stored.
SPARE keeps an internal record of all the `simulateNavigation` updates that have been made since the page was loaded, and the history state carries a copy of that record.
(Simple updates through `replaceContent` are *not* tracked in this record, and are not intended to be undoable via browser history.)
The handler’s job is, in the abstract, to roll back any changes that the page currently has on it, and then redo any changes that the historical state had in it.
Of course, some changes don’t need to be undone and redone, as that part of the page has not changed.
The handler optimizes its updates so that no part of the page gets updated unnecessarily.
In most cases, of course, there is only a single element that needs an update.

The tradeoff for being able to handle these cases is that the option of trying to roll your own popstate handler is largely infeasible now.
The built-in one is bound to the event immediately, and circumventing this is discouraged.
But you can still add your own functionality, or take over for this handler in specific cases, if you wish.
This is made possible by two new events that you can attach your own handlers to.
One is called `SPAREBeforePopState`, which lets you know about what changes `onPopStateRestore` intends to apply, and intervene in advance if necessary.
The other is called `SPAREAfterPopState`, which lets you know the outcome once it’s done, including any error that interrupted the process.

Also, if it does load any content, it fires `SPAREContentLoaded` (or `DOMContentLoaded` if `SPARE.simulateDCL` is true) in the middle.
The handler may need to do more than one update to the page if the user jumped multiple steps in the history; if so, the content-loaded event fires only once.
But if it cannot load any of the content it needs to, it instead fires an event named `SPAREPopStateFailed`, which has a property named `error` containing whatever exception or error message came back from the failure.
It’s also possible that no updates are needed; in this case, the content-loaded event does not fire, but `SPAREAfterPopState` does.
It fires even if you use your `SPAREBeforePopState` to cancel the built-in update process entirely.
Any of these three may be a suitable place to apply your own navigation-related handling, depending on your needs.

All event handler functions you attach take a single parameter, which is an `Event` object.
That object has added properties to convey the details needed to process each type of event.
The before and after events carry more detail than the content-loaded event.
The full set of event properties for all four events are:

> **`isSPARE`**: always true.

> **`contentURL`**: when handling a `popstate` event, this is set to `undefined`, as multiple URLs may be used.
(This is how you can tell whether a `SPAREContentLoaded` event came from `simulateNavigation` or `onPopStateRestore`.)

> **`contextData`**: the value that was passed to the `simulateNavigation` call whose effect this pop is trying to restore.

> **`error`**: present only for `SPAREPopStateFailed`, it has a copy of whatever error object was thrown by a failed update, or the first such if there was more than one.
(If an error occurs, it is deferred until all other updates have completed or failed, to minimize the impact on the page.)

> **`replaced`**: present only for `SPAREAfterPopState`, it is the count of how many elements were successfully replaced.

> **`failed`**: present only for `SPAREAfterPopState`, it is the count of how many elements failed to be replaced.

> **`changes`**: present for `SPAREBeforePopState` and `SPAREAfterPopState`, this is an array of objects which each describes a single element that will be, or has been, updated.

The `changes` array contains `Change` objects, which have these fields:

> **`targetID`**: the ID that identifies the target element of the change.

> **`contentURL`**: the URL from which new content is loaded into the target.

> **`contentElementID`**: the ID identifying the source element within the loaded content.

> **`postData`**: any `postData` value which is used in obtaining the content, if given.
(If the original `postData` value given was a `URLSearchParams` object, it is stored here as a string.)

> **`containedBy`**: when one `Change` affects an element which is inside another element that was also modified, this is the ID identifying that outer element.
The `containedBy` of one `Change` will equal the `targetID` of another.
If they are nested deeper than two layers, these links can be followed successively from innermost to outermost.
If there is no containing `Change`, this is `null`.

> **`error`**: present only for `SPAREAfterPopState`, and only if the update failed, this is the object that was thrown as the reason for the failure.

> **`outcome`**: present only for `SPAREAfterPopState`, this tells what happened when the update was carried out.
As each update proceeds, the `outcome` value progresses from `"pending"` to `"requested"` to `"retrieved"` to `"updated"`.
If it arrives in the `SPAREAfterPopState` handler with a value other than `"updated"`, it tells you the last step it successfully completed before `error` was set.
If a contentURL yields apparent success but returns no content, outcome will be set to `"empty"` instead of `"retrieved"`... which may be valid if you did not provide any `contentElementID`, but otherwise will produce an error when it looks for that ID in it.
The combination of `outcome` and `error` values for every change may allow for more detailed analysis of failures than `SPAREPopStateFailed` supports.

The `Change` objects in the `changes` array are sorted into the order in which they will be performed.
The content downloads proceed asynchronously in parallel, but the updates to page elements are done sequentially.
Of course, the most common case is that the array contains only one `Change`.

Your handler for the `SPAREBeforePopState` event can affect the behavior of `onPopStateRestore`.
The simplest way to do this is to cancel it: if you call `event.preventDefault()` or `event.cancel()` — a simple wrapper function added by SPARE which invokes both that and `event.stopPropagation()` — then `onPopStateRestore` will not attempt any page updates at all.
It will skip directly to `SPAREAfterPopState`, which will receive an event in which `replaced` and `failed` are both zero, and the `outcome` of every `Change` in the `changes` array is `"cancelled"`.
If you do this, your event handlers are solely responsible for updating the page content.
You might do this if, for instance, you detect a situation which calls for a full refresh of the page, or a redirect, or for all content to be replaced with an error message.
And this handler can do more than that: if you really think you know what you’re doing, *you can modify the `changes` array*.
You can remove a `Change`, or append a new one, or put them into a different order.
The update process in `onPopStateRestore` will follow the modified list of changes, and pass it to `SPAREAfterPopState`.
But all changes have to be made in-place within the existing array; assigning a different array to `event.changes` will have no effect.

Though overriding the automatic handling of the `popstate` event by `onPopStayeRestore` is discouraged, it it still possible.
If your substitute handler calls `SPARE.onPopStateRestore`, its return value is a `Promise` which will settle after the `SPAREAfterPopState` event is completed.
You can attach more `then` followups to it.
But if code other than SPARE is also pushing history states, your handler will respond to those too, and `onPopStateRestore` will return `undefined`.

For even more stuff that normal usage does not need to mess with, `Change` objects are not present only in the before/after events.
Your code can also examine the global object `history.state`, and it contains fields that describe how the page has been modified since it was loaded, including an array of `Change` objects.
For most users, they can be treated as just private infrastructure for `onPopStateRestore`, but I will document them here for those who are interested.
Inside a `SPAREBeforePopState` or `SPAREAfterPopState` event handler, the fields reflect what the page is being updated to; elsewhere, they reflect the page as it currently is.
But in a freshly loaded page where `simulateNavigation` has not been performed yet, `history.state` is generally `null`.
Since the `history.state` object can be accessed by other code besides SPARE, all of the fields it uses have names that start with “SPARE” to reduce the risk of collisions.
The fields it adds in `simulateNavigation` are:

> **`SPAREtargetID`**: the ID of the last element that was updated.

> **`SPAREcontextData`**: whatever context data object you passed to `simulateNavigation` for the last update, if any.

> **`SPAREnewTitle`**: the title of the page as shown by the browser for this window or tab, as given in the `newTitle` parameter of `simulateNavigation`.

> **`SPAREvisibleURL`**: the URL shown in the browser’s address bar, which comes from the `pretendURL` parameter if it was given, or from `contentURL` if it was not.

> **`SPAREinitialTitle`**: the title of the page as it was when it was originally loaded.

> **`SPAREinitialURL`**: the URL that the page was initially loaded from.

> **`SPAREchanges`**: the array of `Change` objects detailing what has been updated since the page was loaded.

Note that the list in `history.state.SPAREchanges` reflects a series of differences between the current page and the page as initially loaded, whereas the `event.changes` that’s passed to a `SPAREBeforePopState` or `SPAREAfterPopState` handler reflects a series of changes for updating one modified page into another.
Some changes may be present in both, while others may differ.

Also note that `SPAREchanges` is not a complete history of all past `simulateNavigation` updates, but only of those which are needed to go from the initial state to the current state.
For any one page element, only the most recent update to it is included, and if an outer element is updated, overwriting changes to child elements inside it, the `Change` records of those inner elements are dropped from the list.

The first time `simulateNavigation` is called on a fresh page, it also retroactively adds a `state` object to the history record for the original page it’s moving away from, to support the Back button being able to return to it.
This `state` object is simplified, omitting the majority of the fields.
It only has `SPAREinitialTitle`, `SPAREinitialURL`, and `contextData` — the latter coming from the call of `simulateNavigation` that first updated it.

------

Besides the three methods, the `SPARE` object also has four settable properties.
They are:

**`SPARE.timeout`**: if you set this to a number between 0 and 3600, it acts as a default value for the `timeout` parameters passed to `replaceContent` and `simulateNavigation`.
If you pass explicit values, they override this default value.
By default this is `undefined`, meaning that the timeout duration is not limited by SPARE, only by whatever happens between the host and the browser.
This value is also the only way to set a timeout duration for `onPopStateRestore`, which has no explicit parameter.

**`SPARE.simulateDCL`**: if set to a truthy value, the `SPAREContentLoaded` event becomes a simulated `DOMContentLoaded` event instead, but with the same properties documented above.
The default value is `false`.

**`SPARE.logErrorsToConsole`**: if set to a truthy value, any error or exception in SPARE is sent to the browser’s JavaScript console, so you can retroactively look at details of the Error object.
This one is actually set `true` by default.
The property setter does coerce non-boolean values to be saved as either `false` or `true`.

**`SPARE.treatURLsAsCaseInsensitive`**: if set to a truthy value, then SPARE will recognize two URLs that differ in letter case as pointing to the same resource.
This is used by `onPopStateRestore` when deciding if two `Change` records match each other and therefore don’t need to be redone.
Some servers do not behave this way and will retrieve resources correctly only if you use the exact letter case, but if your website may be prone to referring to the same page via URLs that may not always agree on letter case, you should set this `true`.
It is `false` by default, and currently the setter does coerce non-boolean values.

------

What does the future hold for SPARE?
The whole process of restoring past state when the back button is used will probably need ongoing work, as it is complex and prone to edge cases that are tricky to get right.
But as for features, I don’t really expect to add anything more.
This is the mature form that finally fulfills what I had hoped SPARE 3 and 4 would be, so at this point I expect to update it further only if bugs or shortcomings are identified.
