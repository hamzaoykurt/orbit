import { loginClientScript } from './login-client';

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);

export function loginPage({ error = '', next = '/', status = 200, configured = true, retryAfter, remembered = false }: {
  error?: string; next?: string; status?: number; configured?: boolean; retryAfter?: number; remembered?: boolean;
} = {}) {
  const nonce = crypto.randomUUID().replaceAll('-', '');
  return new Response(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#FFF7EA"><meta name="robots" content="noindex,nofollow"><title>Giriş yap · Orbit</title><link rel="icon" type="image/png" href="/orbit-favicon-v3.png"><style nonce="${nonce}">
:root{--canvas:#FFF7EA;--panel:#fff;--panel-2:#FFEFD6;--ink:#1B1035;--muted:#5C5672;--soft:#6B6580;--ctrl:#8E8799;--btn:#D63A1F;--ink-btn:#C2331A;--sun:#FFD23F;--danger:#D6204A}
*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:24px 24px 40px;background:var(--canvas);color:var(--ink);font-family:"Segoe UI",Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.55;-webkit-font-smoothing:antialiased}
main{width:min(100%,440px)}
.scene{position:relative;isolation:isolate;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;min-height:176px;padding:22px 24px 48px;border-radius:28px;margin-bottom:20px;background:linear-gradient(180deg,var(--top),var(--bottom));color:var(--sc)}
body[data-phase=sabah]{--top:#FFE7A8;--bottom:#FFC9A8;--sc:#1B1035}body[data-phase=gun]{--top:#BFE6FF;--bottom:#E8F6FF;--sc:#1B1035}body[data-phase=aksam]{--top:#B3406E;--bottom:#5B3FB0;--sc:#fff}body[data-phase=gece]{--top:#2B2466;--bottom:#4B3A9A;--sc:#fff}
.scene .sun{position:absolute;z-index:-1;left:78%;top:26%;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:var(--sun);box-shadow:0 0 0 12px rgba(255,210,63,.35)}
body[data-phase=gece] .sun{background:transparent;box-shadow:inset -12px -4px 0 0 var(--sun)}
.scene .hill{position:absolute;z-index:-1;left:0;right:0;bottom:0;height:40px;background:linear-gradient(180deg,rgba(255,255,255,.3),rgba(255,255,255,.5));clip-path:polygon(0 60%,25% 25%,55% 55%,80% 20%,100% 45%,100% 100%,0 100%)}
.brand{display:flex;align-items:center;gap:10px;font-size:19px;font-weight:800;letter-spacing:-.4px}.mark{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.5);color:var(--sc)}.mark svg{width:21px;height:21px}
.scene h1{margin:14px 0 0;font-size:34px;line-height:1.05;letter-spacing:-.03em;font-weight:800}
.card{background:var(--panel);border-radius:24px;padding:28px 24px;box-shadow:0 10px 28px -14px rgba(214,58,31,.55),0 1px 2px rgba(27,16,53,.06)}
.eyebrow{font-size:12px;font-weight:700;letter-spacing:.08em;color:var(--ink-btn);margin:0 0 8px}
.intro{font-size:15px;line-height:1.55;color:var(--muted);margin:0 0 8px}
label.field{display:block;font-size:13px;font-weight:600;margin:18px 0 8px;color:var(--ink)}
input:not([type=checkbox]){display:block;min-width:0;width:100%;height:52px;padding:0 14px;border:1.5px solid var(--ctrl);background:var(--panel-2);border-radius:14px;color:var(--ink);font:inherit;font-size:16px;outline:none}
input:not([type=checkbox]):focus{outline:2px solid var(--ink-btn);outline-offset:1px;border-color:var(--ink-btn)}input::placeholder{color:var(--soft)}
.password{position:relative}.password input{padding-right:84px}.reveal{position:absolute;right:5px;top:5px;height:42px;min-width:44px;padding:0 12px;border:0;border-radius:10px;background:transparent;color:var(--ink-btn);font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.reveal:focus-visible,button:focus-visible{outline:2px solid var(--ink-btn);outline-offset:2px}
.remember{display:flex;align-items:center;gap:10px;font-size:14px;margin:18px 0 4px;cursor:pointer;width:fit-content;min-height:44px}.remember input{accent-color:var(--btn);width:22px;height:22px;margin:0}
.hint{margin:0 0 22px 32px;color:var(--muted);font-size:13px;line-height:1.5}
.submit{width:100%;display:flex;align-items:center;justify-content:center;gap:10px;min-height:52px;border:0;border-radius:999px;background:var(--btn);color:#fff;font:inherit;font-size:16px;font-weight:600;cursor:pointer;transition:background .15s}.submit:hover{background:#c8351b}.submit:active{transform:scale(.97)}.submit:disabled{opacity:.6;cursor:wait}.submit svg{width:18px}
.error{padding:12px 14px;border-radius:14px;background:#FDE6EC;color:#8F1233;font-size:14px;line-height:1.5;margin:16px 0}
.footer{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:13px;margin:22px 4px 0}.footer svg{width:14px;height:14px;flex-shrink:0}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
@media(max-width:440px){.scene h1{font-size:32px}body{padding:16px 24px 32px}}
#session-status{margin-top:16px;font-size:13px;line-height:1.5;color:var(--muted)}
</style></head><body data-phase="gun"><main><section class="scene" aria-label="Gün sahnesi"><span class="sun" aria-hidden="true"></span><span class="hill" aria-hidden="true"></span><div class="brand"><span class="mark"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="3" fill="currentColor"/><circle cx="19" cy="7" r="2.5" fill="#fff" stroke="currentColor" stroke-width="1.7"/></svg></span>Orbit</div><h1>Kaldığın yerden<br>devam et.</h1></section><div class="card"><p class="eyebrow">KİŞİSEL ÇALIŞMA ALANIN</p><p class="intro">Planların, notların ve hedeflerin seni bekliyor. Devam etmek için giriş yap.</p>
${error ? `<div class="error" role="alert">${escape(error)}</div>` : ''}
${configured ? `<form method="post" action="/auth/login"><input type="hidden" name="next" value="${escape(next)}"><label class="field" for="username">Kullanıcı adı</label><input id="username" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required maxlength="64" placeholder="Kullanıcı adın" autofocus><label class="field" for="password">Parola</label><div class="password"><input id="password" type="password" name="password" autocomplete="current-password" required maxlength="256" placeholder="Parolan"><button class="reveal" type="button" aria-label="Parolayı göster" aria-pressed="false">Göster</button></div><label class="remember"><input type="checkbox" name="remember" value="1"${remembered ? ' checked' : ''}>Beni hatırla</label><p class="hint">Kendi cihazında seç; her seferinde giriş yapman gerekmesin.</p><button class="submit" type="submit">Giriş yap<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button></form>` : ''}
</div><p class="footer"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="3" stroke="currentColor" stroke-width="1.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="1.5"/></svg>Bu alan yalnızca sana ait. Herkese açık kayıt yok.</p><p id="session-status" role="status"></p></main><script nonce="${nonce}">(function(){var h=new Date().getHours();document.body.dataset.phase=h>=5&&h<11?"sabah":h>=11&&h<17?"gun":h>=17&&h<21?"aksam":"gece"})();</script><script nonce="${nonce}">
${configured ? loginClientScript(next, status === 200) : ''}
</script></body></html>`, { status, headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'Content-Security-Policy': `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src 'self'; connect-src 'self'; worker-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
    ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}),
  } });
}
