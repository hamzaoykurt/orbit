// No token is readable by JavaScript. The server alone decides whether to restore.
export function loginClientScript(next: string, initial: boolean) {
  const destination = JSON.stringify(next).replace(/</g, '\\u003c');
  return `(function(){
var submitting=false,checking=false,controller;
var form=document.querySelector('form'),status=document.getElementById('session-status');
function message(text){if(status)status.textContent=text}
function clearPrivateSnapshots(){
  try{for(var i=localStorage.length-1;i>=0;i--){var key=localStorage.key(i);if(key&&key.startsWith('orbit'))localStorage.removeItem(key)}}catch(e){}
  if('caches' in window)caches.keys().then(function(keys){return Promise.all(keys.filter(function(key){return key.startsWith('orbit-')}).map(function(key){return caches.delete(key)}))}).catch(function(){});
}
async function restoreSession(){
  if(checking||submitting)return;checking=true;controller=new AbortController();
  var timeout=setTimeout(function(){controller.abort()},8000);
  message('Oturumun kontrol ediliyor…');
  try{
    var response=await fetch('/auth/session',{credentials:'same-origin',cache:'no-store',signal:controller.signal});
    if(submitting)return;
    if(response.ok){var session=await response.json();if(session.authenticated===true&&!submitting){location.replace(${destination});return}}
    if(response.status===401){clearPrivateSnapshots();message('')}
    else message('Oturum kontrol edilemedi. Bağlantını kontrol edip tekrar deneyebilirsin.');
  }catch(e){if(!submitting)message('Bağlantı kurulamadı. Kayıtlı oturumun silinmedi.')}
  finally{clearTimeout(timeout);checking=false}
}
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').then(function(registration){return registration.update()}).catch(function(){});
var remember=document.querySelector('[name="remember"]');
if(${initial}&&remember&&((window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true))remember.checked=true;
var reveal=document.querySelector('.reveal');if(reveal)reveal.addEventListener('click',function(){var input=document.getElementById('password');var show=input.type==='password';input.type=show?'text':'password';reveal.textContent=show?'Gizle':'Göster';reveal.setAttribute('aria-label',show?'Parolayı gizle':'Parolayı göster');reveal.setAttribute('aria-pressed',String(show))});
if(form)form.addEventListener('submit',function(){submitting=true;if(controller)controller.abort();var button=form.querySelector('.submit');button.disabled=true;button.textContent='Giriş yapılıyor…'});
window.addEventListener('pageshow',function(event){if(event.persisted){submitting=false;var button=form&&form.querySelector('.submit');if(button){button.disabled=false;button.textContent='Giriş yap'}restoreSession()}});
window.addEventListener('online',restoreSession);
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')restoreSession()});
restoreSession();
})();`;
}
