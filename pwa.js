// PWA install guide and update actions
(function(){
  let deferredPrompt=window.__pwaInstallPrompt||null;
  let refreshing=false;

  const standalone=()=>!!(window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true);
  const ua=navigator.userAgent||'';
  const isIOS=()=>/iphone|ipad|ipod/i.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const isIPad=()=>/ipad/i.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const isAndroid=()=>/android/i.test(ua);
  const isWeChat=()=>/micromessenger/i.test(ua);

  function closeGuide(){document.querySelector('.pwa-guide-backdrop')?.remove()}

  function installInfo(){
    if(isWeChat()) return {lead:'微信内无法安装，请先打开浏览器。',steps:['点击右上角菜单','选择“在浏览器打开”','再使用浏览器菜单安装']};
    if(isIPad()) return {lead:'iPad 请使用 Safari 添加到主屏幕。',steps:['打开 Safari 浏览此页面','点击顶部工具栏的分享按钮','选择“添加到主屏幕”并点击“添加”']};
    if(isIOS()) return {lead:'iPhone 请使用 Safari 添加到主屏幕。',steps:['打开 Safari 浏览此页面','点击底部分享按钮（方框向上箭头）','选择“添加到主屏幕”并点击“添加”']};
    if(isAndroid()) return {lead:deferredPrompt?'当前浏览器支持直接安装。':'请从浏览器菜单安装。',steps:['点击右上角“⋮”菜单','选择“安装应用”或“添加到主屏幕”','确认后桌面会出现“两个人的一页”']};
    return {lead:'可通过浏览器菜单添加到桌面。',steps:['打开浏览器菜单','选择安装应用或添加到主屏幕','确认完成']};
  }

  function html(){
    const info=installInfo();
    return `<section class="pwa-guide" role="dialog"><div class="pwa-guide-kicker">安装到桌面</div><h2>把这一页留在手机上</h2><p>${info.lead}</p><ol>${info.steps.map(x=>`<li>${x}</li>`).join('')}</ol><div>${deferredPrompt?'<button data-pwa-native>立即安装</button>':''}<button data-pwa-close>知道了</button></div></section>`;
  }

  function showInstall(){
    closeGuide();
    const box=document.createElement('div');
    box.className='pwa-guide-backdrop';
    box.innerHTML=html();
    document.body.appendChild(box);
    box.querySelector('[data-pwa-close]')?.addEventListener('click',closeGuide);
    box.querySelector('[data-pwa-native]')?.addEventListener('click',install);
  }

  async function install(){
    if(!deferredPrompt)return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(()=>{});
    deferredPrompt=null;
  }

  async function updateWorker(){
    if(!('serviceWorker' in navigator))return;
    const reg=await navigator.serviceWorker.getRegistration('./')||await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
    try{await reg.update()}catch(e){}
    if(reg.waiting)reg.waiting.postMessage('SKIP_WAITING');
  }

  async function refresh(){
    if(refreshing)return;
    refreshing=true;
    try{await updateWorker();location.reload(true)}catch{location.reload()}
  }

  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;window.__pwaInstallPrompt=e});
  window.addEventListener('appinstalled',()=>{deferredPrompt=null;closeGuide()});
  window.couplePWA={standalone,showGuide:showInstall,showInstall,refresh,checkForUpdate:updateWorker};
  window.addEventListener('load',()=>updateWorker().catch(()=>{}));
})();
