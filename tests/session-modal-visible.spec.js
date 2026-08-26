const { test, expect } = require('@playwright/test');

async function waitForHome(page){
  await page.waitForFunction(() => !document.documentElement.classList.contains('app-preparing'));
  await expect(page.locator('[data-open]')).toHaveCount(13);
}

async function expectModalInViewport(page, selector){
  const result = await page.locator(selector).evaluate(el => {
    const style = getComputedStyle(el);
    const card = el.firstElementChild;
    const rect = card.getBoundingClientRect();
    return {
      position: style.position,
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      vw: innerWidth,
      vh: innerHeight
    };
  });
  expect(result.position).toBe('fixed');
  expect(result.top).toBeGreaterThanOrEqual(0);
  expect(result.left).toBeGreaterThanOrEqual(0);
  expect(result.bottom).toBeLessThanOrEqual(result.vh + 1);
  expect(result.right).toBeLessThanOrEqual(result.vw + 1);
}

test('双人房间里点题库后选轮次弹窗必须出现在当前手机视口', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.addInitScript(() => localStorage.setItem('coupleSleepQuiz.duo.nickname', '甲'));
  const page = await context.newPage();
  await page.goto('/');
  await waitForHome(page);

  await page.locator('[data-duo-create]').tap();
  await page.waitForFunction(() => typeof duo !== 'undefined' && duo.active);

  await page.locator('[data-open="either"]').tap();
  await expect(page.locator('.session-mode-backdrop')).toBeVisible();
  await expectModalInViewport(page, '.session-mode-backdrop');

  await page.locator('.session-mode-backdrop [data-part="1"]').tap();
  await expect(page.locator('.question-card')).toBeVisible();

  await page.locator('[data-home]').tap();
  await waitForHome(page);
  await page.locator('[data-open="either"]').tap();
  await expect(page.locator('.session-resume-backdrop')).toBeVisible();
  await expectModalInViewport(page, '.session-resume-backdrop');

  await page.locator('.session-resume-backdrop [data-resume]').tap();
  await expect(page.locator('.question-card')).toBeVisible();
  await context.close();
});
