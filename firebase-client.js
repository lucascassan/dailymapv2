'use strict';
window.createDailyFirebaseClient = async function(config) {
  window.DailyAppCheck.siteKey();
  const base = 'https://www.gstatic.com/firebasejs/12.19.0/';
  const [appSDK, authSDK, dbSDK, checkSDK] = await Promise.all([
    import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-database.js'),import(base + 'firebase-app-check.js')
  ]);
  const app = appSDK.getApps().length ? appSDK.getApp() : appSDK.initializeApp(config);
  await window.DailyAppCheck.ensure(app,checkSDK);
  const auth = authSDK.getAuth(app);
  await authSDK.setPersistence(auth, authSDK.browserLocalPersistence);
  await auth.authStateReady();
  if (!auth.currentUser) await authSDK.signInAnonymously(auth);
  const db = dbSDK.getDatabase(app), uid = auth.currentUser.uid;
  return {
    uid,
    async create(code, payload) {
      const sessionRef=dbSDK.ref(db, 'sessions/' + code);
      if((await dbSDK.get(sessionRef)).exists()) {
        const error=Error('Código de sessão já utilizado.');error.code='daily/code-in-use';throw error;
      }
      await dbSDK.set(sessionRef, {
        owner: uid, createdAt: dbSDK.serverTimestamp(), updatedAt: dbSDK.serverTimestamp(), payload
      });
    },
    async get(code) { return (await dbSDK.get(dbSDK.ref(db, 'sessions/' + code))).val(); },
    watch(code, change, error) { return dbSDK.onValue(dbSDK.ref(db, 'sessions/' + code), snapshot => change(snapshot.val()), error); },
    connected(change) { return dbSDK.onValue(dbSDK.ref(db, '.info/connected'), snapshot => change(snapshot.val() === true)); },
    async write(code, payload) {
      await dbSDK.update(dbSDK.ref(db, 'sessions/' + code), {payload, updatedAt: dbSDK.serverTimestamp()});
    },
    async end(code, payload) {
      await dbSDK.update(dbSDK.ref(db, 'sessions/' + code), {payload, closedAt: dbSDK.serverTimestamp(), updatedAt: dbSDK.serverTimestamp()});
    }
  };
};
