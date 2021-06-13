//see github.com/paulkienitz/SPARE
"use strict";var SPARE=function(){var canDoAjax=!1,canUseCreateDoc=!1,canFixHistory=!1,doStripHead=!1,extractAndUse=function(e,t,n){var a=canUseCreateDoc?document.implementation.createHTMLDocument(""):null,o=a?a.documentElement:document.createElement("div");if(doStripHead){var r=e.indexOf("<head"),i=e.indexOf("</head>"),l=e.indexOf("<body");r>0&&i>r&&l>i&&(e=e.substring(0,r)+e.substring(l))}if(o.innerHTML=e,t){if(!(o=o.querySelector("#"+t)))return"SPARE could not find element '"+t+"' in downloaded content"}else{var s=o.getElementsByTagName("body");o=s[0]||o}var c=document.createElement(n.tagName);for(n.parentNode.replaceChild(c,n);n.lastChild;)n.removeChild(n.lastChild);for(;o.firstChild;)n.appendChild(o.firstChild);return c.parentNode.replaceChild(n,c),""},addHistory=function(elementID,pageURL,newElementID,newTitle,onSuccess,callbackContextData){history.pushState({oldId:elementID,url:pageURL,newId:newElementID,title:newTitle},newTitle,pageURL),newTitle&&(document.title=newTitle),"string"==typeof onSuccess?eval(onSuccess):onSuccess&&onSuccess(callbackContextData)},Transaction=function(url,postData,timeout,newElementID,victim,callbackContextData,onSuccess,onFailure){var xmlhttp=null,aborted=!1,timer=null;this.start=function(){"string"==typeof postData||null!=postData&&"object"==typeof postData?(("string"==typeof postData||"object"==typeof postData&&"URLSearchParams"==postData.constructor.name)&&xmlhttp.setRequestHeader("Content-type","application/x-www-form-urlencoded"),xmlhttp.send(postData)):xmlhttp.send(),timeout&&(timer=setTimeout(abortBecauseTimeout,1e3*timeout))};var abortBecauseTimeout=function(){if(aborted=!0,xmlhttp&&xmlhttp.readyState<4){try{xmlhttp.abort()}catch(e){}downloadFailed(408,"SPARE time limit exceeded")}},stateChangedHandler=function(){4!=xmlhttp.readyState||aborted||(clearTimeout(timer),200==xmlhttp.status?downloadSucceeded(xmlhttp):downloadFailed(xmlhttp.status,xmlhttp.statusText))},downloadSucceeded=function(xmlhttp){try{var err=extractAndUse(xmlhttp.responseText,newElementID,victim);if(err)return void downloadFailed(-1,err)}catch(e){return void downloadFailed(-3,"SPARE caught exception "+e.name+": "+e.message)}"string"==typeof onSuccess?eval(onSuccess):onSuccess&&onSuccess(callbackContextData)},downloadFailed=function(errorNumber,errorText){"string"==typeof onFailure?eval(onFailure):onFailure?onFailure(callbackContextData,errorNumber,errorText):window.location.href=url};xmlhttp=new XMLHttpRequest,xmlhttp.onreadystatechange=stateChangedHandler,xmlhttp.ourUrl=url,xmlhttp.open("string"==typeof postData||null!=postData&&"object"==typeof postData?"POST":"GET",url,!0),xmlhttp.responseType="text"};if("XMLHttpRequest"in window&&"getElementById"in document&&"querySelector"in document){if(canDoAjax=!0,"implementation"in document&&"createHTMLDocument"in document.implementation){canUseCreateDoc=!0;var testMarkup="<html><head><title>1</title></head><body>2<p></body></html>",testMarkee;try{testMarkee=document.implementation.createHTMLDocument("").documentElement,testMarkee.innerHTML=testMarkup}catch(e){canUseCreateDoc=!1,testMarkee=document.createElement("div"),testMarkee.innerHTML=testMarkup}testMarkee.innerHTML.indexOf("1")>=0&&testMarkee.innerHTML.toLowerCase().indexOf("<body")<0&&(doStripHead=!0)}"history"in window&&"pushState"in history&&(canFixHistory=!0)}return{timeout:void 0,transitionalContentID:void 0,onSuccess:null,onFailure:null,supportLevel:function(){return canDoAjax?2:0},canSimulateNavigation:function(){return canFixHistory},replaceContent:function(e,t,n,a,o,r,i,l,s){if(!canDoAjax)throw new Error("SPARE cannot operate because browser lacks support");if("string"!=typeof t||0==t.length)throw new Error("SPARE - pageURL is required");var c=document.getElementById(e);if(!c)throw new Error("SPARE could not find target element '"+e+"'");var d=s;if(arguments.length>=3&&arguments.length<=8&&!isNaN(arguments[arguments.length-1]))switch(d=arguments[arguments.length-1],arguments.length){case 3:n=void 0;case 4:a=void 0;case 5:o=void 0;case 6:r=void 0;case 7:i=void 0;default:l=void 0}isNaN(d)&&(d=SPARE.timeout),(isNaN(d)||d<=0||d>3600)&&(d=void 0);var u=new Transaction(t,a,d,n,c,o,r||SPARE.onSuccess,i||SPARE.onFailure);if(l||(l=SPARE.transitionalContentID),l){var m=document.getElementById(l);m&&m.innerHTML&&(c.innerHTML=m.innerHTML)}u.start()},simulateNavigation:function(e,t,n,a,o,r,i,l){if(!canFixHistory)throw new Error("SPARE is unable to set browser history");this.replaceContent(e,t,n,null,a,function(a){addHistory(e,t,n,l,o||SPARE.onSuccess,a)},r,null,i)},onPopStateRestore:function(e){e.state&&"url"in e.state&&(SPARE.replaceContent(e.state.oldId,e.state.url,e.state.newId),document.title=e.state.title)}}}();