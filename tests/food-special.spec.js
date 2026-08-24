const { test, expect } = require('@playwright/test');

test('饮食第八轮使用水果和特殊口味，并移除低区分度家常菜', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await page.waitForFunction(() => !document.documentElement.classList.contains('app-booting'));

  const tail = await page.evaluate(() => quiz('food').bankQuestions.slice(180).map(x => x[0]));
  expect(tail).toEqual(['皮蛋','臭豆腐','香椿','腐乳','鱼腥草／折耳根','猪脑','鸡胗','鸭肠','黄喉','蚕蛹','皮冻','酸笋','泡椒','芥末','花椒麻味','芝麻酱','酒酿','羊杂','茴香','姜味']);
  expect(tail).not.toContain('番茄炒蛋');
  expect(tail).not.toContain('红烧肉');
  expect(tail).not.toContain('麻辣香锅');

  await page.locator('[data-open="food"]').click();
  const chooser = page.locator('.session-mode-backdrop');
  await expect(chooser).toBeVisible();
  await expect(chooser.locator('[data-part="8"]')).toContainText('水果和特殊口味');
  await chooser.locator('[data-part="8"]').click();
  await expect(page.locator('.question-card h3')).toHaveText('皮蛋');
  await expect(page.locator('.food-scene')).toContainText('皮蛋');

  await context.close();
});
