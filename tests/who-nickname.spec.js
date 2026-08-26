const { test, expect } = require('@playwright/test');

test('谁更像使用双方昵称而不是 A B 方', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !document.documentElement.classList.contains('app-preparing'));

  await page.evaluate(() => {
    const selfId = duo.clientId;
    const partnerId = 'who-partner-test';
    duo.active = true;
    duo.accepted = true;
    duo.nickname = '小明';
    duo.acceptedIds = [selfId, partnerId];
    duo.claims.set(selfId, { clientId: selfId, nickname: '小明', active: true, joinedAt: 1, claimedAt: Date.now() });
    duo.claims.set(partnerId, { clientId: partnerId, nickname: '小红', active: true, joinedAt: 2, claimedAt: Date.now() });
    duo.states.set(partnerId, { clientId: partnerId, nickname: '小红', answers: {}, pendingKey: '', updatedAt: Date.now() });
    window.coupleQuiz.openSynced('who', 1, 0);
  });

  await expect(page.locator('[data-opt="0"]')).toHaveText('小明');
  await expect(page.locator('[data-opt="1"]')).toHaveText('小红');
  await expect(page.locator('[data-opt="2"]')).toHaveText('差不多');
  await expect(page.locator('.question-card .letter')).toHaveCount(0);
  await expect(page.locator('.question-card')).not.toContainText('A 方');
  await expect(page.locator('.question-card')).not.toContainText('B 方');

  await page.evaluate(() => {
    const partnerId = 'who-partner-test';
    state.answers['who:0'] = 0;
    duo.states.set(partnerId, {
      ...duo.states.get(partnerId),
      answers: { 'who:0': 1 },
      pendingKey: '',
      updatedAt: Date.now()
    });
    window.coupleQuiz.renderQuestion();
  });

  await page.locator('.duo-reveal').click();
  const reveal = page.locator('.duo-reveal-box');
  await expect(reveal).toContainText('小明');
  await expect(reveal).toContainText('小红');
  await expect(reveal).not.toContainText('A 方');
  await expect(reveal).not.toContainText('B 方');
  await expect(reveal).not.toContainText('A ·');
  await expect(reveal).not.toContainText('B ·');

  await page.evaluate(() => window.coupleQuiz.quizResult(quiz('who'), { archive: false, notify: false }));
  await expect(page.locator('.summary-item').first().locator('span')).toHaveText('小明');
});
