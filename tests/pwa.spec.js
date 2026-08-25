const { test, expect } = require('@playwright/test');

test('PWA 清单、图标、安装入口和离线启动可用', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForFunction(() => !document.documentElement.classList.contains('app-booting'));

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toContain('manifest.webmanifest');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  expect(await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')).toMatch(/^data:image\/png;base64,/);

  const manifest = await page.evaluate(async () => {
    const href = document.querySelector('link[rel="manifest"]').href;
    return fetch(href).then(r => r.json());
  });
  expect(manifest.name).toBe('两个人的一页');
  expect(manifest.short_name).toBe('两个人的一页');
  expect(manifest.start_url).toBe('./');
  expect(manifest.scope).toBe('./');
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.map(x => x.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));

  const dimensions = await page.evaluate(async icons => {
    const out = [];
    for (const icon of icons) {
      const blob = await fetch(icon.src).then(r => r.blob());
      const bitmap = await createImageBitmap(blob);
      out.push([bitmap.width, bitmap.height]);
      bitmap.close();
    }
    return out;
  }, manifest.icons);
  expect(dimensions).toEqual(expect.arrayContaining([[192, 192], [512, 512]]));

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
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.documentElement.classList.contains('app-booting'));
  await expect(page).toHaveTitle('两个人的一页');
  await expect(page.locator('[data-open]')).toHaveCount(13);
  await context.setOffline(false);
});
