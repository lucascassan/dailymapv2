'use strict';
window.createDailyFirebaseClient = async function(config, visitorName) {
  window.DailyAppCheck.siteKey();
  // Opt-in por navegador, somente em desenvolvimento local e antes de importar o SDK.
  if(['localhost','127.0.0.1','[::1]'].includes(window.location.hostname)) {
    // Arquivo opcional e ignorado pelo Git. Nunca é carregado no domínio publicado.
    try {await import(new URL('app-check.local.js',document.baseURI).href)}catch{}
    const localToken=window.DAILY_LOCAL_APP_CHECK_DEBUG_TOKEN;
    if(typeof localToken==='string'&&localToken.trim())self.FIREBASE_APPCHECK_DEBUG_TOKEN=localToken.trim();
    else {try {if(localStorage.getItem('daily-app-check-debug')==='true')self.FIREBASE_APPCHECK_DEBUG_TOKEN=true}catch{}}
  }
  const base = 'https://www.gstatic.com/firebasejs/12.19.0/';
  const [appSDK, authSDK, dbSDK, checkSDK] = await Promise.all([
    import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-database.js'),import(base + 'firebase-app-check.js')
  ]);
  let appName='[DEFAULT]';
  if(visitorName){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(visitorName.trim().normalize('NFC')));appName='daily-visitor-'+Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')}
  const app=appSDK.getApps().find(app=>app.name===appName)||appSDK.initializeApp(config,appName);
  await window.DailyAppCheck.ensure(app,checkSDK);
  const auth = authSDK.getAuth(app);
  await authSDK.setPersistence(auth, authSDK.browserLocalPersistence);
  await auth.authStateReady();
  if (!auth.currentUser) await authSDK.signInAnonymously(auth);
  const db = dbSDK.getDatabase(app), uid = auth.currentUser.uid;
  return {
    uid,
    async create(code, payload,meetUrl) {
      const sessionRef=dbSDK.ref(db, 'sessions/' + code);
      if((await dbSDK.get(sessionRef)).exists()) {
        const error=Error('Código de sessão já utilizado.');error.code='daily/code-in-use';throw error;
      }
      await dbSDK.set(sessionRef, {
        owner: uid, createdAt: dbSDK.serverTimestamp(), updatedAt: dbSDK.serverTimestamp(), payload
      });
      try{await dbSDK.set(dbSDK.ref(db,'meetingLinks/'+code),meetUrl)}catch(cause){const error=Error('A sessão foi criada, mas o Meet não pôde ser salvo. Publique as regras atualizadas do Firebase.');error.code='daily/meet-save-failed';error.cause=cause;throw error}
    },
    async get(code) { return (await dbSDK.get(dbSDK.ref(db, 'sessions/' + code))).val(); },
    watch(code, change, error) { return dbSDK.onValue(dbSDK.ref(db, 'sessions/' + code), snapshot => change(snapshot.val()), error); },
    async getParticipant(code){return(await dbSDK.get(dbSDK.ref(db,'dailyParticipants/'+code+'/'+uid))).val()},
    watchParticipants(code,owner,change,error){return dbSDK.onValue(dbSDK.ref(db,'dailyParticipants/'+code+(owner?'':'/'+uid)),snapshot=>change(snapshot.val()),error)},
    async writeParticipant(code,profile){await dbSDK.set(dbSDK.ref(db,'dailyParticipants/'+code+'/'+uid),{...profile,updatedAt:dbSDK.serverTimestamp()})},
    async getMeet(code){return(await dbSDK.get(dbSDK.ref(db,'meetingLinks/'+code))).val()},
    connected(change) { return dbSDK.onValue(dbSDK.ref(db, '.info/connected'), snapshot => change(snapshot.val() === true)); },
    async write(code, payload) {
      await dbSDK.update(dbSDK.ref(db, 'sessions/' + code), {payload, updatedAt: dbSDK.serverTimestamp()});
    },
    async end(code, payload) {
      await dbSDK.update(dbSDK.ref(db, 'sessions/' + code), {payload, closedAt: dbSDK.serverTimestamp(), updatedAt: dbSDK.serverTimestamp()});
    }
  };
};
