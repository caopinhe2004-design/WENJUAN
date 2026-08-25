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

  // Reload once so this page is controlled by the newly activated worker, then prove the shell opens offline.
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
