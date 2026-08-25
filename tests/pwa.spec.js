const { test, expect } = require('@playwright/test');

test('PWA 清单、图标、刷新入口和离线启动可用', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForFunction(() => !document.documentElement.classList.contains('app-booting'));

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toContain('manifest.webmanifest');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  expect(await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')).toBe('icons/apple-touch-icon.png');

  const manifest = await page.evaluate(async () => {
    const href = document.querySelector('link[rel="manifest"]').href;
    const response = await fetch(href);
    if (!response.ok) throw new Error(`manifest ${response.status}`);
    return response.json();
  });
  expect(manifest.name).toBe('两个人的一页');
  expect(manifest.short_name).toBe('两个人的一页');
  expect(manifest.start_url).toBe('./');
  expect(manifest.scope).toBe('./');
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.map(x => x.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));

  const loadImageSize = async src => page.evaluate(url => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve([image.naturalWidth, image.naturalHeight]);
    image.onerror = () => reject(new Error(`image decode failed: ${url}`));
    image.src = url;
  }), src);

  const dimensions = [];
  for (const icon of manifest.icons) dimensions.push(await loadImageSize(icon.src));
  expect(dimensions).toEqual(expect.arrayContaining([[192, 192], [512, 512]]));

  const appleHref = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect(await loadImageSize(appleHref)).toEqual([180, 180]);

  await expect(page.locator('[data-pwa-refresh]')).toHaveText('刷新');
  await expect(page.locator('[data-pwa-refresh]')).toBeVisible();
  expect(await page.evaluate(() => typeof window.couplePWA?.refresh)).toBe('function');
  expect(await page.evaluate(() => Object.prototype.hasOwnProperty.call(window, '__pwaInstallPrompt'))).toBe(true);

  await expect(page.locator('[data-pwa-install]')).toHaveText('把这一页留在桌面');
  await page.locator('[data-pwa-install]').click();
  await expect(page.locator('.pwa-guide')).toBeVisible();
  await expect(page.locator('.pwa-guide')).toContainText('添加到主屏幕');
  await page.locator('[data-pwa-close]').click();

  const sw = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return { scope: registration.scope, active: !!registration.active };
  });
  expect(sw.active).toBe(true);

  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await expect(page.locator('[data-pwa-refresh]')).toBeVisible();
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.documentElement.classList.contains('app-booting'));
  await expect(page).toHaveTitle('两个人的一页');
  await expect(page.locator('[data-open]')).toHaveCount(13);
  await expect(page.locator('[data-pwa-refresh]')).toBeVisible();
  await context.setOffline(false);
});

test('安卓手机点安装一定先得到可见反馈，并能承接原生安装事件', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36'
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.waitForFunction(() => !document.documentElement.classList.contains('app-booting'));

  await page.locator('[data-pwa-install]').click();
  await expect(page.locator('.pwa-guide')).toBeVisible();
  await expect(page.locator('.pwa-guide')).toContainText('浏览器菜单');
  await page.locator('[data-pwa-close]').click();

  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    event.prompt = async () => {};
    event.userChoice = Promise.resolve({ outcome: 'dismissed', platform: 'web' });
    window.dispatchEvent(event);
  });

  await page.locator('[data-pwa-install]').click();
  await expect(page.locator('[data-pwa-native]')).toHaveText('立即安装');
  await page.locator('[data-pwa-native]').click();
  await expect(page.locator('.pwa-guide')).toBeVisible();
  await expect(page.locator('.pwa-guide')).toContainText('浏览器菜单');

  await context.close();
});

test('iPhone 安装面板明确提示 Safari 分享菜单', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.waitForFunction(() => !document.documentElement.classList.contains('app-booting'));
  await page.locator('[data-pwa-install]').click();
  await expect(page.locator('.pwa-guide')).toBeVisible();
  await expect(page.locator('.pwa-guide')).toContainText('Safari');
  await expect(page.locator('.pwa-guide')).toContainText('分享');
  await expect(page.locator('.pwa-guide')).toContainText('添加到主屏幕');
  await context.close();
});
