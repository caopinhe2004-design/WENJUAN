// Installability, update checks, and an in-app refresh affordance for “两个人的一页”.
(function(){
  let deferredPrompt=null;
  let refreshing=false;

  function standalone(){
    return !!(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone===true);
  }

  function isIOS(){
    return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
  }

  function isWeChat(){
    return /micromessenger/i.test(navigator.userAgent);
  }

  function cleanRefreshMarker(){
    try{
      const url=new URL(location.href);
      if(!url.searchParams.has('_refresh'))return;
      url.searchParams.delete('_refresh');
      history.replaceState(history.state,'',url.pathname+(url.searchParams.size?`?${url.searchParams}`:'')+url.hash);
    }catch{}
  }

  function removeInstall(){
    document.querySelectorAll('[data-pwa-save]').forEach(el=>el.remove());
  }

  function injectInstall(){
    removeInstall();
    if(standalone() || typeof route==='undefined' || route.view!=='home' || typeof app==='undefined')return;
    const wrap=document.createElement('div');
    wrap.className='pwa-save';
    wrap.dataset.pwaSave='1';
    wrap.innerHTML='<button type="button" class="pwa-save-btn" data-pwa-install>把这一页留在桌面</button>';
    const footer=app.querySelector('.footer-note');
    if(footer)footer.insertAdjacentElement('beforebegin',wrap);
    else app.appendChild(wrap);
    wrap.querySelector('[data-pwa-install]')?.addEventListener('click',installOrGuide);
  }

  function injectRefresh(){
    document.querySelector('[data-pwa-refresh]')?.remove();
    const button=document.createElement('button');
    button.type='button';
    button.className='pwa-refresh-btn';
    button.dataset.pwaRefresh='1';
    button.textContent='刷新';
    button.setAttribute('aria-label','刷新到最新版本');
    button.addEventListener('click',refreshApp);
    document.body.appendChild(button);
  }

  function closeGuide(){
    document.querySelector('.pwa-guide-backdrop')?.remove();
  }

  function guideCopy(){
    if(isWeChat())return '先点右上角菜单，用系统浏览器打开这一页，再选择“添加到主屏幕”或“安装应用”。';
    if(isIOS())return '在 Safari 里点分享按钮，再选择“添加到主屏幕”。以后从桌面点开，就不用再找网址了。';
    return '打开浏览器菜单，选择“安装应用”或“添加到主屏幕”。以后从桌面点开，就能直接回到这里。';
  }

  function showGuide(){
    closeGuide();
    const backdrop=document.createElement('div');
    backdrop.className='pwa-guide-backdrop';
    backdrop.innerHTML=`<section class="pwa-guide" role="dialog" aria-modal="true" aria-labelledby="pwa-guide-title">
      <h2 id="pwa-guide-title">把这一页留在桌面</h2>
      <p>${guideCopy()}</p>
      <div class="pwa-guide-actions"><button type="button" data-pwa-close>知道了</button></div>
    </section>`;
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click',e=>{if(e.target===backdrop || e.target.closest('[data-pwa-close]'))closeGuide()});
    backdrop.querySelector('[data-pwa-close]')?.focus();
  }

  async function installOrGuide(){
    if(!deferredPrompt){showGuide();return}
    const prompt=deferredPrompt;
    deferredPrompt=null;
    try{
      await prompt.prompt();
      const choice=await prompt.userChoice;
      if(choice?.outcome==='accepted')removeInstall();
      else injectInstall();
    }catch{
      injectInstall();
      showGuide();
    }
  }

  async function updateWorker(){
    if(!('serviceWorker' in navigator))return null;
    let registration=await navigator.serviceWorker.getRegistration('./');
    if(!registration){
      registration=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
    }
    try{await registration.update()}catch{}
    if(registration.waiting){
      try{registration.waiting.postMessage('SKIP_WAITING')}catch{}
    }
    return registration;
  }

  async function refreshApp(){
    if(refreshing)return;
    refreshing=true;
    const button=document.querySelector('[data-pwa-refresh]');
    if(button){button.disabled=true;button.textContent='刷新中…'}
    try{
      if(typeof duoRoomStoreSave==='function')duoRoomStoreSave();
      await updateWorker();
      const url=new URL(location.href);
      url.searchParams.set('_refresh',String(Date.now()));
      location.replace(url.toString());
    }catch{
      location.reload();
    }
  }

  function checkForUpdate(){
    if(document.visibilityState!=='visible')return;
    updateWorker().catch(()=>{});
  }

  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();
    deferredPrompt=event;
    injectInstall();
  });
  window.addEventListener('appinstalled',()=>{
    deferredPrompt=null;
    removeInstall();
  });

  if('serviceWorker' in navigator){
    window.addEventListener('load',()=>updateWorker().catch(error=>{
      console.warn('PWA service worker registration failed',error);
    }));
    document.addEventListener('visibilitychange',checkForUpdate);
    window.addEventListener('pageshow',checkForUpdate);
  }

  if(typeof home==='function'){
    const baseHome=home;
    home=function(){
      const out=baseHome();
      queueMicrotask(injectInstall);
      return out;
    };
  }

  cleanRefreshMarker();
  injectRefresh();
  if(typeof route!=='undefined' && route.view==='home')injectInstall();

  window.couplePWA={standalone,showGuide,injectInstall,refresh:refreshApp,checkForUpdate};
})();
