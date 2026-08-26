const { test, expect } = require('@playwright/test');

async function boot(page){
  await page.goto('/');
  await expect(page.locator('[data-open]')).toHaveCount(13);
}

test('首页用修改昵称替代自定义房间码', async ({ page }) => {
  await boot(page);
  await expect(page.locator('[data-duo-create-custom]')).toHaveCount(0);
  const nickname = page.locator('[data-duo-nickname]');
  await expect(nickname).toHaveText('修改昵称');
  await nickname.click();
  const modal = page.locator('.duo-modal');
  await expect(modal).toContainText('修改昵称');
  await modal.locator('input').fill('新的昵称');
  await modal.locator('[data-ok]').click();
  expect(await page.evaluate(() => localStorage.getItem('coupleSleepQuiz.duo.nickname'))).toBe('新的昵称');
});

test('输入房间码只加入已存在房间，不存在的房间不会被创建', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await boot(pageA);
  await pageA.locator('[data-duo-create]').click();
  let modal = pageA.locator('.duo-modal');
  await modal.locator('input').fill('甲');
  await modal.locator('[data-ok]').click();
  await pageA.waitForFunction(() => typeof duo !== 'undefined' && duo.active && duo.connected && !!duo.roomCode, null, { timeout: 25000 });
  const code = await pageA.evaluate(() => duo.roomCode);
  const roomIdA = await pageA.evaluate(() => duo.roomId);

  await boot(pageB);
  await pageB.locator('[data-duo-join-code]').click();
  modal = pageB.locator('.duo-modal');
  await expect(modal).toContainText('不会创建新房间');
  await modal.locator('[data-room-code-input]').fill(code.toUpperCase());
  await modal.locator('[data-room-code-submit]').click();
  await expect(pageB.locator('.duo-modal')).toContainText('加入双人房间', { timeout: 12000 });
  await pageB.locator('.duo-modal input').fill('乙');
  await pageB.locator('.duo-modal [data-ok]').click();
  await pageB.waitForFunction(() => typeof duo !== 'undefined' && duo.active && duo.connected, null, { timeout: 25000 });
  expect(await pageB.evaluate(() => duo.roomId)).toBe(roomIdA);

  await pageB.locator('[data-duo-leave]').click();
  await pageB.waitForFunction(() => !duo.active);
  const missing = `missing${Date.now().toString(36).slice(-6)}`;
  await pageB.locator('[data-duo-join-code]').click();
  modal = pageB.locator('.duo-modal');
  await modal.locator('[data-room-code-input]').fill(missing);
  await modal.locator('[data-room-code-submit]').click();
  await expect(modal.locator('[data-room-code-error]')).toContainText('没有找到这个房间', { timeout: 12000 });
  expect(await pageB.evaluate(() => duo.active)).toBe(false);
  await expect(modal).toBeVisible();

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

test('房间码支持短码，并拒绝不支持的符号', async ({ page }) => {
  await boot(page);
  expect(await page.evaluate(() => coupleRoomCode.valid('a'))).toBe(true);
  expect(await page.evaluate(() => coupleRoomCode.valid('room2026'))).toBe(true);
  expect(await page.evaluate(() => coupleRoomCode.valid('我们的房间'))).toBe(true);

  await page.locator('[data-duo-join-code]').click();
  const modal = page.locator('.duo-modal');
  await modal.locator('[data-room-code-input]').fill('🙂');
  await modal.locator('[data-room-code-submit]').click();
  await expect(modal.locator('[data-room-code-error]')).toContainText('1–24 位');
  await expect(modal).toBeVisible();
  expect(await page.evaluate(() => duo.active)).toBe(false);
});

test('房间码界面不包含个人示例', async ({ page }) => {
  await boot(page);
  await page.locator('[data-duo-join-code]').click();
  await expect(page.locator('.room-code-modal')).not.toContainText(/cph|wyy/i);
});
