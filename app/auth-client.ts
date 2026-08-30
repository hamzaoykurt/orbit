// Installed before the startup request so every private API handles expiry alike.
// Tokens are HttpOnly; this script never reads or stores credentials.
export const authClientScript = `(function(){
if(window.__orbitAuthInstalled)return;window.__orbitAuthInstalled=true;
var nativeFetch=window.fetch.bind(window),leaving=false;
function lock(){if(leaving)return;leaving=true;document.documentElement.style.visibility='hidden';location.replace('/login')}
window.fetch=async function(input,options){var response=await nativeFetch(input,options);var url=new URL(typeof input==='string'?input:input.url||String(input),location.href);if(url.origin===location.origin&&(url.pathname.startsWith('/api/')||url.pathname==='/auth/session')&&response.status===401)lock();return response};
async function check(){try{var response=await window.fetch('/auth/session',{cache:'no-store',credentials:'same-origin'});if(response.ok&&!leaving)document.documentElement.style.visibility=''}catch(e){}}
window.addEventListener('pagehide',function(){document.documentElement.style.visibility='hidden'});
window.addEventListener('pageshow',function(event){if(event.persisted)check()});
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')check()});
window.addEventListener('focus',check);
window.addEventListener('storage',function(event){if(event.key===null||event.key==='orbit-auth-logout')check()});
setInterval(function(){if(document.visibilityState==='visible')check()},300000);
})();`;
