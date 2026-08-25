// PWA install guide
(function(){
  let deferredPrompt=window.__pwaInstallPrompt||null;
  const standalone=()=>!!(window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true);
  const ua=()=>navigator.userAgent||'';
  const ipad=()=>/ipad/i.test(ua())||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const ios=()=>/iphone|ipod/i.test(ua());
  const android=()=>/android/i.test(ua());
  const wechat=()=>/micromessenger/i.test(ua());
  const close=()=>document.querySelector('.pwa-guide-backdrop')?.remove();
  function info(){
    if(wechat())return ['当前微信内无法安装','1. 点击右上角菜单','2. 选择“在浏览器打开”','3. 在浏览器中添加到主屏幕'];
    if(ipad())return ['iPad 使用 Safari 添加','1. 用 Safari 打开此页面','2. 点击顶部分享按钮（方框向上箭头）','3. 选择“添加到主屏幕”'];
    if(ios())return ['iPhone 使用 Safari 添加','1. 点击底部分享按钮','2. 向下滑找到“添加到主屏幕”','3. 点击“添加”完成'];
    if(android())return ['Android 添加方式','1. 点击右上角 ⋮ 菜单','2. 选择“安装应用”或“添加到主屏幕”','3. 确认安装'];
    return ['添加到桌面','1. 打开浏览器菜单','2. 选择安装应用或添加到主屏幕','3. 确认完成'];
  }
  function showInstall(){
    close();
    const d=document.createElement('div');d.className='pwa-guide-backdrop';
    const a=info();
    d.innerHTML=`<section class="pwa-guide"><div class="pwa-guide-kicker">安装到桌面</div><h2>${a[0]}</h2><ol><li>${a[1].replace(/^\d\. /,'')}</li><li>${a[2].replace(/^\d\. /,'')}</li><li>${a[3].replace(/^\d\. /,'')}</li></ol><div>${deferredPrompt?'<button data-install>立即安装</button>':''}<button data-close>知道了</button></div></section>`;
    document.body.appendChild(d);
    d.querySelector('[data-close]')?.addEventListener('click',close);
    d.querySelector('[data-install]')?.addEventListener('click',async()=>{try{await deferredPrompt.prompt();await deferredPrompt.userChoice}catch{} deferredPrompt=null});
  }
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;window.__pwaInstallPrompt=e});
  window.addEventListener('appinstalled',()=>{deferredPrompt=null;close()});
  window.couplePWA={standalone,showGuide:showInstall,showInstall};
})();