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

test('预置答案和自己填写使用同一选项组件，填写后要确定才提交', async ({ page }) => {
  await openEither(page);
  const options=page.locator('.question-card .options');
  const presets=options.locator('[data-opt]');
  const custom=options.locator('[data-custom-open]');
  await expect(custom).toHaveClass(/option/);
  await expect(custom).toHaveClass(/choice-custom-option/);
  await expect(custom.locator('xpath=..')).toHaveClass(/options/);
  const visual=await page.evaluate(()=>{
    const preset=document.querySelector('[data-opt]');
    const custom=document.querySelector('[data-custom-open]');
    const a=getComputedStyle(preset),b=getComputedStyle(custom);
    return {presetRadius:a.borderRadius,customRadius:b.borderRadius,presetMin:a.minHeight,customMin:b.minHeight,customGrid:b.gridColumn};
  });
  expect(visual.customRadius).toBe(visual.presetRadius);
  expect(visual.customMin).toBe(visual.presetMin);
  expect(visual.customGrid).not.toBe('auto');

  await presets.first().click();
  await expect(presets.first()).toHaveClass(/selected/);

  await custom.click();
  const editor=options.locator('.choice-custom-editor');
  const input=editor.locator('input');
  await expect(editor).toHaveClass(/selected/);
  await expect(editor.locator('[data-custom-confirm]')).toHaveClass(/primary/);
  await expect(editor.locator('[data-custom-cancel]')).toHaveClass(/ghost/);
  await expect(page.locator('[data-opt].selected')).toHaveCount(0);

  await input.fill('我的答案');
  await expect(input).toHaveValue('我的答案');
  expect(await page.evaluate(()=>state.answers[key('either',route.index)])).toBe(0);

  await editor.locator('[data-custom-confirm]').click();
  expect(await page.evaluate(()=>state.answers[key('either',route.index)])).toEqual({kind:'custom',text:'我的答案'});
  await expect(page.locator('[data-opt].selected')).toHaveCount(0);

  await presets.nth(1).click();
  await expect(page.locator('.choice-custom-editor')).toHaveCount(0);
  await expect(presets.nth(1)).toHaveClass(/selected/);
  await expect(page.locator('[data-opt].selected')).toHaveCount(1);
  expect(await page.evaluate(()=>state.answers[key('either',route.index)])).toBe(1);
});

test('自己填写时 Backspace 只删除文字且不会自动提交', async ({ page }) => {
  await openEither(page);
  await page.locator('.choice-custom-option').click();
  const input=page.locator('.choice-custom-editor input');
  await input.fill('abc');
  await input.press('Backspace');
  await expect(input).toHaveValue('ab');
  await expect(input).toBeFocused();
  expect(await page.evaluate(()=>route.index)).toBe(0);
  expect(await page.evaluate(()=>state.answers[key('either',route.index)])).toBeUndefined();

  await page.locator('[data-custom-confirm]').click();
  expect(await page.evaluate(()=>state.answers[key('either',route.index)])).toEqual({kind:'custom',text:'ab'});
});

test('实时状态刷新不会替换正在输入的自制输入框', async ({ page }) => {
  await openEither(page);
  await page.locator('.choice-custom-option').click();
  const editor=page.locator('.choice-custom-editor');
  const input=editor.locator('input');
  await input.fill('连续输入测试');
  await input.evaluate(el=>{el.dataset.keepNode='yes'});

  await page.evaluate(()=>{
    duo.active=true;
    duoRefreshUI();
  });
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('连续输入测试');
  await expect(editor).toHaveClass(/selected/);
  await expect(input).toHaveAttribute('data-keep-node','yes');
});

test('文字题草稿确定前不进入正式答案', async ({ page }) => {
  await boot(page);
  await page.locator('[data-open="whatif"]').click();
  await page.locator('.session-mode-backdrop [data-part="1"]').click();

  const ta=page.locator('[data-text]');
  await ta.fill('还在想');
  expect(await page.evaluate(()=>state.answers[key('whatif',route.index)])).toBeUndefined();
  await expect(page.locator('[data-answer-confirm="text"]')).toHaveText('确定答案');

  await page.locator('[data-answer-confirm="text"]').click();
  expect(await page.evaluate(()=>state.answers[key('whatif',route.index)])).toBe('还在想');
});

test('排行榜调整后必须点确定才更新正式答案', async ({ page }) => {
  await boot(page);
  await page.locator('[data-open="rank"]').click();
  await page.locator('.session-mode-backdrop [data-part="1"]').click();

  const before=await page.evaluate(()=>state.answers[key('rank',route.index)]);
  expect(before).toBeUndefined();
  await page.locator('[data-down="0"]').click();
  expect(await page.evaluate(()=>state.answers[key('rank',route.index)])).toBeUndefined();
  await expect(page.locator('.rank-confirm')).toContainText('确定');

  await page.locator('.rank-confirm').click();
  const after=await page.evaluate(()=>state.answers[key('rank',route.index)]);
  expect(Array.isArray(after)).toBe(true);
});
