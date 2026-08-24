const { test, expect } = require('@playwright/test');

test('自由回答后使用新的生活选择标题', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !document.documentElement.classList.contains('app-booting'));

  const card = page.locator('[data-open="either"]');
  await expect(card.locator('h3')).toHaveText('生活里的小选择');
  await expect(page.getByText('默契二选一', { exact: true })).toHaveCount(0);

  await card.click();
  const chooser = page.locator('.session-mode-backdrop');
  await expect(chooser).toBeVisible();
  await expect(chooser).toContainText('生活里的小选择');
  await chooser.locator('[data-part="1"]').click();

  await expect(page.locator('.title-wrap h2')).toHaveText('生活里的小选择');
  await expect(page.getByRole('button', { name: /自己写一个/ })).toBeVisible();
});
