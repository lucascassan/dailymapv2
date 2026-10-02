'use strict';
(() => {
  const instances = new WeakMap();
  function siteKey() {
    const key=window.DAILY_APP_CHECK_CONFIG?.siteKey;
    if(typeof key!=='string'||!key.trim()) {
      const error=Error('Configure a chave pública do App Check em firebase-config.js para usar o modo Online.');
      error.code='daily/app-check-config';throw error;
    }
    return key.trim();
  }
  async function ensure(app, sdk) {
    const key=siteKey();
    try {
      let check=instances.get(app);
      if(!check) {
        check=sdk.initializeAppCheck(app,{
          provider:new sdk.ReCaptchaEnterpriseProvider(key),
          isTokenAutoRefreshEnabled:true
        });
        instances.set(app,check);
      }
      // Confirm verification before authentication or access to shared sessions.
      const result=await sdk.getToken(check,false);
      if(!result?.token)throw Error('Token de verificação indisponível.');
    } catch(cause) {
      const error=Error('Não foi possível verificar o acesso online. Abra o site no domínio publicado e confira a configuração do App Check.');
      error.code='daily/app-check-failed';error.cause=cause;throw error;
    }
  }
  window.DailyAppCheck={siteKey,ensure};
})();
