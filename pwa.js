// Installability, update checks, and an in-app refresh affordance for “两个人的一页”.
(function(){
  let deferredPrompt=window.__pwaInstallPrompt||null;
  let refreshing=false;

  function standalone(){
    return !!(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone===true);
  }

  function isIOS(){
    return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
  }

  function isAndroid(){return /android/i.test(navigator.userAgent)}
  function isWeChat(){return /micromessenger/i.test(navigator.userAgent)}

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
    wrap.querySelector('[data-pwa-install]')?.addEventListener('click',showInstallPanel);
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

  function closeGuide(){document.querySelector('.pwa-guide-backdrop')?.remove()}

  function installInfo(){
    if(isWeChat())return {
      lead:'微信里不能直接安装。',
      steps:['点右上角菜单','选择“在浏览器打开”','再在系统浏览器菜单里选择“添加到主屏幕”或“安装应用”']
    };
    if(isIOS())return {
      lead:'iPhone / iPad 需要从 Safari 添加。',
      steps:['用 Safari 打开这一页','点底部或顶部的“分享”按钮','选择“添加到主屏幕”，再点“添加”']
    };
    if(isAndroid())return {
      lead:deferredPrompt?'这个浏览器支持直接安装。':'如果没有系统安装弹窗，可以从浏览器菜单添加。',
      steps:['点浏览器右上角菜单','选择“安装应用”或“添加到主屏幕”','确认后桌面会出现「两个人的一页」']
    };
    return {
      lead:deferredPrompt?'这个浏览器支持直接安装。':'也可以从浏览器菜单把这一页添加到桌面。',
      steps:['打开浏览器菜单','选择“安装应用”或“添加到主屏幕”','按提示确认']
    };
  }

  function installPanelHTML(){
    const info=installInfo();
    const nativeButton=deferredPrompt?'<button type="button" class="pwa-install-native" data-pwa-native>立即安装</button>':'';
    return `<section class="pwa-guide" role="dialog" aria-modal="true" aria-labelledby="pwa-guide-title">
      <div class="pwa-guide-kicker">添加到手机桌面</div>
      <h2 id="pwa-guide-title">把这一页留在桌面</h2>
      <p class="pwa-guide-lead">${info.lead}</p>
      <ol class="pwa-install-steps">${info.steps.map(step=>`<li>${step}</li>`).join('')}</ol>
      <div class="pwa-guide-actions">${nativeButton}<button type="button" class="pwa-guide-close" data-pwa-close>知道了</button></div>
    </section>`;
  }

  function renderInstallPanel(){
    const backdrop=document.querySelector('.pwa-guide-backdrop');
    if(!backdrop)return;
    backdrop.innerHTML=installPanelHTML();
    backdrop.querySelector('[data-pwa-native]')?.addEventListener('click',runNativeInstall);
    backdrop.querySelector('[data-pwa-close]')?.addEventListener('click',closeGuide);
  }

  function showInstallPanel(){
    closeGuide();
    const backdrop=document.createElement('div');
    backdrop.className='pwa-guide-backdrop';
    backdrop.innerHTML=installPanelHTML();
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click',event=>{if(event.target===backdrop)closeGuide()});
    backdrop.querySelector('[data-pwa-native]')?.addEventListener('click',runNativeInstall);
    backdrop.querySelector('[data-pwa-close]')?.addEventListener('click',closeGuide);
    (backdrop.querySelector('[data-pwa-native]')||backdrop.querySelector('[data-pwa-close]'))?.focus();
  }

  async function runNativeInstall(){
    const prompt=deferredPrompt;
    if(!prompt){renderInstallPanel();return}
    const button=document.querySelector('[data-pwa-native]');
    if(button){button.disabled=true;button.textContent='正在打开安装…'}
    try{
      await prompt.prompt();
      const choice=await prompt.userChoice;
      deferredPrompt=null;
      window.__pwaInstallPrompt=null;
      if(choice?.outcome==='accepted'){
        closeGuide();
        removeInstall();
      }else{
        renderInstallPanel();
      }
    }catch{
      deferredPrompt=null;
      window.__pwaInstallPrompt=null;
      renderInstallPanel();
    }
  }

  async function updateWorker(){
    if(!('serviceWorker' in navigator))return null;
    let registration=await navigator.serviceWorker.getRegistration('./');
    if(!registration){registration=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'})}
    try{await registration.update()}catch{}
    if(registration.waiting){try{registration.waiting.postMessage('SKIP_WAITING')}catch{}}
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
    }catch{location.reload()}
  }

  function checkForUpdate(){
    if(document.visibilityState!=='visible')return;
    updateWorker().catch(()=>{});
  }

  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();
    deferredPrompt=event;
    window.__pwaInstallPrompt=event;
    if(document.querySelector('.pwa-guide-backdrop'))renderInstallPanel();
    injectInstall();
  });

  window.addEventListener('appinstalled',()=>{
    deferredPrompt=null;
    window.__pwaInstallPrompt=null;
    closeGuide();
    removeInstall();
  });

  if('serviceWorker' in navigator){
    window.addEventListener('load',()=>updateWorker().catch(error=>console.warn('PWA service worker registration failed',error)));
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

  window.couplePWA={standalone,showGuide:showInstallPanel,showInstall:showInstallPanel,injectInstall,refresh:refreshApp,checkForUpdate};
})();
