const { test, expect } = require('@playwright/test');

const SUPABASE = 'https://szbwcbhujnawcahsgitk.supabase.co/rest/v1/answer_history';
const VAULT = {
  vaultHash: 'a'.repeat(64),
  authToken: 'test-history-auth-token',
  encKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
};

function seedHistory({ withVault = true, autoUpload = false } = {}) {
  return () => {
    const entry = {
      id: 'test-local-history',
      quizId: 'either',
      quizTitle: '生活里的小选择',
      quizIcon: '♡',
      quizType: 'choice',
      seq: 1,
      sessionPart: 1,
      sessionStart: 1,
      sessionEnd: 1,
      startedAt: Date.now() - 60000,
      completedAt: Date.now() - 30000,
      participants: [{ id: 'a', name: '甲' }, { id: 'b', name: '乙' }],
      questions: [{ question: '测试题', values: ['A', 'B'], same: false }],
      summary: { big: '0 / 1', label: '题选到了一起', chips: [], note: '' }
    };
    localStorage.setItem('coupleSleepQuiz.roundHistory.v1', JSON.stringify([entry]));
    localStorage.setItem('coupleSleepQuiz.cloudHistoryAutoUpload.v1', String(autoUpload));
    if (withVault) {
      const vault = {
        vaultHash: 'a'.repeat(64),
        authToken: 'test-history-auth-token',
        encKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
      };
      localStorage.setItem('coupleSleepQuiz.cloudHistoryVaults.v1', JSON.stringify([vault]));
      localStorage.setItem('coupleSleepQuiz.cloudHistoryPreferredVault.v1', vault.vaultHash);
    }
  };
}

async function mockCloud(page, posts) {
  await page.route(`${SUPABASE}**`, async route => {
    const request = route.request();
    if (request.method() === 'POST') {
      posts.push(JSON.parse(request.postData() || '{}'));
      await route.fulfill({ status: 201, body: '' });
      return;
    }
    if (request.method() === 'DELETE') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

async function openHistory(page) {
  await page.goto('/');
  await expect(page.locator('[data-settings-open]')).toBeVisible();
  await page.locator('[data-settings-open]').click();
  await page.locator('[data-settings-history]').click();
}

test('立即上传会真正 POST 并把本地记录标记为已上传云端', async ({ page }) => {
  const posts = [];
  await page.addInitScript(seedHistory({ withVault: true, autoUpload: false }));
  await mockCloud(page, posts);
  await openHistory(page);

  await expect(page.locator('.cloud-sync-bar')).toContainText('云端 0/1 条已保存');
  await expect(page.locator('.cloud-sync-bar')).toContainText('1 条仅本机');
  await expect(page.locator('.history-round-card .cloud-status')).toHaveText('仅本机');

  await page.locator('.cloud-sync-bar .cloud-sync-button').click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0].entry_id).toBe('test-local-history');
  expect(posts[0].vault_hash).toBe(VAULT.vaultHash);
  expect(typeof posts[0].payload).toBe('string');
  expect(posts[0].payload.length).toBeGreaterThan(20);

  await expect(page.locator('.cloud-sync-bar')).toContainText('云端 1/1 条已保存');
  await expect(page.locator('.history-round-card .cloud-status')).toHaveText('已上传云端');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('coupleSleepQuiz.roundHistory.v1'))[0]);
  expect(stored.cloudVaultHash).toBe(VAULT.vaultHash);
  expect(stored.cloudSyncedAt).toBeGreaterThan(0);
});

test('自动上传开关可见、持久化，并在开启后上传待上传记录', async ({ page }) => {
  const posts = [];
  await page.addInitScript(seedHistory({ withVault: true, autoUpload: false }));
  await mockCloud(page, posts);
  await page.goto('/');

  await page.locator('[data-settings-open]').click();
  const toggle = page.locator('[data-settings-auto]');
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle.locator('.settings-toggle-state')).toHaveText('已关闭');
  await toggle.click();

  await expect(page.locator('[data-settings-auto]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-settings-auto] .settings-toggle-state')).toHaveText('已开启');
  await expect.poll(() => posts.length).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem('coupleSleepQuiz.cloudHistoryAutoUpload.v1'))).toBe('true');
});

test('没有可用加密房间时立即上传不会伪装成上传成功', async ({ page }) => {
  const posts = [];
  await page.addInitScript(seedHistory({ withVault: false, autoUpload: false }));
  await mockCloud(page, posts);
  await openHistory(page);

  await page.locator('.cloud-sync-bar .cloud-sync-button').click();
  await page.waitForTimeout(150);
  expect(posts).toHaveLength(0);
  await expect(page.locator('.cloud-sync-bar')).toContainText('1 条仅本机');
  await expect(page.locator('.history-round-card .cloud-status')).toHaveText('仅本机');
});