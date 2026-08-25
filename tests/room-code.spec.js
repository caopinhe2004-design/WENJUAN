const { test, expect } = require('@playwright/test');

async function boot(page){
  await page.goto('/');
  await page.waitForFunction(() => !document.documentElement.classList.contains('app-booting'));
  await expect(page.locator('[data-open]')).toHaveCount(13);
}

test('房间码可以手动加入同一双人房间', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await boot(pageA);
  await pageA.locator('[data-duo-create]').click();
  let modal = pageA.locator('.duo-modal');
  await expect(modal).toBeVisible();
  await modal.locator('input').fill('甲');
  await modal.locator('[data-ok]').click();
  await pageA.waitForFunction(() => typeof duo !== 'undefined' && duo.active && !!document.querySelector('[data-room-code]'));

  const displayCode = (await pageA.locator('[data-room-code]').textContent()).trim();
  expect(displayCode).toMatch(/^[A-HJ-KM-NP-Z2-9]{4}(?:-[A-HJ-KM-NP-Z2-9]{4}){3}$/);
  const compactCode = displayCode.replace(/-/g, '');
  expect(new URL(pageA.url()).hash).toContain('rc=');
  const roomIdA = await pageA.evaluate(() => duo.roomId);

  await boot(pageB);
  await pageB.locator('[data-duo-join-code]').click();
  modal = pageB.locator('.duo-modal');
  await expect(modal).toContainText('输入房间码');
  await modal.locator('[data-room-code-input]').fill(compactCode.toLowerCase());
  await modal.locator('[data-room-code-submit]').click();

  modal = pageB.locator('.duo-modal');
  await expect(modal).toContainText('加入双人房间');
  await modal.locator('input').fill('乙');
  await modal.locator('[data-ok]').click();
  await pageB.waitForFunction(() => typeof duo !== 'undefined' && duo.active);

  const roomIdB = await pageB.evaluate(() => duo.roomId);
  expect(roomIdB).toBe(roomIdA);
  await expect(pageB.locator('[data-room-code]')).toHaveText(displayCode);
  expect(new URL(pageB.url()).hash).toContain(`rc=${compactCode}`);

  await pageB.locator('[data-duo-leave]').click();
  await pageB.waitForFunction(() => !duo.active);
  expect(new URL(pageB.url()).hash).not.toContain('rc=');
  await expect(pageB.locator('[data-duo-join-code]')).toBeVisible();

  await contextA.close();
  await contextB.close();
});

test('房间码输入框会拒绝不完整的号码', async ({ page }) => {
  await boot(page);
  await page.locator('[data-duo-join-code]').click();
  const modal = page.locator('.duo-modal');
  await modal.locator('[data-room-code-input]').fill('ABCD');
  await modal.locator('[data-room-code-submit]').click();
  await expect(modal.locator('[data-room-code-error]')).toContainText('16 位');
  await expect(modal).toBeVisible();
  expect(await page.evaluate(() => duo.active)).toBe(false);
});
