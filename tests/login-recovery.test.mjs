import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source=ts.transpileModule(readFileSync(new URL('../auth/login-client.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {loginClientScript}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
async function launch({response=Response.json({authenticated:true}),offline=false,standalone=true,initial=true}={}){
  const stored=new Map([['orbit-personal-os','unsynced private changes'],['unrelated','keep']]);
  const redirects=[],requests=[],deletedCaches=[];
  const status={textContent:''},remember={checked:false};
  const button={disabled:false,textContent:'Giriş yap'};
  const form={querySelector:()=>button,addEventListener:()=>{}};
  const context={
    AbortController,setTimeout,clearTimeout,Promise,
    navigator:{},location:{replace:path=>redirects.push(path)},
    matchMedia:()=>({matches:standalone}),addEventListener:()=>{},
    document:{visibilityState:'visible',addEventListener:()=>{},getElementById:()=>status,querySelector:selector=>selector==='form'?form:selector==='[name="remember"]'?remember:null},
    localStorage:{get length(){return stored.size},key:index=>[...stored.keys()][index],removeItem:key=>stored.delete(key)},
    caches:{keys:async()=>['orbit-legacy','other-cache'],delete:async key=>deletedCaches.push(key)},
    fetch:async(path,options)=>{requests.push({path,options});if(offline)throw Error('network unavailable');return response},
  };
  context.window=context;
  runInNewContext(loginClientScript('/?view=rebuild',initial),context);
  await new Promise(resolve=>setImmediate(resolve));
  await new Promise(resolve=>setImmediate(resolve));
  return {stored,redirects,requests,deletedCaches,status,remember};
}

test('a launch that lands on login restores a valid server session without clearing unsynced data',async()=>{
  const result=await launch();
  assert.deepEqual(result.redirects,['/?view=rebuild']);
  assert.ok(result.stored.has('orbit-personal-os'));assert.deepEqual(result.deletedCaches,[]);
  assert.equal(result.requests[0].path,'/auth/session');assert.equal(result.requests[0].options.credentials,'same-origin');assert.equal(result.requests[0].options.cache,'no-store');
});
test('confirmed expiry clears only Orbit snapshots and never restores access',async()=>{
  const result=await launch({response:new Response(null,{status:401})});
  assert.deepEqual(result.redirects,[]);assert.equal(result.stored.has('orbit-personal-os'),false);assert.equal(result.stored.has('unrelated'),true);assert.deepEqual(result.deletedCaches,['orbit-legacy']);
});
test('offline and unavailable auth do not erase local data or bypass login',async()=>{
  for(const options of [{offline:true},{response:new Response(null,{status:503})}]){
    const result=await launch(options);assert.deepEqual(result.redirects,[]);assert.ok(result.stored.has('orbit-personal-os'));assert.deepEqual(result.deletedCaches,[]);assert.ok(result.status.textContent.length);
  }
});
test('installed app preselects remember-me but web and failed submissions retain their own choice',async()=>{
  assert.equal((await launch()).remember.checked,true);
  assert.equal((await launch({standalone:false})).remember.checked,false);
  assert.equal((await launch({initial:false})).remember.checked,false);
});
test('return destinations cannot escape the inline script',()=>{
  const script=loginClientScript('/?next=</script><script>alert(1)</script>',true);
  assert.equal(script.includes('</script>'),false);
});
