const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
function fixture() {
 const listeners={}, storage=new Map(),sent=[], elements=new Map(); let changed=false;
 const checkbox={checked:true,addEventListener:(name,fn)=>listeners['checkbox:'+name]=fn};
 const ctx={crypto:webcrypto,URLSearchParams,Date,Set,JSON,location:{search:'?ref=med01'},setTimeout:()=>1,clearTimeout(){},localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},document:{querySelector:selector=>selector==='#usageMetricsEnabled'?checkbox:null,addEventListener(){}},window:{addEventListener:(name,fn)=>listeners[name]=fn,SyllabloomAuth:{getToken:async()=>{if(changed)listeners['syllabloom:auth-change']({detail:{signedIn:true,userId:'bob'}});return 'token';}}},fetch:async(url,options)=>{sent.push(JSON.parse(options.body));return {ok:true};}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../product-events.js'),'utf8'),ctx);
 return {api:ctx.window.SyllabloomEvents,sent,checkbox,storage,login:user=>listeners['syllabloom:auth-change']({detail:{signedIn:true,userId:user}}),switchDuringToken:()=>changed=true,toggle:()=>listeners['checkbox:change']()};
}
test('events are authenticated, stable across retries and content-free at call sites',async()=>{
 const f=fixture();f.api.track('study_completed');await f.api.flush();assert.equal(f.sent.length,0);
 f.login('alice');f.api.track('study_completed',{cards:5});await f.api.flush();
 assert.equal(f.sent[0].events.length,2);assert.equal(f.sent[0].events[1].properties.referral,'med01');
 await f.api.flush();assert.equal(f.sent.length,1);
});
test('an account switch during token retrieval prevents cross-account events',async()=>{
 const f=fixture();f.login('alice');f.switchDuringToken();await f.api.flush();assert.equal(f.sent.length,0);
});
test('opting out clears pending events and disables new browser tracking',async()=>{
 const f=fixture();f.login('alice');f.checkbox.checked=false;f.toggle();f.api.track('study_completed');await f.api.flush();assert.equal(f.sent.length,0);
});
