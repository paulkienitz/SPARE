# SPARE
### Static Page AJAX to Replace Elements -- a lightweight client-side library

*Release 1 goes out on March 24, 2015, under the terms of the Apache 2.0 license.*

SPARE is a small client-side AJAX framework which requires no server-side support.  In fact, the case it's optimized for is when the server provides only plain static HTML pages.  It's also super easy to use: you only need to call one method.

How it's designed to work was inspired by ASP.Net's `UpdatePanel` control, but as implemented, it's even more similar to jQuery's `load()` method, at lower cost (and as a tradeoff, less support for downlevel browsers than 1.x versions of jQuery).

To use it, you give it the ID of any element on your page (which we will call the target), the URL of a new page, and an ID on that page.  It replaces the contents of the local document's target element with the content of the named element on the new page.  SPARE is most seamlessly used when you have a site design where many pages share common markup for headers, navigation, and so on, and the real differences are in a bounded content area.  SPARE lets you load new content into that area without refreshing the rest of the page.  In this use case, often the two IDs will be the same.

You can just as easily select content from pages not resembling the calling page.  You can optionally send POST data as well.  Another option is to display intermediate content (e.g. "Loading...") during the transaction.  And there's an option to invoke callback functions on success or failure.  None of these is required for basic usage.

And if the URL you give returns a page fragment, so you don't have to select an element within it, that's even simpler.  That mode will even work with some old browsers where SPARE doesn't support the normal mode with a second ID, such as IE 7.  And it generally works for text content that isn't even HTML (but don't try it with binary content).

--------

The Javascript API consists of an object named **`SPARE`** with two public methods.  Note that you do not use a `new` operator to instantiate SPARE; there's just the one static object.  The main method you’ll use is **`SPARE.replaceContent`**, which takes the following arguments, all of string type unless stated otherwise:

> **`elementID`** (required): the DOM ID of the target element in your document, which will have its contents replaced.  If the ID is not found in your document, SPARE throws an immediate exception.

> **`pageURL`** (required): the web address of the HTML content to be used for that replacement.  This can be a relative URL for content on the same site as the current page.  (Cross-domain URLs are commonly blocked by browser security anyway.)

> **`newElementID`**:  the DOM ID of the element within the downloaded page which will be the source of the replacement content.  If you don't provide any value, then it puts the entire content returned by the URL into your target element.  This is most appropriate if the server is set up to return fragmentary pages, instead of complete ones with `<html>` tags.  If a complete page is received and this ID is not given, it will use the content of the `<body>` tag.

> **`postData`**: values to be sent to the URL as form arguments, which must be already formatted suitably.  If null or undefined, it requests the page with a simple GET; to do a POST with no arguments, pass `""`.  Note: at present SPARE supports only form-urlencoded data, not multipart posts, so you can’t do file uploads.  (I intend to add a formatting helper for that encoding, if there is interest.)

> **`callbackContextData`**: an arbitrary object which is passed as the first argument to whichever of `onSuccess` or `onFailure` is invoked, so you can give them some information about the context in which they were called.

> **`onSuccess`**: a function to be invoked after the new content is successfully loaded.  If you pass a string, it will be executed with `eval`.  If it's a function object, it will be passed the `callbackContextData` value.  If defaulted, no action is taken aside from updating the content of your target element.  Any exceptions that occur in invoking it will pass through uncaught.  You can set a default value globally by assigning the function to the global variable **`SPARE.onSuccess`**.

> **`onFailure`**: similar, but invoked if there's a failure in loading the new content.  Again, the first argument is your `callbackContextData` value.  The second argument passed to it is an HTTP result number, such as 404 for page not found, and the third is the text of the error message received.  If the onFailure argument is not given, the default failure behavior is to navigate the browser window to the URL passed in.  That is an appropriate fallback if you're just using AJAX to smooth transitions during normal navigation, but  will not be useful if the server is returning only fragmentary pages.  Again, exceptions are not caught.  You can set a default value globally by assigning the function to the global variable **`SPARE.onFailure`**.  *NOTE*: the error number may also be negative, if SPARE fails to use the content after a successful download:

>> -1 means that `newElementID` was not found in the downloaded content,  

>> -2 means the content could not be parsed as HTML (in practice, most browsers accept bad HTML without error),

>> -3 means an unexpected exception was caught in processing the content.  

>> 0 is also possible, with null or meaningless text.  Requests do sometimes fail with no explanation available.  This can happen, for instance, when making a forbidden cross-site request.

> **`transitionalContentID`** \[DEPRECATED\] : the DOM ID of an element in your document (normally one which is hidden from view) which contains some sort of placeholder content to be displayed while waiting for the new material to download.  That element's content is copied into the target element before the download starts, and is replaced in turn when it completes.  If left undefined, the default behavior is to leave the original content in place while downloading.  *Note* that once the original content is replaced, it is not recoverable if the request fails.  You can set a default value globally by assigning the ID string to the global variable **`SPARE.transitionalContentID`**.  *NOTE*: This feature may be deleted in a future version... in hindsight, it wasn't our best idea.

> **`timeout`**: a number.  If the new data doesn't download within this many seconds, the operation fails.  The supported range is from 1 to 3600, and the default is to leave it up to the browser.  You can set a different default globally by putting a number in the global variable **`SPARE.timeout`**.  If the time expires, `onFailure` will be called with error code 408 (Request Timeout), with the error message being "SPARE time limit exceeded" instead of "Request Timeout".  (All internal messages to `onFailure` start with the word "SPARE".)  Note that setting a large value does not guarantee that the browser won't fail the operation sooner.

--------

The second public method is **`SPARE.supportLevel`**, which takes no arguments.  It returns a number indicating how well SPARE expects to work in the current browser environment.  It’s a good practice to check this before invoking `replaceContent`, and fall back to a non-AJAX approach if the value it returns is too low.  The values it can return are:

> **0**:  This browser has insufficient support and SPARE will not operate at all.

> **1**:  This browser has very limited support, and SPARE will only be able to download pre-trimmed page fragments.  In other words, you cannot use the `newElementID` parameter.

> **2**:  This browser has enough support that all features of SPARE should function adequately.

> **3**:  This browser supports the latest standards and SPARE will function at its best.

As of 2015, the browsers known to be at level 3 are Firefox and Chrome, plus the Android browser from Kitkat onwards.  IE, Opera and (surprisingly) Safari are still at level 2.  IE 10 and 11 have limited support for level 3 functionality, but I found it to be too fragile to use in practice.  (2017 update:  Safari 8 and up are at level 3.  Microsoft Edge 13 is at level 3; not sure about 12.)

**IMPORTANT**:  It is easier than you think to get into a state where your `supportLevel` value is 1, and `replaceContent` with `newElementID` doesn’t work.  This doesn’t just happen if your user is running something ancient like IE 7 — it will happen even in IE 11 if your page provokes IE into Compatibility View mode!  **Make sure your markup is up to snuff so IE uses Standards mode.**  If you want AJAX on funky pages with markup for archaic browsers, use jQuery 1.x.

--------

TODO in future versions (last updated 2019):
Add supportLevel value of 4 for using fetch API instead of XHR.  (Supported by Edge 12, Safari 8, Firefox 29, Opera 20, Chrome 33.)
Consider removing supportLevel 1 as unnecessary, and see if there's still any value for supportLevel 3 -- maybe we only need 2 and 4.
Better postback support.
Better management of back-button history.
