const { test, expect } = require('@playwright/test');

async function waitForBoot(page) {
  await page.waitForFunction(() => !document.documentElement.classList.contains('app-booting'));
  await expect(page.locator('[data-open]')).toHaveCount(13);
}

async function openFresh(page) {
  await page.goto('/');
  await waitForBoot(page);
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

test('双客户端同步、自由回答、离线和回来', async ({ browser }) => {
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

  await pageA.waitForFunction(() => {
    const r = duoRemoteState();
    return r?.answers?.['either:0']?.kind === 'custom' && r.answers['either:0'].text.includes('自己的答案');
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
