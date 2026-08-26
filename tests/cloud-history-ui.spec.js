const { test, expect } = require('@playwright/test');

test('history list and detail always show cloud status and manual upload control', async ({ page }) => {
  await page.addInitScript(() => {
    const entry = {
      id: 'test-local-history',
      quizId: 'either',
      quizTitle: '二选一',
      quizIcon: '♡',
      quizType: 'choice',
      seq: 1,
      startedAt: Date.now() - 60000,
      completedAt: Date.now() - 30000,
      participants: [{ id: 'a', name: '甲' }, { id: 'b', name: '乙' }],
      questions: [{ question: '测试题', values: ['A', 'B'], same: false }],
      summary: { big: '0 / 1', label: '题选到了一起', chips: [], note: '' }
    };
    localStorage.setItem('coupleSleepQuiz.roundHistory.v1', JSON.stringify([entry]));
  });

  await page.goto('/');
  await expect(page.locator('.history-corner-btn')).toBeVisible();
  await page.locator('.history-corner-btn').click();

  await expect(page.locator('.cloud-sync-bar')).toContainText('云端 0/1 条已保存');
  await expect(page.locator('.cloud-sync-bar')).toContainText('1 条仅本机');
  await expect(page.locator('.history-round-card .cloud-status')).toHaveText('仅本机');
  await expect(page.locator('.cloud-sync-bar .cloud-sync-button')).toHaveText('立即上传');

  await page.locator('[data-view-round]').click();
  await expect(page.locator('.history-cloud-actions .cloud-status')).toHaveText('仅本机');
  await expect(page.locator('.history-cloud-actions .cloud-sync-button')).toHaveText('关联并上传');
});
