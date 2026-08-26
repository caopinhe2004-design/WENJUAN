const { test, expect } = require('@playwright/test');

async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => !document.documentElement.classList.contains('app-preparing'));
}

async function openFirst(page, quizId) {
  await page.evaluate(id => window.coupleQuiz.openSynced(id, 1, 0), quizId);
  await expect(page.locator('.question-card')).toBeVisible();
}

test('所有选择题选项都不显示 A B C D 前缀', async ({ page }) => {
  await boot(page);
  const ids = await page.evaluate(() => QUIZZES.filter(q => q.type === 'choice').map(q => q.id));
  for (const id of ids) {
    await openFirst(page, id);
    await expect(page.locator('.question-card .letter')).toHaveCount(0);
    const optionTexts = await page.locator('[data-opt]').allTextContents();
    for (const text of optionTexts) expect(text.trim()).not.toMatch(/^[A-D](?:\s*[·.、:：-]\s+|\s+)/);
  }
});

test('自己写一个的确定保存，取消丢弃草稿并退出编辑框', async ({ page }) => {
  await boot(page);
  await openFirst(page, 'either');

  await page.getByRole('button', { name: /自己写一个/ }).click();
  const input = page.locator('.choice-custom-editor input');
  await input.fill('临时文字');
  await page.locator('[data-custom-cancel]').click();

  await expect(page.locator('.choice-custom-editor')).toHaveCount(0);
  await expect(page.locator('.choice-custom-saved')).toHaveCount(0);
  expect(await page.evaluate(() => state.answers?.['either:0'])).toBeUndefined();

  await page.getByRole('button', { name: /自己写一个/ }).click();
  await expect(page.locator('.choice-custom-editor input')).toHaveValue('');
  await page.locator('.choice-custom-editor input').fill('保留答案');
  await page.locator('[data-custom-confirm]').click();

  await expect(page.locator('.choice-custom-editor')).toHaveCount(0);
  const saved = page.locator('.choice-custom-saved');
  await expect(saved).toBeVisible();
  await expect(saved).toContainText('保留答案');
  await expect(saved).toContainText('已保存');
  expect(await page.evaluate(() => state.answers?.['either:0']?.text)).toBe('保留答案');

  await saved.click();
  await page.locator('.choice-custom-editor input').fill('不会保存');
  await page.locator('[data-custom-cancel]').click();
  await expect(page.locator('.choice-custom-saved')).toContainText('保留答案');
  await expect(page.locator('.choice-custom-saved')).not.toContainText('不会保存');
  expect(await page.evaluate(() => state.answers?.['either:0']?.text)).toBe('保留答案');
});

test('排行榜确认使用深色主按钮，保存后调整会恢复待确认', async ({ page }) => {
  await boot(page);
  await openFirst(page, 'rank');

  const confirm = page.locator('.rank-confirm');
  await expect(confirm).toHaveText('确定排序');
  await expect(confirm).toBeEnabled();
  expect(await confirm.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(63, 53, 49)');

  await confirm.click();
  await expect(page.locator('.rank-confirm')).toHaveText(/已保存/);
  await expect(page.locator('.rank-confirm')).toBeDisabled();
  expect(Array.isArray(await page.evaluate(() => state.answers?.['rank:0']))).toBe(true);

  await page.locator('[data-down="0"]').click();
  await expect(page.locator('.rank-confirm')).toHaveText('确定排序');
  await expect(page.locator('.rank-confirm')).toBeEnabled();
  expect(await page.evaluate(() => window.coupleQuiz.pendingKey())).toBe('rank:0');
});

test('双方翻牌对所有固定选择只显示答案文字，不添加字母', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    window.coupleQuiz.openSynced('either', 1, 0);
    const selfId = duo.clientId;
    const partnerId = 'answer-prefix-partner';
    duo.active = true;
    duo.accepted = true;
    duo.nickname = '甲';
    duo.acceptedIds = [selfId, partnerId];
    duo.claims.set(selfId, { clientId: selfId, nickname: '甲', active: true, joinedAt: 1, claimedAt: Date.now() });
    duo.claims.set(partnerId, { clientId: partnerId, nickname: '乙', active: true, joinedAt: 2, claimedAt: Date.now() });
    state.answers['either:0'] = 0;
    duo.states.set(partnerId, { clientId: partnerId, nickname: '乙', answers: { 'either:0': 1 }, pendingKey: '', updatedAt: Date.now() });
    window.coupleQuiz.renderQuestion();
  });

  await page.locator('.duo-reveal').click();
  const answers = page.locator('.duo-reveal-box b');
  await expect(answers).toHaveCount(2);
  const expected = await page.evaluate(() => quiz('either').questions[0][1].slice(0, 2));
  await expect(answers.nth(0)).toHaveText(expected[0]);
  await expect(answers.nth(1)).toHaveText(expected[1]);
});

test('五个 canonical JS 各自单次注册样式，页面不再加载独立 CSS', async ({ page }) => {
  await boot(page);
  for (const id of ['app', 'duo', 'quiz-flow', 'history', 'shell']) {
    await expect(page.locator(`style[data-owned-style="${id}"]`)).toHaveCount(1);
  }
  await expect(page.locator('link[rel="stylesheet"]')).toHaveCount(0);
  await expect(page.locator('.question-card .letter')).toHaveCount(0);
});
