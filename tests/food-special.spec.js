const { test, expect } = require('@playwright/test');

test('饮食第七轮是常见水果，第八轮是常见特殊口味', async ({ browser }) => {
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

  expect(rounds.special).toEqual(['皮蛋','臭豆腐','香椿','腐乳','酸笋','泡椒','芥末','花椒','芝麻酱','酒酿','茴香','生姜','咖喱','辣条','奶酪','辣椒油','豆豉','陈醋','豆瓣酱','花生酱','香油','黑巧克力','咖啡','抹茶甜品','话梅']);
  for (const misplaced of ['猪脑','鸡胗','鸭肠','黄喉','羊杂','蚕蛹','皮冻','肥肉','鸡皮','臭鳜鱼']) expect(rounds.special).not.toContain(misplaced);

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
