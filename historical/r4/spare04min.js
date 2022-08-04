//SPARE 4 - https://github.com/paulkienitz/SPARE/blob/master/LICENSE.md
"use strict";var SPARE=function(){var t,e,n=function(t,e,n){if(!t)throw new Error("SPARE cannot operate because browser lacks support");if(!n||"string"!=typeof n)throw new Error("SPARE - contentURL is required");if(e instanceof HTMLElement)return e;if(!e)throw new Error("SPARE - target is required");var o=document.getElementById(e);if(!o)throw new Error("SPARE could not find target element '"+e+"'");return o},o=function(t,e){return isNaN(t)&&(t=e),isNaN(t)||t<=0||t>3600?void 0:t},a=function(t,e,n){var o=document.implementation.createHTMLDocument(""),a=o.documentElement;if(a.innerHTML=t,e){if(!(a=o.getElementById(e)))return"SPARE could not find element '"+e+"' in downloaded content"}else{var i=a.getElementsByTagName("body");a=i[0]||a}var r=document.createElement(n.tagName);for(n.parentNode.replaceChild(r,n);n.lastChild;)n.removeChild(n.lastChild);for(;a.firstChild;)n.appendChild(a.firstChild);return r.parentNode.replaceChild(n,r),""},i=function(t){var e=t?"DOMContentLoaded":"SPAREContentLoaded";this.fire=function(){document.dispatchEvent(new Event(e,{bubbles:!0}))}},r=function(n,o,a,i,r){var s={oldId:n,targetID:n,url:o,contentURL:o,newId:a||null,contentElementID:a||null,title:i||null,newTitle:i||null,showURL:r||null,pretendURL:r||null,startTitle:e||null,startURL:t||null},l={targetID:n,startTitle:e||null,startURL:t||null};this.add=function(){history.pushState(s,"",r||o),i&&(document.title=i)},this.checkBehind=function(){history.state||history.replaceState(l,"")}},s=function(t,e,n,o,a){this.succeed=function(){o&&o.add(),"string"==typeof e?eval(e):"function"==typeof e&&e(t),a&&a.fire()},this.fail=function(e,o){"string"==typeof n?eval(n):"function"==typeof n?(!o&&e>0&&(o="HTTP status "+e),n(t,e,o)):window.location.href=contentURL}},l=function(t,e,n,o,i,r){var s=null,l=!1,u=null;this.start=function(){"string"==typeof e||null!==e&&"object"==typeof e?(("string"==typeof e||"object"==typeof e&&"URLSearchParams"===e.constructor.name)&&s.setRequestHeader("Content-type","application/x-www-form-urlencoded"),s.send(e)):s.send(),n&&(u=setTimeout(c,1e3*n))};var c=function(){if(s&&s.readyState<4){l=!0;try{s.abort()}catch(t){}r.fail(408,"SPARE time limit exceeded")}},d=function(t){try{var e=a(t.responseText,o,i);if(e)return void r.fail(-1,e)}catch(n){return void r.fail(-3,"SPARE caught exception "+n.name+": "+n.message)}r.succeed()};(s=new XMLHttpRequest).onreadystatechange=function(){4!=s.readyState||l||(clearTimeout(u),200==s.status||201==s.status||203==s.status?d(s):r.fail(s.status,s.statusText))},s.ourUrl=t,s.open("string"==typeof e||null!==e&&"object"==typeof e?"POST":"GET",t,!0),s.responseType="text"},u="XMLHttpRequest"in window&&"querySelector"in document&&"history"in window&&"pushState"in history&&"implementation"in document&&"createHTMLDocument"in document.implementation;return t||(t=location.href,e=document.title),{timeout:void 0,transitionalContentID:void 0,onSuccess:void 0,onFailure:void 0,simulateDCL:!1,supportLevel:function(){return u?2:0},canSimulateNavigation:function(){return u},replaceContent:function(t,e,a,i,r,c,d,f,m){var h=n(u,t,e);if(arguments.length>=3&&arguments.length<=8&&!isNaN(arguments[arguments.length-1]))switch(m=arguments[arguments.length-1],arguments.length){case 3:a=void 0;case 4:i=void 0;case 5:r=void 0;case 6:c=void 0;case 7:d=void 0;default:f=void 0}m=o(m,SPARE.timeout);var R=new s(r,c||SPARE.onSuccess,d||SPARE.onFailure,null,null),p=new l(e,i,m,a,h,R);p.start()},simulateNavigation:function(t,e,a,c,d,f,m,h,R){var p=n(u,t,e);m=o(m,SPARE.timeout);var v=new i(SPARE.simulateDCL),E=new r(p.id,e,a,h,R);E.checkBehind();var S=new s(c,d||SPARE.onSuccess,f||SPARE.onFailure,E,v);new l(e,null,m,a,p,S).start()},onPopStateRestore:function(t){if("state"in t&&t.state&&"targetID"in t.state&&"startURL"in t.state){var e=new i(SPARE.simulateDCL),n=new s(t.state,SPARE.onSuccess,SPARE.onFailure,null,e),o=document.getElementById(t.state.targetID);return o&&location.href==(t.state.pretendURL||t.state.startURL)?"contentURL"in t.state?(new l(t.state.contentURL,null,SPARE.timeout,t.state.contentElementID,o,n).start(),document.title=t.state.title,!0):(new l(t.state.startURL,null,SPARE.timeout,t.state.targetID,o,n).start(),document.title=t.state.startTitle,!0):(console.log("=== SPARE had to reload initial page because assumed URL does not match current location, or target is missing.\nPretend URL:  "+t.state.pretendURL+"\nInitial URL:  "+t.state.startURL+"\n*Actual URL:  "+location.href+"\n- Target ID:  "+t.state.targetID),location.replace(t.state.startURL),!1)}}}}();