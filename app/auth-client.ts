// Installed before the startup request so every private API handles expiry alike.
// The server publishes only the END TIME of this device's session in a readable cookie
// (orbit_exp). Without a valid one (lapsed, never issued, cleared) nothing is painted until
// the server confirms the session; offline means the login page, never the local copy.
// Tokens are HttpOnly; this script never reads or stores credentials.
export const authClientScript = `(function(){
if(window.__orbitAuthInstalled)return;window.__orbitAuthInstalled=true;
var nativeFetch=window.fetch.bind(window),leaving=false;
function lock(){if(leaving)return;leaving=true;document.documentElement.style.visibility='hidden';location.replace('/login')}
var markName=location.protocol==='https:'?'__Host-orbit_exp':'orbit_exp';
function markValid(){var parts=document.cookie.split('; ');for(var i=0;i<parts.length;i++){if(parts[i].indexOf(markName+'=')===0){var end=Number(parts[i].slice(markName.length+1));return end>0&&end*1000>Date.now()}}return false}
if(!markValid()){document.documentElement.style.visibility='hidden';nativeFetch('/auth/session',{cache:'no-store',credentials:'same-origin'}).then(function(r){if(r.ok&&!leaving)document.documentElement.style.visibility='';else lock()},function(){lock()})}
window.fetch=async function(input,options){var response=await nativeFetch(input,options);var url=new URL(typeof input==='string'?input:input.url||String(input),location.href);if(url.origin===location.origin&&(url.pathname.startsWith('/api/')||url.pathname==='/auth/session')&&response.status===401)lock();return response};
async function check(){try{var response=await window.fetch('/auth/session',{cache:'no-store',credentials:'same-origin'});if(response.ok&&!leaving)document.documentElement.style.visibility=''}catch(e){}}
window.addEventListener('pagehide',function(){document.documentElement.style.visibility='hidden'});
window.addEventListener('pageshow',function(event){if(event.persisted)check()});
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')check()});
window.addEventListener('focus',check);
window.addEventListener('storage',function(event){if(event.key===null||event.key==='orbit-auth-logout')check()});
setInterval(function(){if(document.visibilityState==='visible')check()},300000);
})();`;
