const { test, expect } = require('@playwright/test');

async function boot(page){
  await page.goto('/');
  await expect(page.locator('[data-open]')).toHaveCount(13);
}

async function openEither(page){
  await boot(page);
  await page.locator('[data-open="either"]').click();
  const chooser=page.locator('.session-mode-backdrop');
  await expect(chooser).toBeVisible();
  await chooser.locator('[data-part="1"]').click();
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

test('自己填写原位覆盖选项，实时刷新不丢焦点和选中态', async ({ page }) => {
  await openEither(page);
  const custom=page.locator('.choice-custom-option');
  await expect(custom.locator('input')).toHaveCount(0);
  await custom.click();

  const editor=page.locator('.choice-custom-option.choice-custom-editor');
  const input=editor.locator('input');
  await expect(editor).toHaveClass(/selected/);
  await expect(input).toBeFocused();
  await input.fill('连续输入测试');
  await input.evaluate(el=>{el.dataset.keepNode='yes'});

  await page.evaluate(()=>duoRefreshUI());
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('连续输入测试');
  await expect(editor).toHaveClass(/selected/);
  await expect(input).toHaveAttribute('data-keep-node','yes');
  await expect(page.locator('.choice-custom-option + .choice-custom-editor')).toHaveCount(0);
});
