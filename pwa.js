// Installability and update actions used by the Settings panel for “两个人的一页”.
(function(){
  let deferredPrompt=window.__pwaInstallPrompt||null;
  let refreshing=false;

  function standalone(){
    return !!(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone===true);
  }

  function userAgent(){return navigator.userAgent||''}
  function isIPad(){
    return /ipad/i.test(userAgent()) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
  }
  function isIPhone(){return /iphone|ipod/i.test(userAgent())}
  function isIOS(){return isIPad()||isIPhone()}
  function isAndroid(){return /android/i.test(userAgent())}
  function isWeChat(){return /micromessenger/i.test(userAgent())}
  function isQQ(){return /mqqbrowser|qq\//i.test(userAgent())}

  function cleanRefreshMarker(){
    try{
      const url=new URL(location.href);
      if(!url.searchParams.has('_refresh'))return;
      url.searchParams.delete('_refresh');
      const query=url.searchParams.toString();
      history.replaceState(history.state,'',url.pathname+(query?`?${query}`:'')+url.hash);
    }catch{}
  }

  function closeGuide(){document.querySelector('.pwa-guide-backdrop')?.remove()}

  function installInfo(){
    if(standalone())return {
      kicker:'已经安装',
      title:'已经在桌面应用中打开',
      lead:'当前就是安装后的「两个人的一页」，不需要再次添加。',
      steps:[]
    };
    if(isWeChat()||isQQ())return {
      kicker:'先用系统浏览器打开',
      title:'当前浏览器不能直接安装',
      lead:isIOS()?'请先切换到 Safari，再添加到主屏幕。':'请先切换到 Chrome、Edge 或手机系统浏览器，再安装到桌面。',
      steps:[
        '点当前页面右上角的菜单按钮',
        '选择“在浏览器打开”或“用其他应用打开”',
        isIOS()?'进入 Safari 后点分享按钮，再选“添加到主屏幕”':'进入系统浏览器后打开浏览器菜单，选择“安装应用”或“添加到主屏幕”'
      ]
    };
    if(isIPad())return {
      kicker:'iPad 安装方法',
      title:'用 Safari 添加到主屏幕',
      lead:'iPad 的分享按钮通常在 Safari 顶部工具栏，不需要找手机底部按钮。',
      steps:[
        '确认当前页面是在 Safari 中打开',
        '点顶部工具栏的“分享”按钮（方框向上箭头）',
        '选择“添加到主屏幕”，再点“添加”'
      ]
    };
    if(isIPhone())return {
      kicker:'iPhone 安装方法',
      title:'用 Safari 添加到主屏幕',
      lead:'如果当前不是 Safari，请先用 Safari 打开这一页。',
      steps:[
        '点 Safari 底部的“分享”按钮（方框向上箭头）',
        '向下滑，找到“添加到主屏幕”',
        '点右上角“添加”'
      ]
    };
    if(isAndroid())return {
      kicker:'Android 安装方法',
      title:deferredPrompt?'可以直接安装到桌面':'从浏览器菜单安装',
      lead:deferredPrompt?'点下面的“立即安装”即可；也可以使用浏览器菜单。':'不同浏览器名称略有差异，入口通常都在右上角浏览器菜单。',
      steps:[
        '点浏览器右上角的 ⋮ 或菜单按钮',
        '选择“安装应用”或“添加到主屏幕”',
        '按系统提示确认，桌面会出现「两个人的一页」'
      ]
    };
    return {
      kicker:'安装到桌面',
      title:deferredPrompt?'这个浏览器支持直接安装':'从浏览器菜单添加',
      lead:deferredPrompt?'点下面的“立即安装”即可。':'如果浏览器支持 PWA，可以从浏览器菜单添加。',
      steps:['打开浏览器菜单','选择“安装应用”或“添加到主屏幕”','按提示确认']
    };
  }

  function installPanelHTML(){
    const info=installInfo();
    const steps=info.steps.length?`<ol class="pwa-install-steps">${info.steps.map(step=>`<li>${step}</li>`).join('')}</ol>`:'';
    const nativeButton=deferredPrompt&&!standalone()&&!isIOS()&&!isWeChat()&&!isQQ()?'<button type="button" class="pwa-install-native" data-pwa-native>立即安装</button>':'';
    return `<section class="pwa-guide" role="dialog" aria-modal="true" aria-labelledby="pwa-guide-title">
      <div class="pwa-guide-kicker">${info.kicker}</div>
      <h2 id="pwa-guide-title">${info.title}</h2>
      <p class="pwa-guide-lead">${info.lead}</p>
      ${steps}
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
      if(choice?.outcome==='accepted')closeGuide();
      else renderInstallPanel();
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
  });

  window.addEventListener('appinstalled',()=>{
    deferredPrompt=null;
    window.__pwaInstallPrompt=null;
    closeGuide();
  });

  if('serviceWorker' in navigator){
    window.addEventListener('load',()=>updateWorker().catch(error=>console.warn('PWA service worker registration failed',error)));
    document.addEventListener('visibilitychange',checkForUpdate);
    window.addEventListener('pageshow',checkForUpdate);
  }

  cleanRefreshMarker();
  window.couplePWA={standalone,showGuide:showInstallPanel,showInstall:showInstallPanel,refresh:refreshApp,checkForUpdate,isIPad,isIPhone,isAndroid};
})();
