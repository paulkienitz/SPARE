//see github.com/paulkienitz/SPARE - Copyright 2015-2021 Paul Kienitz, Apache 2.0 license: http://www.apache.org/licenses/LICENSE-2.0
"use strict";var SPARE=function(){var supported=!1,haveNavigated=!1,extractAndUse=function(t,e,n){var o=document.implementation.createHTMLDocument(""),a=o.documentElement;if(a.innerHTML=t,e){if(!(a=o.getElementById(e)))return"SPARE could not find element '"+e+"' in downloaded content"}else{var r=a.getElementsByTagName("body");a=r[0]||a}var i=document.createElement(n.tagName);for(n.parentNode.replaceChild(i,n);n.lastChild;)n.removeChild(n.lastChild);for(;a.firstChild;)n.appendChild(a.firstChild);return i.parentNode.replaceChild(n,i),""},addHistory=function(elementID,pageURL,newElementID,newTitle,pretendURL,onSuccess,callbackContextData){history.pushState({oldId:elementID,url:pageURL,newId:newElementID,title:newTitle,showURL:pretendURL},newTitle,pretendURL||pageURL),newTitle&&(document.title=newTitle),"string"==typeof onSuccess?eval(onSuccess):"function"==typeof onSuccess&&onSuccess(callbackContextData)},Transaction=function(url,postData,timeout,newElementID,victim,callbackContextData,onSuccess,onFailure){var xmlhttp=null,aborted=!1,timer=null;this.start=function(){"string"==typeof postData||null!=postData&&"object"==typeof postData?(("string"==typeof postData||"object"==typeof postData&&"URLSearchParams"==postData.constructor.name)&&xmlhttp.setRequestHeader("Content-type","application/x-www-form-urlencoded"),xmlhttp.send(postData)):xmlhttp.send(),timeout&&(timer=setTimeout(abortBecauseTimeout,1e3*timeout))};var abortBecauseTimeout=function(){if(aborted=!0,xmlhttp&&xmlhttp.readyState<4){try{xmlhttp.abort()}catch(t){}downloadFailed(408,"SPARE time limit exceeded")}},stateChangedHandler=function(){4!=xmlhttp.readyState||aborted||(clearTimeout(timer),200==xmlhttp.status||201==xmlhttp.status||203==xmlhttp.status?downloadSucceeded(xmlhttp):downloadFailed(xmlhttp.status,xmlhttp.statusText))},downloadSucceeded=function(xmlhttp){try{var err=extractAndUse(xmlhttp.responseText,newElementID,victim);if(err)return void downloadFailed(-1,err)}catch(t){return void downloadFailed(-3,"SPARE caught exception "+t.name+": "+t.message)}"string"==typeof onSuccess?eval(onSuccess):"function"==typeof onSuccess&&onSuccess(callbackContextData)},downloadFailed=function(errorNumber,errorText){"string"==typeof onFailure?eval(onFailure):"function"==typeof onFailure?onFailure(callbackContextData,errorNumber,errorText):window.location.href=url};xmlhttp=new XMLHttpRequest,xmlhttp.onreadystatechange=stateChangedHandler,xmlhttp.ourUrl=url,xmlhttp.open("string"==typeof postData||null!=postData&&"object"==typeof postData?"POST":"GET",url,!0),xmlhttp.responseType="text"};return supported="XMLHttpRequest"in window&&"querySelector"in document&&"history"in window&&"pushState"in history&&"implementation"in document&&"createHTMLDocument"in document.implementation,{timeout:void 0,transitionalContentID:void 0,onSuccess:null,onFailure:null,supportLevel:function(){return supported?2:0},canSimulateNavigation:function(){return supported},replaceContent:function(t,e,n,o,a,r,i,l,s){if(!supported)throw new Error("SPARE cannot operate because browser lacks support");if("string"!=typeof e||0==e.length)throw new Error("SPARE - pageURL is required");var c=document.getElementById(t);if(!c)throw new Error("SPARE could not find target element '"+t+"'");var u=s;if(arguments.length>=3&&arguments.length<=8&&!isNaN(arguments[arguments.length-1]))switch(u=arguments[arguments.length-1],arguments.length){case 3:n=void 0;case 4:o=void 0;case 5:a=void 0;case 6:r=void 0;case 7:i=void 0;default:l=void 0}isNaN(u)&&(u=SPARE.timeout),(isNaN(u)||u<=0||u>3600)&&(u=void 0),new Transaction(e,o,u,n,c,a,r||SPARE.onSuccess,i||SPARE.onFailure).start()},simulateNavigation:function(t,e,n,o,a,r,i,l,s){if(!supported)throw new Error("SPARE is unable to set browser history");haveNavigated||history.state||history.replaceState({startURL:location.href,startTitle:window.title},""),haveNavigated=!0,this.replaceContent(t,e,n,null,o,function(o){addHistory(t,e,n,l,s,a||SPARE.onSuccess,o)},r,null,i)},onPopStateRestore:function(t){"state"in t&&t.state&&("url"in t.state&&"oldId"in t.state?(SPARE.replaceContent(t.state.oldId,t.state.url,t.state.newId),document.title=t.state.title):"startURL"in t.state&&location.replace(t.state.startURL))}}}();
