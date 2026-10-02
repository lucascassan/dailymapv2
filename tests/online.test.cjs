const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Lucas SS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({channel:'msedge', headless:true});
  const records = new Map(), watchers = new Map();
  let connections=0,simulateCollision=true;
  let writes = 0;
  async function pageFor(uid) {
    let rejectEnd = false;
    const context = await browser.newContext({viewport:{width:1440,height:900}});
    const page = await context.newPage();page.setDefaultTimeout(5000);
    await page.exposeFunction('mockConnect',()=>{connections++});
    await page.exposeFunction('mockCreate', (code, payload) => {
      if(simulateCollision){simulateCollision=false;const error=Error('Collision');error.code='daily/code-in-use';throw error}
      if(records.has(code))throw Error('Session exists');
      records.set(code, {owner:uid,payload});
    });
    await page.exposeFunction('mockGet', code => records.get(code) || null);
    await page.exposeFunction('mockWrite', async (code, payload) => {
      assert.equal(records.get(code).owner, uid, 'owner-only transport');
      assert.equal(records.get(code).closedAt, undefined, 'closed sessions reject writes');
      records.set(code, {...records.get(code),payload}); writes++;
      for(const [target, watched] of watchers)if(watched===code)
        await target.evaluate(record => window.mockReceive?.(record), records.get(code));
    });
    await page.exposeFunction('mockEnd', async (code,payload) => {
      if(rejectEnd){rejectEnd=false;throw Error('PERMISSION_DENIED')}
      assert.equal(records.get(code).owner,uid);
      assert.equal(records.get(code).closedAt,undefined);
      records.set(code,{...records.get(code),payload,closedAt:Date.now()});
      for(const [target,watched] of watchers)if(watched===code)await target.evaluate(record=>window.mockReceive?.(record),records.get(code));
    });
    await page.exposeFunction('mockRejectEnd', () => {rejectEnd=true});
    await page.exposeFunction('mockWatch', code => watchers.set(page, code));
    await page.route('**/firebase-config.js', route => route.fulfill({contentType:'text/javascript',body:'window.DAILY_FIREBASE_CONFIG={apiKey:"test",authDomain:"test",projectId:"test",databaseURL:"test",appId:"test"};'}));
    await page.route('**/firebase-client.js', route => route.fulfill({contentType:'text/javascript',body:`window.createDailyFirebaseClient=async()=>{await window.mockConnect();return({uid:${JSON.stringify(uid)},create:async(...args)=>{try{return await window.mockCreate(...args)}catch(error){if(error.message.includes('Collision'))error.code='daily/code-in-use';throw error}},get:window.mockGet,write:window.mockWrite,end:window.mockEnd,watch(code,change){window.mockReceive=change;window.mockWatch(code);return()=>window.mockReceive=null},connected(change){window.mockConnected=change;change(true);return()=>window.mockConnected=null}})};`}));
    await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
    return page;
  }
  try {
    const owner = await pageFor('owner');
    assert.equal(await owner.locator('#session-dialog').isVisible(),true);assert.equal(await owner.locator('#session-dialog .dialog-close').count(),0);await owner.keyboard.press('Escape');assert.equal(await owner.locator('#session-dialog').isVisible(),true);assert.equal(connections,0);
    await owner.click('#mode-local');assert.equal(await owner.locator('#session-dialog').isVisible(),true);assert.equal(await owner.locator('#session-online-panel').isVisible(),false);await owner.click('#use-local');assert.equal(await owner.locator('#session-bar').isVisible(),false);assert.equal(connections,0);assert.equal(await owner.evaluate(()=>DailyOnline.active),false);
    await owner.click('#files-toggle');await owner.click('#session-leave');
    await owner.evaluate(()=>{state.projectName='Local original';save();render()});
    await owner.click('#session-create');
    await owner.waitForFunction(()=>DailyOnline.active&&DailyOnline.canEdit);
    const code = await owner.evaluate(()=>JSON.parse(localStorage.getItem('daily-online-session')).code);
    assert.match(code,/^[A-Z0-9]{4}$/);assert.match(code,/[A-Z]/);assert.match(code,/[0-9]/);
    assert.equal(await owner.locator('#project-title').textContent(),'Projeto');
    const visitors = [await pageFor('visitor1'), await pageFor('visitor2')];
    for(const page of visitors){await page.click('#mode-online');await page.fill('#session-code',code.toLowerCase());assert.equal(await page.locator('#session-join button').textContent(),'Entrar');assert.equal(await page.locator('#session-join button').evaluate(el=>getComputedStyle(el).borderRadius),'10px');await page.click('#session-join button');await page.waitForFunction(()=>DailyOnline.active&&!DailyOnline.canEdit);assert.equal(await page.locator('#edit-map').isVisible(),false)}
    await owner.click('#files-toggle');await owner.click('#add-area');await owner.fill('#area-name','Desenvolvimento');await owner.fill('#area-topics','Implementação');await owner.click('#area-form button[type=submit]');await owner.waitForFunction(()=>!document.getElementById('area-dialog').open);
    await owner.click('#files-toggle');await owner.click('#add-member');await owner.fill('#name','Ana');await owner.fill('#role','TI');await owner.click('#employee-form button[type=submit]');
    await owner.evaluate(()=>assign(state.employees[0].id,state.areas[0].id,'0001, 0002'));
    await owner.click('#edit-map');await owner.locator('#background-color').evaluate(input=>{input.value='#bbccdd';input.dispatchEvent(new Event('input',{bubbles:true}))});
    for(const page of visitors){await page.waitForFunction(()=>state.employees[0]?.tasksByArea[state.areas[0]?.id]?.length===2&&state.backgroundColor==='#bbccdd');assert.equal(await page.locator('.chip button').isVisible(),false);await page.locator('.area').hover();assert.match(await page.locator('#area-tooltip').textContent(),/0001, 0002/)}
    // Moving a card publishes a normalized layout shared by every visitor.
    const handle=owner.locator('.card-handle.move'), box=await handle.boundingBox();
    await owner.mouse.move(box.x+box.width/2,box.y+box.height/2);await owner.mouse.down();await owner.mouse.move(box.x+box.width/2+15,box.y+box.height/2+10);await owner.mouse.up();
    for(const page of visitors)await page.waitForFunction(()=>Object.keys(cardLayouts).length===1);
    assert.deepEqual(await visitors[0].evaluate(()=>cardLayouts),await owner.evaluate(()=>cardLayouts));
    const before=writes;
    for(const page of visitors){assert.equal(await page.evaluate(()=>{try{assign(state.employees[0].id,state.areas[0].id,'0003');return false}catch{return true}}),true);await page.evaluate(()=>DailyOnline.publish());await page.locator('.person').click();assert.equal(await page.evaluate(()=>selected),null)}
    assert.equal(writes,before);
    await owner.evaluate(()=>window.mockConnected(false));
    await owner.evaluate(()=>{state.projectName='Reconectado';save();render()});
    assert.match(await owner.locator('#session-status').textContent(),/Reconectando/);
    await owner.evaluate(()=>window.mockConnected(true));
    for(const page of visitors)await page.waitForFunction(()=>state.projectName==='Reconectado');
    await visitors[0].reload();await visitors[0].click('#mode-online');await visitors[0].click('#session-join button');await visitors[0].waitForFunction(()=>DailyOnline.active&&!DailyOnline.canEdit&&state.projectName==='Reconectado');
    await owner.waitForFunction(()=>document.getElementById('session-status').textContent.endsWith('Conectado'));
    await owner.click('#files-toggle');await owner.click('#session-leave');assert.equal(await owner.locator('#project-title').textContent(),'Local original');
    await visitors[1].click('#files-toggle');await visitors[1].click('#session-leave');assert.equal(await visitors[1].evaluate(()=>state.areas.length),0);
    await visitors[1].evaluate(code=>localStorage.setItem('daily-owned-sessions',JSON.stringify({[code]:true})),code);
    await visitors[1].fill('#session-code',code);await visitors[1].click('#session-join button');await visitors[1].waitForFunction(()=>DailyOnline.active&&!DailyOnline.canEdit);assert.equal(await visitors[1].locator('#session-end').isVisible(),false);
    await owner.fill('#session-code',code);await owner.click('#session-join button');await owner.waitForFunction(()=>DailyOnline.active&&DailyOnline.canEdit&&state.projectName==='Reconectado');
    assert.equal(await owner.locator('#session-end').isVisible(),true);
    await owner.evaluate(()=>window.mockRejectEnd());await owner.click('#session-end');
    await owner.waitForFunction(()=>document.getElementById('session-status').textContent.includes('Encerramento negado pelo Firebase'));
    assert.equal(await owner.evaluate(()=>DailyOnline.canEdit),true);
    assert.equal(await owner.locator('#session-connection').textContent(),'Encerramento negado pelo Firebase');
    assert.match(await owner.locator('#toast').textContent(),/Publique as regras atualizadas/);
    await owner.click('#session-end');
    for(const page of [owner,...visitors]){await page.waitForFunction(()=>document.getElementById('session-connection')?.textContent==='Sessão encerrada');assert.equal(await page.locator('dialog[open]').count(),0);assert.equal(await page.evaluate(()=>DailyOnline.canEdit),false);assert.match(await page.locator('#session-status').textContent(),/Sessão encerrada/);assert.equal(await page.locator('#session-connection').evaluate(el=>getComputedStyle(el).color),'rgb(195, 62, 62)')}
    for(const page of [owner,visitors[0]]) {
      await page.click('#files-toggle');
      const jsonDownload=page.waitForEvent('download');await page.click('#backup');
      const jsonFile=await jsonDownload, jsonStream=await jsonFile.createReadStream();const jsonChunks=[];for await(const chunk of jsonStream)jsonChunks.push(chunk);
      assert.equal(JSON.parse(Buffer.concat(jsonChunks).toString()).employees[0].name,'Ana');
      await page.click('#files-toggle');const pdfDownload=page.waitForEvent('download');await page.click('#export-results');
      const pdfFile=await pdfDownload,pdfStream=await pdfFile.createReadStream();const pdfChunks=[];for await(const chunk of pdfStream)pdfChunks.push(chunk);
      assert.equal(Buffer.concat(pdfChunks).subarray(0,4).toString(),'%PDF');
    }
    const writesAfterEnd=writes;
    await owner.evaluate(()=>DailyOnline.publish());assert.equal(writes,writesAfterEnd);
    for(const page of [owner,visitors[0]]){await page.reload();await page.click('#mode-online');await page.click('#session-join button');await page.waitForFunction(()=>document.getElementById('session-message').textContent.includes('Sessão encerrada'));assert.equal(await page.evaluate(()=>DailyOnline.active),false);assert.equal(await page.locator('#session-dialog').isVisible(),true)}
    await visitors[1].click('#files-toggle');await visitors[1].click('#session-leave');await visitors[1].fill('#session-code',code);await visitors[1].click('#session-join button');await visitors[1].waitForFunction(()=>document.getElementById('session-message').textContent.includes('Sessão encerrada'));assert.equal(await visitors[1].evaluate(()=>DailyOnline.active),false);
    // Real client fails before network access when the App Check site key is missing.
    const context=await browser.newContext(),unconfigured=await context.newPage();
    let remoteRequests=0;unconfigured.on('request',request=>{if(request.url().startsWith('https://'))remoteRequests++});
    await unconfigured.route('**/firebase-config.js',route=>route.fulfill({contentType:'text/javascript',body:require('node:fs').readFileSync(path.resolve(__dirname,'../firebase-config.js'),'utf8')+"\nwindow.DAILY_APP_CHECK_CONFIG.siteKey='';"}));
    await unconfigured.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
    await unconfigured.click('#session-create');await unconfigured.waitForFunction(()=>document.getElementById('session-message').textContent.includes('chave pública do App Check'));
    assert.equal(await unconfigured.evaluate(()=>DailyOnline.active),false);assert.equal(remoteRequests,0);
    await unconfigured.click('#mode-local');await unconfigured.click('#use-local');assert.equal(await unconfigured.locator('#session-dialog').isVisible(),false);await context.close();
    console.log('PASS: sessões simuladas, exportações, App Check sem chave bloqueia acesso online e mantém Offline.');
  } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
