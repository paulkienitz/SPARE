# SPARE Change Log

### Release 3 - June 12, 2021

1. Added `pretendURL` parameter to `simulateNavigation`, so that the URL shown in the address bar can differ from the one that content is loaded from.  In popstate handlers, the state object now has a `showURL` property which stores this value.

2. When a popstate handler is returned to the page from which `simulateNavigation` was first called, it now receives a different state object with properties `startURL` and `startTitle`.  (In release 2, state would be null in this case, and the page content would probably fail to restore.)  The default handler `onPopStateRestore` now reloads the page from `startURL`.

3. Dropped support for the `transitionalContentID` feature.  The parameter and property ate still present for API compatibility, but are now ignored.  (The API of SPARE 4 will be incompatible.)

4. Dropped support for IE 8 and 9, and any browser version older than about 2011.  This further simplifies the implementation by removing fallback code paths.  There are no longer any browsers where `supportLevel` is nonzero but `canSimulateNavigation` is false.

5. It now accepts HTTP result codes of 201 and 203 as well as 200.

### Release 2 - October 16, 2019

1. Support for Internet Explorer 7 (which was very limited) dropped completely, and with it, the return value of 1 from `supportLevel`.

2. Unified the XHR code paths so that only text mode is used.  Removed the return value of 3 from `supportLevel`.

3. Deprecated, but did not remove, the `transitionalContentID` parameter of the `replaceContent` method.  The API remains compatible with SPARE 1.

4. Added new API entry points `simulateNavigation` and `canSimulateNavigation`, and available event handler `onPopStateRestore`.

5. Added support for `FormData` and `URLSearchParams` objects being passed as `postData`, where release 1 only supported strings.

6. We now support `timeout` values between 0.0 and 1.0; in the first release, 1.0 seconds was the minimum allowed.

7. Supported polymorphic use of `timeout` in any optional parameter position, as long as the final parameter is a number.

8. Importing of downloaded HTML into document redone with better performance and fewer code paths.  This avoids a problem in release 1 where IE 9, 10, and 11 would, when asked to load a full HTML document, use content from the head as well as the body.  But *note* that though this problem is cured in IE 10 and 11, I cannot guarantee it is always mitigated in IE 9, particularly if the document you download has bad syntax.  (SPARE 3 will most likely drop support for IE 8 and 9.)

### Release 1 - March 24, 2015

1. Created API entry points `replaceContent` and `supportLevel`.  A value of 1 returned by `supportLevel` indicates that only some functions work.

2. `XMLHttpRequest` (XHR) is used with two code paths, one using its text mode and the other using its XML/HTML mode.  The latter path is indicated by a return value of 3 from `SupportLevel`.
