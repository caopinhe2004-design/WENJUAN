const { test, expect } = require('@playwright/test');

async function boot(page){
  await page.goto('/');
  await expect(page.locator('[data-open]')).toHaveCount(13);
}

async function openSettings(page){
  await expect(page.locator('[data-settings-open]')).toBeVisible();
  await page.locator('[data-settings-open]').click();
  await expect(page.locator('.settings-panel')).toBeVisible();
}

test('PWA 图标、直接首页、设置入口和离线启动可用', async ({ page, context }) => {
  await boot(page);

  const manifest = await page.evaluate(async () => {
    const response = await fetch(document.querySelector('link[rel="manifest"]').href);
    if(!response.ok) throw new Error(`manifest ${response.status}`);
    return response.json();
  });
  expect(manifest.name).toBe('两个人的一页');
  expect(manifest.icons.map(x => x.sizes)).toEqual(expect.arrayContaining(['192x192','512x512']));
  expect(manifest.icons.map(x => x.src)).toEqual(expect.arrayContaining(['icons/icon-192-v3.png','icons/icon-512-v3.png']));

  const loadImageSize = async src => page.evaluate(url => new Promise((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>resolve([image.naturalWidth,image.naturalHeight]);
    image.onerror=()=>reject(new Error(`image decode failed: ${url}`));
    image.src=url;
  }),src);

  expect(await loadImageSize('icons/icon-192-v3.png')).toEqual([192,192]);
  expect(await loadImageSize('icons/icon-512-v3.png')).toEqual([512,512]);
  expect(await loadImageSize('icons/apple-touch-icon.png')).toEqual([180,180]);
  await expect(page.locator('link[rel="apple-touch-icon"][href="icons/apple-touch-icon.png"]')).toHaveCount(1);
  await expect(page.locator('#app-splash')).toHaveCount(0);

  const indexSource = await page.evaluate(async()=>{
    const r=await fetch('index.html',{cache:'no-store'});
    return r.text();
  });
  expect(indexSource).not.toContain('app-splash');
  expect(indexSource).not.toContain('launch-v2.webp');
  expect(indexSource).not.toContain('app-booting');

  await expect(page.locator('[data-settings-open]')).toBeVisible();
  await expect(page.locator('.history-corner-btn')).toBeHidden();
  await expect(page.locator('[data-pwa-refresh]')).toBeHidden();
  await expect(page.locator('[data-pwa-install]')).toBeHidden();

  await openSettings(page);
  await expect(page.locator('[data-settings-history]')).toContainText('历史记录');
  await expect(page.locator('[data-settings-install]')).toContainText(/安装到桌面|已安装到桌面/);
  await expect(page.locator('[data-settings-refresh]')).toContainText('刷新到最新版本');
  await page.locator('[data-settings-close]').click();

  const sw=await page.evaluate(async()=>{const r=await navigator.serviceWorker.ready;return {active:!!r.active}});
  expect(sw.active).toBe(true);
  await page.reload();
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page).toHaveTitle('两个人的一页');
  await expect(page.locator('[data-open]')).toHaveCount(13);
  await expect(page.locator('[data-settings-open]')).toBeVisible();
  await expect(page.locator('#app-splash')).toHaveCount(0);
  await context.setOffline(false);
});

test('历史记录从设置进入，首页不再单独占位置', async ({ page }) => {
  await boot(page);
  await expect(page.locator('.history-corner-btn')).toBeHidden();
  await openSettings(page);
  await page.locator('[data-settings-history]').click();
  await expect(page.locator('.history-word-page')).toBeVisible();
  await expect(page.getByRole('heading',{name:'历史记录'})).toBeVisible();
  await expect(page.locator('[data-settings-open]')).toHaveCount(0);
});

test('安卓安装从设置里打开，并承接原生安装事件', async ({ browser }) => {
  const context=await browser.newContext({
    viewport:{width:390,height:844},isMobile:true,
    userAgent:'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36'
  });
  const page=await context.newPage();await boot(page);

  await openSettings(page);
  await page.locator('[data-settings-install]').click();
  await expect(page.locator('.pwa-guide')).toContainText('浏览器菜单');
  await expect(page.locator('.pwa-guide')).toContainText('安装应用');
  await page.locator('[data-pwa-close]').click();

  await page.evaluate(()=>{
    const event=new Event('beforeinstallprompt',{cancelable:true});
    event.prompt=async()=>{};
    event.userChoice=Promise.resolve({outcome:'dismissed',platform:'web'});
    window.dispatchEvent(event);
  });
  await openSettings(page);
  await page.locator('[data-settings-install]').click();
  await expect(page.locator('[data-pwa-native]')).toHaveText('立即安装');
  await context.close();
});

test('iPhone 安装说明明确提示 Safari 底部分享按钮', async ({ browser }) => {
  const context=await browser.newContext({
    viewport:{width:390,height:844},isMobile:true,
    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'
  });
  const page=await context.newPage();await boot(page);
  await openSettings(page);
  await page.locator('[data-settings-install]').click();
  await expect(page.locator('.pwa-guide')).toContainText('Safari');
  await expect(page.locator('.pwa-guide')).toContainText('底部');
  await expect(page.locator('.pwa-guide')).toContainText('添加到主屏幕');
  await expect(page.locator('.pwa-guide')).toContainText('右上角“添加”');
  await context.close();
});

test('iPadOS 桌面模式安装说明指向 Safari 顶部工具栏', async ({ browser }) => {
  const context=await browser.newContext({
    viewport:{width:1024,height:768},
    userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15'
  });
  await context.addInitScript(()=>{
    Object.defineProperty(navigator,'platform',{get:()=> 'MacIntel'});
    Object.defineProperty(navigator,'maxTouchPoints',{get:()=>5});
  });
  const page=await context.newPage();await boot(page);
  await openSettings(page);
  await page.locator('[data-settings-install]').click();
  await expect(page.locator('.pwa-guide')).toContainText('iPad');
  await expect(page.locator('.pwa-guide')).toContainText('顶部工具栏');
  await expect(page.locator('.pwa-guide')).toContainText('添加到主屏幕');
  await context.close();
});

test('微信内置浏览器提示先切换系统浏览器', async ({ browser }) => {
  const context=await browser.newContext({
    viewport:{width:390,height:844},isMobile:true,
    userAgent:'Mozilla/5.0 (Linux; Android 15; Mobile) AppleWebKit/537.36 Chrome/151.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.60'
  });
  const page=await context.newPage();await boot(page);
  await openSettings(page);
  await page.locator('[data-settings-install]').click();
  await expect(page.locator('.pwa-guide')).toContainText('当前浏览器不能直接安装');
  await expect(page.locator('.pwa-guide')).toContainText('在浏览器打开');
  await context.close();
});
