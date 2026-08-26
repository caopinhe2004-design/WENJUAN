const { test, expect } = require('@playwright/test');

async function openEither(page) {
  await page.goto('/');
  await page.waitForFunction(() => !document.documentElement.classList.contains('app-preparing'));
  await expect(page.locator('[data-open="either"]')).toBeVisible();
  await page.locator('[data-open="either"]').click();
  await page.locator('.session-mode-backdrop [data-part="1"]').click();
  await expect(page.locator('.question-card')).toBeVisible();
}

test('展开双人答案后实时刷新不会自动收起', async ({ page }) => {
  await openEither(page);

  await page.evaluate(() => {
    const remoteId = 'remote-reveal-test';
    duo.active = true;
    duo.accepted = true;
    duo.nickname = '甲';
    duo.acceptedIds = [duo.clientId, remoteId];
    duo.pendingKey = '';
    state.answers['either:0'] = 0;
    duo.states.set(remoteId, {
      clientId: remoteId,
      nickname: '乙',
      answers: { 'either:0': 1 },
      pendingKey: '',
      nav: { view: 'quiz', quizId: 'either', index: 0, part: 1, clock: 0, clientId: remoteId },
      updatedAt: Date.now()
    });
    duoRefreshUI();
  });

  const revealButton = page.locator('.duo-reveal');
  await expect(revealButton).toHaveText('看看我们选了什么');
  await revealButton.click();
  await expect(page.locator('.duo-reveal-box')).toBeVisible();
  await expect(page.locator('.duo-reveal')).toHaveAttribute('aria-expanded', 'true');

  await page.evaluate(() => duoRefreshUI());
  await expect(page.locator('.duo-reveal-box')).toBeVisible();
  await expect(page.locator('.duo-reveal')).toHaveText('收起我们选的答案');

  await page.evaluate(() => {
    const remoteId = duo.acceptedIds.find(id => id !== duo.clientId);
    const remote = duo.states.get(remoteId);
    duo.states.set(remoteId, { ...remote, updatedAt: Date.now() + 1 });
    duoRefreshUI();
  });
  await expect(page.locator('.duo-reveal-box')).toBeVisible();

  await page.evaluate(() => {
    const remoteId = duo.acceptedIds.find(id => id !== duo.clientId);
    const remote = duo.states.get(remoteId);
    duo.states.set(remoteId, { ...remote, pendingKey: 'either:0', updatedAt: Date.now() + 2 });
    duoRefreshUI();
  });
  await expect(page.locator('.duo-reveal-box')).toHaveCount(0);
  await expect(page.locator('.duo-reveal')).toHaveCount(0);

  await page.evaluate(() => {
    const remoteId = duo.acceptedIds.find(id => id !== duo.clientId);
    const remote = duo.states.get(remoteId);
    duo.states.set(remoteId, { ...remote, pendingKey: '', updatedAt: Date.now() + 3 });
    duoRefreshUI();
  });
  await expect(page.locator('.duo-reveal')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.duo-reveal-box')).toHaveCount(0);
});
