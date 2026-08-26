// Canonical application shell. Modify this file directly; do not add UI patch files.

/* ==========================================================================
   Home presentation
   Consolidated from js/features/home-atmosphere.js
   ========================================================================== */
// A quieter, more literary home page. Keep counts, mechanics and time-of-day limits out of the first impression.
(function(){
  const HOME_DESCRIPTIONS={
    either:'一些很小的选择，也会悄悄照见两个人的日常。',
    guess:'试着站到 TA 的那一边，猜一猜那些熟悉又未必知道的答案。',
    lights:'借几盏红黄绿灯，慢慢说清彼此在意的地方。',
    whatif:'把现实暂时放在门外，去几个不可能发生的世界里走一圈。',
    rank:'把喜欢的事排一排，也许会看见彼此心里真正靠前的位置。',
    memory:'同一段故事会有两种记法，翻翻那些只有你们知道的旧页。',
    who:'一些小习惯、小毛病、小可爱，看看在彼此眼里都落在谁身上。',
    cohabit:'把未来的日常提前摊开一点，看看一盏灯、一顿饭、一张床会是什么样。',
    pref:'喜欢什么、避开什么，把那些细小的偏好慢慢说给对方听。',
    sweet:'有些事只是轻轻一下，却会让人心里亮很久。',
    odd:'认真生活已经够久了，偶尔也允许彼此胡思乱想。',
    talk:'不急着得出结论，只把心里的话多留一会儿。',
    food:'从一桌家常饭开始，看看以后哪些味道会常常一起出现。'
  };

  function naturalProgress(q,note){
    if(!note||!q)return;
    const n=typeof answeredCount==='function'?answeredCount(q):0;
    if(!n)note.textContent='还没翻开';
    else if(n>=q.questions.length)note.textContent='这一轮写完了';
    else note.textContent='上次停在这里';
  }

  function refineRoomCopy(){
    const box=app.querySelector('.duo-panel');if(!box)return;
    const title=box.querySelector('h3'),desc=box.querySelector('p');
    if(!duo.active){
      if(title)title.textContent='把这一页递给 TA';
      if(desc)desc.textContent='开一个只属于你们的房间，把链接发过去。等对方进来，就从同一道题开始。';
      const create=box.querySelector('[data-duo-create]');if(create)create.textContent='邀请 TA 一起来';
      return;
    }
    const partner=typeof polishPartner==='function'?polishPartner():'TA';
    if(duoPartnerOnline()){
      if(title)title.textContent=`${partner} 已经在这里了`;
      if(desc)desc.textContent='挑一页吧。不用赶时间，一起慢慢答。';
    }else{
      if(title)title.textContent='这一页还为 TA 留着';
      if(desc)desc.textContent=`等 ${partner} 回来，再把没说完的话接下去。`;
    }
  }

  function refineHome(){
    if(route.view!=='home')return;
    const hero=app.querySelector('.hero');
    if(hero){
      const eyebrow=hero.querySelector('.eyebrow'),h1=hero.querySelector('h1'),p=hero.querySelector('p');
      if(eyebrow)eyebrow.textContent='有些话，慢一点说也很好';
      if(h1)h1.textContent='这一刻，聊点什么？';
      if(p)p.textContent='日子总有匆匆经过的时候。随手翻一页，把那些没来得及说的小事，慢慢说给彼此听。';
      hero.querySelector('.mini-row')?.remove();
    }

    app.querySelectorAll('.card-meta').forEach(x=>x.remove());
    app.querySelectorAll('.quiz-card-wrap').forEach(wrap=>{
      const btn=wrap.querySelector('[data-open]'),q=btn&&quiz(btn.dataset.open);if(!q)return;
      const desc=btn.querySelector('p');if(desc&&HOME_DESCRIPTIONS[q.id])desc.textContent=HOME_DESCRIPTIONS[q.id];
      naturalProgress(q,btn.querySelector('.progress-note'));
    });

    const picker=app.querySelector('.play-picker');
    if(picker){
      const small=picker.querySelector('.play-picker-copy span'),big=picker.querySelector('.play-picker-copy b');
      if(small)small.textContent='若一时不知道从哪儿说起';
      if(big)big.textContent='就凭此刻的心情，选一个开头';
      const buttons=picker.querySelectorAll('[data-pick]');
      const labels={easy:'轻轻聊聊',talk:'说点心里话',wild:'去远一点想',all:'随手翻一页'};
      buttons.forEach(b=>{if(labels[b.dataset.pick])b.textContent=labels[b.dataset.pick]});
    }

    const footer=app.querySelector('.footer-note');
    if(footer)footer.textContent='愿这些零碎的话，慢慢变成你们共同记得的日子。';
    refineRoomCopy();
  }

  const baseHome=home;
  home=function(){const out=baseHome();refineHome();return out};

  const baseRefresh=duoRefreshUI;
  duoRefreshUI=function(){const out=baseRefresh();if(route.view==='home')refineHome();return out};

  if(route.view==='home')refineHome();
})();

