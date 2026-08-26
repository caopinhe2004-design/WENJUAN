const { test, expect } = require('@playwright/test');

test('首页使用无时段限制的文学化文案，不显示数量标签', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !document.documentElement.classList.contains('app-booting'));
  await expect(page.locator('[data-open]')).toHaveCount(13);

  await expect(page).toHaveTitle('两个人的一页');
  await expect(page.locator('.hero .eyebrow')).toHaveText('有些话，慢一点说也很好');
  await expect(page.locator('.hero h1')).toHaveText('这一刻，聊点什么？');
  await expect(page.locator('.hero p')).toContainText('日子总有匆匆经过的时候');

  await expect(page.locator('.mini-row')).toHaveCount(0);
  await expect(page.locator('.card-meta')).toHaveCount(0);
  await expect(page.locator('.hero')).not.toContainText(/\d+\s*套|\d+\s*题|\d+\s*轮/);

  await expect(page.locator('.play-picker-copy')).toContainText('若一时不知道从哪儿说起');
  await expect(page.locator('.play-picker-copy')).toContainText('就凭此刻的心情，选一个开头');
  await expect(page.locator('[data-pick="easy"]')).toHaveText('轻轻聊聊');
  await expect(page.locator('[data-pick="talk"]')).toHaveText('说点心里话');
  await expect(page.locator('[data-pick="wild"]')).toHaveText('去远一点想');
  await expect(page.locator('[data-pick="all"]')).toHaveText('随手翻一页');

  await expect(page.locator('[data-open="either"] p')).toContainText('悄悄照见两个人的日常');
  await expect(page.locator('[data-open="food"] p')).toContainText('从一桌家常饭开始');
  await expect(page.locator('[data-open="talk"] h3')).toHaveText('慢慢真心话');
  await expect(page.locator('.progress-note').first()).toHaveText('还没翻开');
  await expect(page.locator('body')).not.toContainText(/今晚|睡前|夜深|夜里|夜晚/);

  const settings = page.locator('[data-settings-open]');
  await expect(settings).toBeVisible();
  const settingsBox = await settings.evaluate(el => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const expectedRightGap = Math.max(14, (window.innerWidth - 1040) / 2 + 14);
    return {
      position: style.position,
      top: rect.top,
      rightGap: window.innerWidth - rect.right,
      expectedRightGap
    };
  });
  expect(settingsBox.position).toBe('fixed');
  expect(settingsBox.top).toBeLessThan(60);
  expect(Math.abs(settingsBox.rightGap - settingsBox.expectedRightGap)).toBeLessThanOrEqual(3);

  await settings.click();
  await expect(page.locator('.settings-panel')).toBeVisible();
  await expect(page.locator('.settings-list > button')).toHaveCount(3);
  await page.locator('[data-settings-close]').click();

  await page.locator('[data-open="either"]').click();
  const chooser = page.locator('.session-mode-backdrop');
  await expect(chooser).toBeVisible();
  await expect(chooser.locator('h2')).toHaveText('选这一轮');
  await expect(chooser).not.toContainText(/今晚|睡前|夜深|夜里|夜晚/);
});
