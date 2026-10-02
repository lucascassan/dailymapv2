'use strict';
(() => {
  let clientPromise, client, session = null, unsubscribe, disconnect, timer;
  let pending = false, writing = false, connected = false, lastError = '', generation = 0;
  const config = window.DAILY_FIREBASE_CONFIG;
  const configured = config && ['apiKey', 'authDomain', 'projectId', 'databaseURL', 'appId'].every(key => config[key]);
  const mutationSelector = '#edit-map,#background-control,#rename-project,#add-area,#add-member,#import-json,#clear-all,#unassign,.team-hint,.person .delete,.person .grip,.chip button,.card-handle';
  const snapshot = () => JSON.stringify({version:2, ...state, layouts:cardLayouts});
  const prettyCode = code => code.match(/.{1,4}/g).join(' ');
  const validSavedCode = code => typeof code==='string' && /^([A-Z0-9]{4}|[0-9]{12})$/.test(code);
  function newSessionCode() {
    const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code;
    do {code='';while(code.length<4){const byte=crypto.getRandomValues(new Uint8Array(1))[0];if(byte<252)code+=alphabet[byte%36]}}
    while(!/[A-Z]/.test(code)||!/[0-9]/.test(code));
    return code;
  }
  function rememberedOwner(code, record) {
    let owned = {}, previous;
    try {owned=JSON.parse(localStorage.getItem('daily-owned-sessions')||'{}');previous=JSON.parse(localStorage.getItem('daily-online-session'))}catch{}
    return record.owner===client.uid && (owned?.[code]===true || previous?.code===code && previous.owner===true);
  }
  function status() {
    const label=$('session-status');label.replaceChildren();
    if(!session)return;
    label.append(`${session.owner ? 'Dono' : 'Visitante'} · `);
    const code=session.code,copy=el('button','session-code-button',prettyCode(code));
    copy.type='button';copy.id='session-code-copy';copy.title='Copiar código';copy.setAttribute('aria-label','Copiar código da sessão '+code);
    copy.onclick=async()=>{try{await navigator.clipboard.writeText(code);toast('Código da sessão copiado.')}catch{toast('Não foi possível copiar. Código da sessão: '+code)}};
    label.append(copy,' · ');
    const connection=el('span',session.closed?'session-closed':'',session.closed?'Sessão encerrada':lastError||(!connected?'Reconectando…':pending||writing?'Sincronizando…':'Conectado'));
    connection.id='session-connection';label.append(connection);
  }
  function applyPermissions() {
    const visitor = !!(session && (!session.owner || session.closed));
    document.body.classList.toggle('session-visitor', visitor);
    $('edit-map').disabled = visitor;
    if (visitor) {
      selected = null;
      document.querySelectorAll('[draggable]').forEach(node => node.draggable = false);
      $('no-results').textContent = '';
    } else $('no-results').textContent = '';
    document.querySelector('.local-note').textContent = session
      ? visitor ? 'Você está acompanhando esta sessão. Somente o dono pode editar.' : 'As alterações são compartilhadas com os visitantes. Mantenha o acesso do dono neste navegador.'
      : 'Os dados ficam salvos neste navegador.';
    $('clear-dialog').querySelector('p').textContent = session
      ? 'Isso remove todas as áreas, membros, tarefas e ajustes desta sessão para todos os participantes.'
      : 'Isso remove todas as áreas, membros, tarefas e ajustes deste navegador.';
    $('session-bar').hidden = !session;
    $('session-end').hidden = !session?.owner || session.closed;
    if(session?.closed)document.querySelector('.local-note').textContent='Sessão encerrada. Os dados continuam disponíveis para exportação.';
    status();
  }
  async function initialize() {
    if (!configured) throw Error('Configure o Firebase em firebase-config.js para usar sessões online.');
    if (!clientPromise) clientPromise = window.createDailyFirebaseClient(config).catch(error => {clientPromise = null; throw error});
    client = await clientPromise;
    return client;
  }
  function applyPayload(payload) {
    const restored = decodeMap(JSON.parse(payload));
    state = restored.state; cardLayouts = restored.layouts; selected = null;
    render();
  }
  function detach() {
    clearTimeout(timer); timer = null; unsubscribe?.(); disconnect?.(); unsubscribe = disconnect = null;
    generation++; pending = false; writing = false; lastError = ''; connected = false;
  }
  function attach(code, owner, record) {
    if(record.closedAt !== undefined)throw Error('Sessão encerrada. Não é possível entrar novamente.');
    // Validate before switching away from the local map.
    decodeMap(JSON.parse(record.payload));
    detach(); session = {code, owner}; setEditMode(false);
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    applyPayload(record.payload);
    localStorage.setItem('daily-online-session', JSON.stringify(session));
    if(owner){let owned={};try{owned=JSON.parse(localStorage.getItem('daily-owned-sessions')||'{}')}catch{}localStorage.setItem('daily-owned-sessions',JSON.stringify({...owned,[code]:true}))}
    const current = generation;
    disconnect = client.connected(value => {if(current !== generation)return; connected = value; status(); if(value && pending) flush()});
    unsubscribe = client.watch(code, value => {
      if (current !== generation) return;
      if (!value) {lastError = 'Sessão indisponível'; status(); return}
      if (value.closedAt !== undefined) {if(!session.closed)applyPayload(value.payload);markClosed(); return}
      if (session.owner && value.owner !== client.uid) {
        session.owner = false; pending = false; setEditMode(false); applyPermissions();
      }
      if (!session.owner) {
        try {applyPayload(value.payload); lastError = ''; status()}
        catch {lastError = 'Dados da sessão inválidos'; status()}
      }
    }, error => {
      if (current !== generation) return;
      lastError = 'Sem acesso à sessão'; session.owner = false; pending = false;
      setEditMode(false); applyPermissions(); console.error(error);
    });
    applyPermissions();
    if(record.closedAt !== undefined)markClosed();
  }
  function publish() {
    if (!session?.owner || session.closed) return;
    pending = true; status();
    // Throttle dragging to at most four full-map updates per second.
    if (!timer) timer = setTimeout(() => {timer = null; flush()}, 250);
  }
  async function flush() {
    if (!session?.owner || session.closed || writing || !pending || !connected) return;
    const current = generation, code = session.code;
    writing = true; pending = false; status();
    try {await client.write(code, snapshot()); if(current===generation)lastError = ''}
    catch(error) {
      if(current===generation&&!session?.closed){pending = true; lastError = 'Falha ao salvar'; console.error(error); toast('Não foi possível salvar a sessão. Suas alterações ainda estão nesta tela.');}
    } finally {
      if(current===generation){writing = false; status(); if(pending&&!lastError)publish()}
    }
  }
  function markClosed() {
    if(!session || session.closed)return;
    session.closed = true; pending = false; clearTimeout(timer); timer = null;
    setEditMode(false); selected = null;
    document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
    applyPermissions();
  }
  window.DailyOnline = {get active(){return !!session}, get canEdit(){return !session || session.owner&&!session.closed}, publish, applyPermissions};
  // UI restriction is complementary to the owner-only Firebase database rules.
  document.addEventListener('click', event => {
    if (!session || session.owner&&!session.closed) return;
    if (event.target.closest(mutationSelector + ',.person')) {event.preventDefault(); event.stopImmediatePropagation()}
  }, true);
  for (const type of ['drop', 'dragstart', 'pointerdown', 'keydown', 'input', 'change', 'submit']) {
    document.addEventListener(type, event => {
      if (!session || session.owner&&!session.closed) return;
      const blocked = type === 'drop' || type === 'dragstart'
        || event.target.closest(mutationSelector + ',#project-form,#area-form,#employee-form,#task-form,#restore,#csv')
        || type === 'keydown' && event.target.closest('.person') && ['Enter', ' '].includes(event.key);
      if (blocked) {event.preventDefault(); event.stopImmediatePropagation()}
    }, true);
  }
  function report(error) {
    console.error(error);
    $('session-message').textContent = error.code?.startsWith('daily/app-check-') ? error.message : error.code
      ? 'Não foi possível conectar. Verifique a configuração, a autenticação anônima e as regras do Firebase.'
      : error.message;
  }
  async function action(run) {
    $('mode-online').disabled = $('mode-local').disabled = true;
    $('session-create').disabled = true;
    $('session-join').querySelector('button').disabled = true;
    $('session-message').textContent = 'Conectando…';
    try {await initialize(); await run(); $('session-message').textContent = ''}
    catch(error) {report(error)}
    finally {$('mode-online').disabled = $('mode-local').disabled = false;$('session-create').disabled = false; $('session-join').querySelector('button').disabled = false}
  }
  function chooseMode(online) {
    $('mode-online').setAttribute('aria-pressed',String(online));
    $('mode-local').setAttribute('aria-pressed',String(!online));
    $('session-online-panel').hidden=!online;$('session-local-panel').hidden=online;
    $('session-title').textContent=online?'Acompanhe sua equipe':'Seu mapa neste navegador';
  }
  function openOnline() {
    chooseMode(true);
    $('session-message').textContent = configured ? '' : 'O modo online precisa da configuração do Firebase. Consulte ONLINE.md.';
    let saved;try{saved=JSON.parse(localStorage.getItem('daily-online-session'))}catch{}
    $('session-code').value=saved&&/^[A-Z0-9]{4}$/.test(saved.code)?saved.code:'';
    $('session-dialog').showModal();
  };
  $('session-dialog').addEventListener('cancel',event=>event.preventDefault());
  $('mode-online').onclick = () => chooseMode(true);
  $('mode-local').onclick = () => chooseMode(false);
  $('use-local').onclick = () => $('session-dialog').close();
  $('session-create').onclick = () => action(async () => {
    const payload = JSON.stringify({version:2, ...emptyState(), layouts:{}});
    for(let attempt=0; attempt<20; attempt++) {
      const code = newSessionCode();
      try {await client.create(code, payload); attach(code, true, {payload}); toast('Sessão criada. Compartilhe o código com os visitantes.'); return}
      catch(error) {if(!['PERMISSION_DENIED','database/permission-denied','daily/code-in-use'].includes(error.code))throw error; if(attempt===19)throw error}
    }
  });
  function join() {
    action(async () => {
      const code = $('session-code').value.trim().toUpperCase();
      if(!/^[A-Z0-9]{4}$/.test(code))throw Error('Informe os 4 caracteres do código da sessão.');
      const record = await client.get(code);
      if(!record)throw Error('Sessão não encontrada. Confira o código.');
      attach(code, rememberedOwner(code,record), record);
    });
  }
  $('session-join').onsubmit = event => {event.preventDefault();join()};
  $('session-end').onclick = async () => {
    if(!session?.owner || session.closed)return;
    if(!connected){toast('Reconecte para encerrar a sessão.');return}
    const current=generation, code=session.code, button=$('session-end');button.disabled=true;
    try{await client.end(code,snapshot());if(current===generation)markClosed()}
    catch(error){
      console.error('Falha ao encerrar a sessão:',error);
      const denied=/permission[_-]denied/i.test(error.code||error.message||'');
      lastError=denied?'Encerramento negado pelo Firebase':'Falha ao encerrar';status();
      toast(denied
        ? 'Firebase negou o encerramento. Publique as regras atualizadas de database.rules.json em Realtime Database → Regras.'
        : 'Não foi possível encerrar a sessão'+(error.code?' ('+error.code+')':'')+'. Tente novamente.');
    }
    finally{button.disabled=false}
  };
  $('session-leave').onclick = async () => {
    if(!session?.closed&&(pending || writing)){await flush(); if(pending || writing){toast('Aguarde a sincronização antes de sair.');return}}
    detach(); session = null; localStorage.removeItem('daily-online-session');
    state = emptyState(); cardLayouts = Object.create(null);
    try {const saved=JSON.parse(localStorage.getItem('mapa-daily-v1'));if(validState(saved)){state=saved;normalizeTasks(state)}cardLayouts=JSON.parse(localStorage.getItem('mapa-daily-layout')||'{}')}catch{}
    setEditMode(false); render(); applyPermissions();fileMenu(false);openOnline();
  };
  window.addEventListener('beforeunload', event => {if(pending || writing){event.preventDefault();event.returnValue=''}});
  applyPermissions();
  openOnline();
})();
