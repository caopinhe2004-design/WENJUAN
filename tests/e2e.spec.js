const { test, expect } = require('@playwright/test');

async function waitForBoot(page) {
  await page.waitForFunction(() => !document.documentElement.classList.contains('app-preparing'));
}

async function waitForHome(page) {
  await waitForBoot(page);
  await expect(page.locator('[data-open]')).toHaveCount(13);
}

async function openFresh(page) {
  await page.goto('/');
  await waitForHome(page);
}

async function startPart(page, quizId, part = 1) {
  await page.locator(`[data-open="${quizId}"]`).click();
  const chooser = page.locator('.session-mode-backdrop');
  await expect(chooser).toBeVisible();
  await chooser.locator(`[data-part="${part}"]`).click();
  await expect(page.locator('.question-card')).toBeVisible();
}

async function createRoom(page, nickname) {
  await page.locator('[data-duo-create]').click();
  const modal = page.locator('.duo-modal');
  await expect(modal).toBeVisible();
  await modal.locator('input').fill(nickname);
  await modal.locator('[data-ok]').click();
  await page.waitForFunction(() => typeof duo !== 'undefined' && duo.active && location.hash.includes('duo='));
  return page.url();
}

async function joinRoom(page, inviteUrl, nickname) {
  await page.goto(inviteUrl);
  await waitForBoot(page);
  const modal = page.locator('.duo-modal');
  if (await modal.isVisible().catch(() => false)) {
    await modal.locator('input').fill(nickname);
    await modal.locator('[data-ok]').click();
  }
  await page.waitForFunction(() => typeof duo !== 'undefined' && duo.active);
}

test('13 套入口、饮食场景、自由选项和重新选轮次', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await openFresh(page);

  await startPart(page, 'food', 1);
  await expect(page.locator('.question-card h3')).toHaveText('猪肉');
  await expect(page.locator('.food-scene')).toContainText('晚饭');
  await expect(page.locator('.question-card .letter')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /自己写一个/ })).toBeVisible();

  await page.getByRole('button', { name: /自己写一个/ }).click();
  const custom = page.locator('.choice-custom-editor input');
  await custom.fill('红烧的更喜欢');
  await expect(custom).toHaveValue('红烧的更喜欢');
  await page.locator('[data-custom-confirm]').click();

  await page.locator('[data-home]').click();
  await page.locator('[data-open="food"]').click();
  await expect(page.locator('.session-resume-backdrop')).toBeVisible();
  await page.locator('.session-resume-backdrop [data-resume]').click();
  await page.waitForFunction(() => route.view === 'quiz' && route.quizId === 'food' && route.index === 1);
  await expect.poll(() => page.evaluate(() => state.answers?.['food:0']?.text || '')).toBe('红烧的更喜欢');
  await page.locator('[data-prev]').click();
  await expect(page.locator('.question-card h3')).toHaveText('猪肉');
  await expect(page.locator('.choice-custom-editor input')).toHaveValue('红烧的更喜欢');

  await page.locator('[data-home]').click();
  await page.locator('[data-open="food"]').click();
  await page.locator('.session-resume-backdrop [data-reselect]').click();
  const chooser = page.locator('.session-mode-backdrop');
  await expect(chooser.locator('[data-part="8"]')).toBeVisible();
  await chooser.locator('[data-part="4"]').click();
  await expect(page.locator('.question-card h3')).toHaveText('大白菜');

  await context.close();
});

test('手机和 iPad 视口可以完成饮食题', async ({ browser }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 820, height: 1180 }]) {
    const context = await browser.newContext({ viewport, isMobile: viewport.width < 500 });
    const page = await context.newPage();
    await openFresh(page);
    await startPart(page, 'food', 1);
    await expect(page.locator('.food-scene')).toBeVisible();
    await expect(page.getByRole('button', { name: /自己写一个/ })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(2);
    await context.close();
  }
});

