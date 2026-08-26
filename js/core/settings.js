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
