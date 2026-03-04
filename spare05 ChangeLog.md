# SPARE Change Log

### Release 5 — ?????? Septober 43, 202∞

**This is a major breaking change, no longer compatible with previous releases.  Every method is different now, so read the new documentation.**

1. SPARE is now a JavaScript module rather than a traditional script, so you reference it with a statement such as `import {SPARE} from "spare05.js";` rather than with a `<script>` tag.  This means that outdated browsers such as Internet Explorer cannot load it at all.  If you want to support old browsers, you cannot upgrade from SPARE 4.

2. The API is changed to use promises instead of callbacks.  The main methods, `replaceContent` and `simulateNavigation`, now return a `Promise` object, and in case of failure now reject that promise with an `Error` object instead of throwing it as an exception.  (It becomes an exception if you `await` the call.)  The `SPAREError` object is extended with new informational fields, and those are added ad-hoc to other error types as well.  By default, all such errors are logged to the console, but a property `SPARE.logErrorsToConsole` can be set `false` to turn this off.

3. Parameters `callbackContextData`, `onSuccess`, and `onFailure` are removed from the two main methods, as are their corresponding global default properties.  And the unused parameter `transitionalContentID` is removed from `replaceContent`, along with its corresponding property.  The validation methods `supportLevel` and `canSimulateNavigation` are removed.  SPARE simply initializes its global object to `undefined` in the unlikely event that a required API such as `fetch` is missing.  (In practice it will only be undefined is someone is using a Windows XP-era browser that can’t load modules.)

4. `simulateNavigation` now has a `postData` parameter like `replaceContent` has, and has a new parameter `contextData` which is passed to event handlers.  **Note** that both `postData` and `contextData` *must be cloneable* for the Back button to work.  Posting a `FormData` object may or may not work depending on its contents, as far as I can tell.  (It converts `URLSearchParams` to a string, so that works fine.)  Post requests are more limited here than they are in `replaceContent` because of this necessity, but `simulateNavigation` does precheck these two parameters, and throws back an immediate error if they won’t work.

5. `simulateNavigation` is now polymorphic in that the fourth parameter can be an ad-hoc options object whose properties specify any or all of the parameters `newTitle`, `pretendURL`, `postData`, `timeout`, and `contextData`.  (The polymorphism of `replaceContent` is now reduced to only the ability to put `timeout` in place of `postData`.)

6. You no longer attach `onPopStateRestore` to the popstate event youself; it’s done for you.  Supplying your own handler, or wrapping the provided one, is now discouraged.  To extend or override it, SPARE emits new events `SPAREBeforePopState` and `SPAREAfterPopState` which you can add handlers for.  The former can be used to cancel the built-in popstate handling.

7. Back button handling in `onPopStateRestore` is now much more sophisticated and handles a lot more cases.  It keeps track of when small updates have been discarded inside of larger ones, or need the larger one to be restored first, and cases where many areas are updated independently.  SPARE 4 didn’t really support any of these scenarios.  **Note** that this depends on recognizing matching content URLs, so if there’s a possibility that you might give the same URL with different uppercase and lowercase letters, you should set the property `SPARE.treatURLsAsCaseInsensitive` to `true`.


### Release 4 - August 3, 2022

1. Refactored the code to reduce repetition and bring the architecture closer to what will work in the future Promise-based version.

2. As part of refactoring, renamed input parameters `elementID` as `target`, `pageURL` as `contentURL`, and `newElementID` as `contentElementID`.

3. Added a feature to `simulateNavigation` and `onPopStateRestore` so they can simulate the `DOMContentLoaded` event.  This is activated by setting the new global property `SPARE.simulateDCL` to true.  If false it instead fires a new event called `SPAREContentLoaded`.

3. Improved `onPopStateRestore` to better handle returns to initially loaded pages, so that it can just replace the updated element with original content instead of reloading the whole page.  Added a safety check to it for cases where the history has somehow gotten out of sync.  (This may not be necessary.)  Gave `onPopStateRestore` a return value of `true` when it replaces content.  But clarified that `onPopStateRestore` is not yet ready for handling cases where multiple targets are updated, and it can’t be expected to correctly restore such documents.  The prior flaws in `onPopStateRestore` are the whole reason why I did an additional release of the old API — I couldn’t leave release 3 as the only option for legacy users.

4. Updated the `state` object saved in browser history to use new renamed properties consistent with parameter naming elsewhere: `targetID` instead of `oldId`, `contentURL` instead of `url`, `contentElementID` instead of `newId`, `newTitle` instead of `title`, and `pretendURL` instead of `showURL`.  However, the poorly chosen old names are also still present for compatibility, until we transition to the new Promise-based API.  Also, `newTitle` and `pretendURL` and `targetID` are now present unconditionally.

5. Because HTTP 2 no longer includes a text description with its response status, such as "Not Found" for 404, SPARE 4 now substitutes a generic text such as "HTTP status 404" if none was received.

6. Changed the license from Apache to modified BSD.  My change is mainly to clarify the right to minify the script.


### Release 3 - June 12, 2021

1. Added `pretendURL` parameter to `simulateNavigation`, so that the URL shown in the address bar can differ from the one that content is loaded from.  In popstate handlers, the state object now has a `showURL` property which stores this value.

2. When a popstate handler is returned to the page from which `simulateNavigation` was first called, it now receives a different state object with properties `startURL` and `startTitle`.  (In release 2, state would be null in this case, and the page content would probably fail to restore.)  The default handler `onPopStateRestore` now reloads the page from `startURL`.

3. Dropped support for the `transitionalContentID` feature.  The parameter and property are still present for API compatibility, but are now ignored.  (The API of SPARE 5 will be incompatible.)

4. Dropped support for IE 8 and 9, and any browser version older than about 2011.  This further simplifies the implementation by removing fallback code paths.  There are no longer any browsers where `supportLevel` is nonzero but `canSimulateNavigation` is false.

5. It now accepts HTTP result codes of 201 and 203 as well as 200.


### Release 2 - October 16, 2019

1. Support for Internet Explorer 7 (which was very limited) dropped completely, and with it, the return value of 1 from `supportLevel`.

2. Unified the XHR code paths so that only text mode is used, which turned out to make SPARE a lot faster.  Removed the return value of 3 from `supportLevel`.

3. Deprecated, but did not remove, the `transitionalContentID` parameter of the `replaceContent` method.  The API remains compatible with SPARE 1.

4. Added new API entry points `simulateNavigation` and `canSimulateNavigation`, and available event handler `onPopStateRestore`.

5. Added support for `FormData` and `URLSearchParams` objects being passed as `postData`, where release 1 only supported strings.

6. We now support `timeout` values between 0.0 and 1.0; in the first release, 1.0 seconds was the minimum allowed.

7. Supported polymorphic use of `timeout` in any optional parameter position, as long as the final parameter is a number.

8. Importing of downloaded HTML into document redone with better performance and fewer code paths.  This avoids a problem in release 1 where IE 9, 10, and 11 would, when asked to load a full HTML document, use content from the head as well as the body.  But *note* that though this problem is cured in IE 10 and 11, I cannot guarantee it is always mitigated in IE 9, particularly if the document you download has bad syntax.  (A future release will drop support for IE 8 and 9.)


### Release 1 - March 24, 2015

1. Created API entry points `replaceContent` and `supportLevel`.  A value of 1 returned by `supportLevel` indicates that only some functions work.

2. `XMLHttpRequest` (XHR) is used with two code paths, one using its text mode and the other using its XML/HTML mode.  The latter path is indicated by a return value of 3 from `SupportLevel`.
