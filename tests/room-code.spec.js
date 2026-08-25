const { test, expect } = require('@playwright/test');

async function boot(page){
  await page.goto('/');
  await page.waitForFunction(() => !document.documentElement.classList.contains('app-booting'));
  await expect(page.locator('[data-open]')).toHaveCount(13);
}

test('可以自己起一个短房间码并手动加入同一房间', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const customCode = `cph${Date.now().toString(36).slice(-6)}`;

  await boot(pageA);
  expect(await pageA.evaluate(() => coupleRoomCode.valid('cph'))).toBe(true);
  expect(await pageA.evaluate(() => coupleRoomCode.valid('wyy'))).toBe(true);
  expect(await pageA.evaluate(() => coupleRoomCode.valid('小窝'))).toBe(true);

  await pageA.locator('[data-duo-create-custom]').click();
  let modal = pageA.locator('.duo-modal');
  await expect(modal).toContainText('创建双人房间');
  await modal.locator('input').fill('甲');
  await modal.locator('[data-ok]').click();

  modal = pageA.locator('.duo-modal');
  await expect(modal).toContainText('给房间起个名字');
  await modal.locator('[data-room-code-custom]').fill(customCode);
  await modal.locator('[data-room-code-create]').click();
  await pageA.waitForFunction(() => typeof duo !== 'undefined' && duo.active && !!document.querySelector('[data-room-code]'));

  await expect(pageA.locator('[data-room-code]')).toHaveText(customCode);
  const roomIdA = await pageA.evaluate(() => duo.roomId);
  expect(new URLSearchParams(new URL(pageA.url()).hash.slice(1)).get('rc')).toBe(customCode);

  await boot(pageB);
  await pageB.locator('[data-duo-join-code]').click();
  modal = pageB.locator('.duo-modal');
  await expect(modal).toContainText('输入房间码');
  await modal.locator('[data-room-code-input]').fill(customCode.toUpperCase());
  await modal.locator('[data-room-code-submit]').click();

  modal = pageB.locator('.duo-modal');
  await expect(modal).toContainText('加入双人房间');
  await modal.locator('input').fill('乙');
  await modal.locator('[data-ok]').click();
  await pageB.waitForFunction(() => typeof duo !== 'undefined' && duo.active);

  const roomIdB = await pageB.evaluate(() => duo.roomId);
  expect(roomIdB).toBe(roomIdA);
  await expect(pageB.locator('[data-room-code]')).toHaveText(customCode);

  await pageB.locator('[data-duo-leave]').click();
  await pageB.waitForFunction(() => !duo.active);
  expect(new URL(pageB.url()).hash).not.toContain('rc=');
  await expect(pageB.locator('[data-duo-join-code]')).toBeVisible();

  await contextA.close();
  await contextB.close();
});

test('普通创建房间只生成一个简短房间码', async ({ page }) => {
  await boot(page);
  const generated = await page.evaluate(() => Array.from({length:512}, () => coupleRoomCode.generate()));
  expect(generated.every(code => /^[a-z2-9]{6}$/.test(code))).toBe(true);

  await page.locator('[data-duo-create]').click();
  const modal = page.locator('.duo-modal');
  await modal.locator('input').fill('甲');
  await modal.locator('[data-ok]').click();
  await page.waitForFunction(() => typeof duo !== 'undefined' && duo.active && !!document.querySelector('[data-room-code]'));
  const code = (await page.locator('[data-room-code]').textContent()).trim();
  expect(code).toMatch(/^[a-z2-9]{6}$/);
  await page.locator('[data-duo-leave]').click();
});

test('房间码不再限制 16 位，但会拒绝不支持的符号', async ({ page }) => {
  await boot(page);
  expect(await page.evaluate(() => coupleRoomCode.valid('c'))).toBe(true);
  expect(await page.evaluate(() => coupleRoomCode.valid('wyy2026'))).toBe(true);
  expect(await page.evaluate(() => coupleRoomCode.valid('我们的房间'))).toBe(true);

  await page.locator('[data-duo-join-code]').click();
  const modal = page.locator('.duo-modal');
  await modal.locator('[data-room-code-input]').fill('🙂');
  await modal.locator('[data-room-code-submit]').click();
  await expect(modal.locator('[data-room-code-error]')).toContainText('1–24 位');
  await expect(modal).toBeVisible();
  expect(await page.evaluate(() => duo.active)).toBe(false);
});
