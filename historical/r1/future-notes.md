# Notes for forthcoming versions

I want to add support for 'history.pushState', so when it navigates to a new
page without reloading, it can set the URL in the title bar as it does so.
As far as I can see, support for 'pushState' is mostly in the same browsers
that have support for 'responseXML' and 'overrideMimeType' -- the ones I call
"level 3" -- but there are some browsers that have it at level 2, including
some versions of Opera and Safari.  IE 10 has all of the above, but I found
that the level 3 stuff was not complete and robust enough, so I left that
browser at level 2.  I think I'll create a new level 3 which indicates that
'pushState' works, and define a level 4 for everything working.

WARNING: they say there are some older versions of Android and iOS browsers in
which pushState is present but broken.

I'll have to add a new flag param to 'replaceContent'.  I'll also add a simplified
alternative entry point which omits the params 'newElementId' (always the same as
the target ID) and 'postData', and maybe 'timeout'. Call it something like
'replaceContentAndUrl'.

I think I also want to add a method for formatting an object as postdata, if it
doesn't add too much bloat.  That should pretty much cover the second release
of SPARE.

One unanswered question is whether the title param of pushState is ever significant.
If it is, I might have to use a title param instead of a simple flag, so it can be set.
Firefox ignores it.  So does Chrome.  Safari and Opera do pay attention to the title.
I think all browsers support an alternate way of setting the title.  Since passing
no value might clobber the title entirely, I'd probably better set it explicitly.

As of 2017, I'm now thinking that the transitionalContentID feature should probably
be removed.  Instead, let's see if we can add some kind of hook to call when the
request is actually made, via onreadystatechange or whatever.

Oh, and it probably needs support for restoring or setting focus if there are form
inputs in the changed area.

--------------

Looking at this again in 2019, it's clear that we are coming to a fork in the road.
At first glance, it looks like what this needs in order to keep up with the times is
a fourth supportLevel based on fetch.   We could drop level 3 as an evolutionary dead
end, and drop level 1 as obsolete, so almost all browsers will be either level 2 or
level 4.  But upon exploring this, I find that fetch may not actually add anything
better than what we already have in level 2 support, and it's clear that the fetch API
is not done evolving.  I'm increasingly coming to the view that the safe way forward for
now is to ignore fetch and keep using XMLHttpRequest, unless it starts being phased out.
I am also feeling misgivings about supporting a separate code path for using the HTML
responseType in XHR... is there any actual benefit?  Let's just use a single path that
imports HTML as text.

Another thing I see as of 2018 is that we want an alternate entry point that returns a
promise instead of taking callbacks.  Make sure it works with "await".

I definitely want to deprecate the transtionalContentID feature.
