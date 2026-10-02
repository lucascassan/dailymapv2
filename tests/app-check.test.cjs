const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function setup(key) {
  const window={DAILY_APP_CHECK_CONFIG:{siteKey:key}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app-check.js'),'utf8'),{window});
  let initialized=0,attempts=0,fail=false;
  const sdk={
    ReCaptchaEnterpriseProvider:class {constructor(siteKey){this.key=siteKey}},
    initializeAppCheck(app,options){initialized++;assert.equal(options.provider.key,'public-key');assert.equal(options.isTokenAutoRefreshEnabled,true);return{app}},
    async getToken(check,forceRefresh){attempts++;assert.equal(forceRefresh,false);if(fail)throw Error('verification failed');return{token:'verified-token'}}
  };
  return{guard:window.DailyAppCheck,sdk,counts:()=>({initialized,attempts}),setFail:value=>fail=value};
}
test('missing configuration fails before initialization',async()=>{
  const env=setup('');await assert.rejects(env.guard.ensure({},env.sdk),error=>error.code==='daily/app-check-config');assert.equal(env.counts().initialized,0);
});
test('valid verification enables renewal and reuses initialized App Check',async()=>{
  const env=setup('public-key'),app={};await env.guard.ensure(app,env.sdk);await env.guard.ensure(app,env.sdk);assert.deepEqual(env.counts(),{initialized:1,attempts:2});
});
test('invalid token blocks online access and permits a subsequent retry',async()=>{
  const env=setup('public-key'),app={};env.setFail(true);await assert.rejects(env.guard.ensure(app,env.sdk),error=>error.code==='daily/app-check-failed'&&error.cause.message==='verification failed');env.setFail(false);await env.guard.ensure(app,env.sdk);assert.equal(env.counts().initialized,1);
});
test('missing token also fails closed',async()=>{
  const env=setup('public-key');env.sdk.getToken=async()=>({});await assert.rejects(env.guard.ensure({},env.sdk),error=>error.code==='daily/app-check-failed');
});
