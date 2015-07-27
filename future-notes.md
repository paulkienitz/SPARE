# Notes for forthcoming versions

I want to add support for history.pushState, so when it navigates to a new
page without reloading, it can set the URL in the title bar as it does so.
As far as I can see, support for pushState is mostly in the same browsers
that have support for responseXML and overrideMimeType -- the ones I call
"level 3" -- but there are some browsers that have it at level 2, including
some versions of Opera and Safari.  IE 10 has all of the above, but I found
that the level 3 stuff was not complete and robust enough, so I left that
browser at level 2.  I think I'll create a new level 3 which indicates that
pushState works, and define a level 4 for everything working.

I'll have to add a new flag param to replaceContent.

I think I also want to 
