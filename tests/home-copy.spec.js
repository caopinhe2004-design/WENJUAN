const { test, expect } = require('@playwright/test');

test('首页保持留白和文学化文案，不显示数量标签', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !document.documentElement.classList.contains('app-booting'));
  await expect(page.locator('[data-open]')).toHaveCount(13);

  await expect(page.locator('.hero .eyebrow')).toHaveText('夜深以后，话可以慢一点');
  await expect(page.locator('.hero h1')).toHaveText('今晚，聊点什么？');
  await expect(page.locator('.hero p')).toContainText('白天被忙碌掠过的小事');

  await expect(page.locator('.mini-row')).toHaveCount(0);
  await expect(page.locator('.card-meta')).toHaveCount(0);
  await expect(page.locator('.hero')).not.toContainText(/\d+\s*套|\d+\s*题|\d+\s*轮/);

  await expect(page.locator('.play-picker-copy')).toContainText('若一时不知道从哪儿说起');
  await expect(page.locator('[data-pick="easy"]')).toHaveText('轻轻聊聊');
  await expect(page.locator('[data-pick="talk"]')).toHaveText('说点心里话');
  await expect(page.locator('[data-pick="wild"]')).toHaveText('去远一点想');
  await expect(page.locator('[data-pick="all"]')).toHaveText('交给今晚');

  await expect(page.locator('[data-open="either"] p')).toContainText('悄悄照见两个人的日常');
  await expect(page.locator('[data-open="food"] p')).toContainText('从一桌家常饭开始');
  await expect(page.locator('.progress-note').first()).toHaveText('还没翻开');
});
