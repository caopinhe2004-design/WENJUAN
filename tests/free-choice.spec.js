const { test, expect } = require('@playwright/test');

async function boot(page){
  await page.goto('/');
  await expect(page.locator('[data-open]')).toHaveCount(13);
}

async function openEither(page){
  await boot(page);
  await page.locator('[data-open="either"]').click();
  await expect(page.locator('.question-card')).toBeVisible();
}

test('选择预置答案后仍可切换到自己填写', async ({ page }) => {
  await openEither(page);
  const presets=page.locator('.question-card .options .option:not(.choice-custom-option)');
  await presets.first().click();
  await page.locator('.choice-custom-option').click();
  const input=page.locator('.choice-custom-editor input');
  await expect(input).toBeVisible();
  await input.fill('我的答案');
  await expect(input).toHaveValue('我的答案');
  const answer=await page.evaluate(()=>state.answers[key('either',route.index)]);
  expect(answer).toEqual({kind:'custom',text:'我的答案'});
});

test('自己填写时 Backspace 只删除文字', async ({ page }) => {
  await openEither(page);
  await page.locator('.choice-custom-option').click();
  const input=page.locator('.choice-custom-editor input');
  await input.fill('abc');
  await input.press('Backspace');
  await expect(input).toHaveValue('ab');
  await expect(page.locator('.choice-custom-editor input')).toBeFocused();
  expect(await page.evaluate(()=>route.index)).toBe(0);
  const answer=await page.evaluate(()=>state.answers[key('either',route.index)]);
  expect(answer).toEqual({kind:'custom',text:'ab'});
});