/* ==========================================================================
   PWA install/update
   Consolidated from js/core/pwa.js
   ========================================================================== */
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

/* ==========================================================================
   Settings
   Consolidated from js/core/settings.js
   ========================================================================== */
// Low-frequency controls live here so the home page stays focused on the conversation.
(function(){
  function standalone(){
    return !!window.couplePWA?.standalone?.();
  }

  function historyCount(){
    try{return typeof roundsHistoryLoad==='function'?roundsHistoryLoad().length:0}catch{return 0}
  }

  function closeSettings(){
    document.querySelector('.settings-backdrop')?.remove();
  }

  function openSettings(){
    closeSettings();
    const count=historyCount();
    const installed=standalone();
    const backdrop=document.createElement('div');
    backdrop.className='settings-backdrop';
    backdrop.innerHTML=`<section class="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header class="settings-head">
        <div><small>两个人的一页</small><h2 id="settings-title">设置</h2></div>
        <button type="button" class="settings-close" data-settings-close aria-label="关闭设置">×</button>
      </header>
      <div class="settings-list">
        <button type="button" class="settings-row" data-settings-history>
          <span class="settings-row-icon">⌛</span>
          <span><b>历史记录</b><small>${count?`已经留下 ${count} 轮记录`:'做完一轮后，会在这里留下答案'}</small></span>
          <i>›</i>
        </button>
        <button type="button" class="settings-row" data-settings-install>
          <span class="settings-row-icon">⌂</span>
          <span><b>${installed?'已安装到桌面':'安装到桌面'}</b><small>${installed?'现在正从桌面应用中打开':'以后不用再找网址'}</small></span>
          <i>›</i>
        </button>
        <button type="button" class="settings-row" data-settings-refresh>
          <span class="settings-row-icon">↻</span>
          <span><b>刷新到最新版本</b><small>更新题目、界面或房间功能时使用</small></span>
          <i>›</i>
        </button>
      </div>
      <p class="settings-note">这里只放不常用的功能，首页尽量留给两个人正在聊的内容。</p>
    </section>`;
    document.body.appendChild(backdrop);

    backdrop.querySelector('[data-settings-close]').onclick=closeSettings;
    backdrop.addEventListener('click',event=>{if(event.target===backdrop)closeSettings()});
    backdrop.querySelector('[data-settings-history]').onclick=()=>{
      closeSettings();
      if(typeof roundsHistoryList==='function')roundsHistoryList();
    };
    backdrop.querySelector('[data-settings-install]').onclick=()=>{
      if(installed){if(typeof showToast==='function')showToast('已经从桌面打开了');return}
      closeSettings();
      window.couplePWA?.showInstall?.();
    };
    backdrop.querySelector('[data-settings-refresh]').onclick=()=>{
      const row=backdrop.querySelector('[data-settings-refresh] b');
      if(row)row.textContent='正在刷新…';
      window.couplePWA?.refresh?.();
    };
    backdrop.querySelector('[data-settings-close]')?.focus();
  }

  function injectSettings(){
    app?.querySelector?.('[data-settings-open]')?.remove();
    if(typeof route==='undefined'||route.view!=='home'||typeof app==='undefined')return;
    const button=document.createElement('button');
    button.type='button';
    button.className='settings-corner-btn';
    button.dataset.settingsOpen='1';
    button.textContent='设置';
    button.setAttribute('aria-label','打开设置');
    button.onclick=openSettings;
    app.appendChild(button);
  }

  if(typeof home==='function'){
    const baseHome=home;
    home=function(){
      const out=baseHome();
      queueMicrotask(injectSettings);
      return out;
    };
  }

  if(typeof route!=='undefined'&&route.view==='home')injectSettings();

  window.coupleSettings={open:openSettings,close:closeSettings,inject:injectSettings};
})();
