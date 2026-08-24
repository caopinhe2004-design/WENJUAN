const { test, expect } = require('@playwright/test');

test('饮食第七轮是水果，第八轮是特殊口味', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await page.waitForFunction(() => !document.documentElement.classList.contains('app-booting'));

  const rounds = await page.evaluate(() => ({
    fruit: quiz('food').bankQuestions.slice(150,175).map(x => x[0]),
    special: quiz('food').bankQuestions.slice(175,200).map(x => x[0])
  }));

  expect(rounds.fruit).toHaveLength(25);
  expect(rounds.fruit).toContain('山楂');
  for (const removed of ['李子','龙眼','桑葚','百香果','菠萝蜜']) expect(rounds.fruit).not.toContain(removed);

  expect(rounds.special).toEqual(['皮蛋','臭豆腐','香椿','腐乳','鱼腥草／折耳根','猪脑','鸡胗','鸭肠','黄喉','蚕蛹','皮冻','酸笋','泡椒','芥末','花椒麻味','芝麻酱','酒酿','羊杂','茴香','姜味','咖喱','椰子味','奶酪','薄荷味','孜然味']);
  expect(rounds.special).not.toContain('番茄炒蛋');
  expect(rounds.special).not.toContain('红烧肉');

  await page.locator('[data-open="food"]').click();
  const chooser = page.locator('.session-mode-backdrop');
  await expect(chooser).toBeVisible();
  await expect(chooser.locator('[data-part="7"]')).toContainText('水果');
  await expect(chooser.locator('[data-part="8"]')).toContainText('特殊口味');
  await chooser.locator('[data-part="8"]').click();
  await expect(page.locator('.question-card h3')).toHaveText('皮蛋');
  await expect(page.locator('.food-scene')).toContainText('皮蛋');

  await context.close();
});