test('双客户端只同步已确认答案、离线后回来继续同步', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  let pageB = await contextB.newPage();

  await openFresh(pageA);
  const inviteUrl = await createRoom(pageA, '甲');
  await joinRoom(pageB, inviteUrl, '乙');

  await pageA.waitForFunction(() => duo.accepted && duoPartnerOnline(), null, { timeout: 25000 });
  await pageB.waitForFunction(() => duo.accepted && duoPartnerOnline(), null, { timeout: 25000 });

  await pageA.locator('[data-open="either"]').click();
  await pageA.locator('.session-mode-backdrop [data-part="1"]').click();
  await pageB.waitForFunction(() => route.view === 'quiz' && route.quizId === 'either', null, { timeout: 15000 });
  await pageA.waitForFunction(() => route.view === 'quiz' && route.quizId === 'either' && route.index === 0, null, { timeout: 15000 });

  const firstFixed = (await pageA.locator('[data-opt="0"]').textContent()).trim();
  await pageA.locator('[data-opt="0"]').click();
  await pageB.getByRole('button', { name: /自己写一个/ }).click();
  await pageB.locator('.choice-custom-editor input').fill('我有自己的答案');

  await pageA.waitForFunction(() => duoRemoteState()?.pendingKey === 'either:0', null, { timeout: 15000 });
  expect(await pageA.evaluate(() => duoRemoteState()?.answers?.['either:0'])).toBeUndefined();
  await expect(pageA.locator('.duo-reveal')).toHaveCount(0);

  await pageB.locator('[data-custom-confirm]').click();
  await pageA.waitForFunction(() => {
    const r = duoRemoteState();
    return r?.answers?.['either:0']?.kind === 'custom' && r.answers['either:0'].text.includes('自己的答案') && !r.pendingKey;
  }, null, { timeout: 15000 });

  await expect(pageA.locator('.duo-reveal')).toBeVisible();
  await pageA.locator('.duo-reveal').click();
  const reveal = pageA.locator('.duo-reveal-box');
  await expect(reveal).toContainText(firstFixed);
  await expect(reveal).toContainText('我有自己的答案');
  await expect(reveal.locator('.duo-same,.duo-different,.playful-feedback,.playful-followup')).toHaveCount(0);

  await pageB.close();
  await pageA.waitForFunction(() => !duoPartnerOnline(), null, { timeout: 15000 });

  pageB = await contextB.newPage();
  await pageB.goto(inviteUrl);
  await waitForBoot(pageB);
  await pageB.waitForFunction(() => duo.active && duo.accepted, null, { timeout: 25000 });
  await pageA.waitForFunction(() => duoPartnerOnline(), null, { timeout: 25000 });
  await pageB.waitForFunction(() => route.view === 'quiz' && route.quizId === 'either' && route.index === 0, null, { timeout: 15000 });
  await pageB.waitForFunction(() => state.answers?.['either:0']?.kind === 'custom');

  await contextB.close();
  await contextA.close();
});

test('双人房间只有自己时，主动回首页后刷新仍留在首页', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await openFresh(page);
  await createRoom(page, '甲');
  await page.waitForFunction(() => duo.active && duo.accepted, null, { timeout: 15000 });

  await startPart(page, 'either', 1);
  await expect(page.locator('.question-card')).toBeVisible();
  await page.locator('[data-home]').click();
  await expect(page.locator('[data-open]')).toHaveCount(13);
  expect(await page.evaluate(() => duoPartnerOnline())).toBe(false);

  await page.reload();
  await waitForHome(page);
  expect(await page.evaluate(() => route.view)).toBe('home');
  await context.close();
});

test('历史记录显示具体轮次并可导出本轮和整套 Word', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await openFresh(page);

  await page.evaluate(() => {
    const q = quiz('either');
    const now = Date.now();
    const participants = [{ id: 'a', name: '甲' }, { id: 'b', name: '乙' }];
    const entries = [];
    for (let part = 1; part <= 4; part++) {
      const start = (part - 1) * 25;
      entries.push({
        id: `history-test-${part}`,
        quizId: q.id,
        quizTitle: q.title,
        quizIcon: q.icon,
        quizType: q.type,
        seq: part,
        startedAt: now - part * 10000,
        completedAt: now - part * 10000,
        participants,
        sessionPart: part,
        sessionStart: start + 1,
        sessionEnd: start + 25,
        questions: q.bankQuestions.slice(start, start + 25).map((item, i) => ({
          question: Array.isArray(item) ? item[0] : item,
          values: [`甲的答案 ${start + i + 1}`, `乙的答案 ${start + i + 1}`]
        }))
      });
    }
    roundsHistorySave(entries);
    home();
  });

  await expect(page.locator('[data-settings-open]')).toBeVisible();
  await expect(page.locator('[data-history-corner]')).toBeHidden();
  await page.locator('[data-settings-open]').click();
  await expect(page.locator('.settings-panel')).toBeVisible();
  await page.locator('[data-settings-history]').click();
  await expect(page.locator('[data-history-group="either"]')).toContainText('已完成 4/4 轮');
  await expect(page.locator('[data-history-group="either"]')).toContainText('甲的答案 1');
  await expect(page.locator('[data-history-group="either"]')).toContainText('乙的答案 1');
  await expect(page.locator('[data-export-set="either"]')).toBeVisible();

  const [setDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-export-set="either"]').click()
  ]);
  expect(setDownload.suggestedFilename()).toContain('整套');
  expect(setDownload.suggestedFilename()).toMatch(/\.doc$/);

  await page.locator('[data-view-round="history-test-1"]').click();
  await expect(page.locator('.history-answers article')).toHaveCount(25);
  await expect(page.locator('.history-answers article').first()).toContainText('甲的答案 1');
  await expect(page.locator('.history-answers article').first()).toContainText('乙的答案 1');

  const [roundDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-export-round="history-test-1"]').click()
  ]);
  expect(roundDownload.suggestedFilename()).toContain('第1轮');
  expect(roundDownload.suggestedFilename()).toMatch(/\.doc$/);

  await context.close();
});
