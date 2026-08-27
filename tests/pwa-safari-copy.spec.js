const { test, expect } = require('@playwright/test');

async function boot(page){
  await page.goto('/');
  await expect(page.locator('[data-open]')).toHaveCount(13);
  await page.evaluate(()=>window.dispatchEvent(new Event('appinstalled')));
}

async function openSettings(page){
  await page.locator('[data-settings-open]').click();
  await expect(page.locator('.settings-panel')).toBeVisible();
}

test('iPhone Safari 无法确认是否已添加时明确提示主屏幕状态', async ({ browser }) => {
  const context=await browser.newContext({
    viewport:{width:390,height:844},isMobile:true,
    userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'
  });
  const page=await context.newPage();
  await boot(page);
  await openSettings(page);
  const install=page.locator('[data-settings-install]');
  await expect(install).toContainText('添加到主屏幕');
  await expect(install).toContainText('如果已经添加过，请直接从主屏幕打开');
  await install.click();
  await expect(page.locator('.pwa-guide')).toBeVisible();
  await expect(page.locator('.pwa-guide')).toContainText('Safari 无法确认这一页是否已经添加过');
  await expect(page.locator('.pwa-guide')).toContainText('添加到主屏幕');
  await context.close();
});

test('iPad Safari 同样提示已添加则从主屏幕打开', async ({ browser }) => {
  const context=await browser.newContext({
    viewport:{width:1024,height:768},
    userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15'
  });
  await context.addInitScript(()=>{
    Object.defineProperty(navigator,'platform',{get:()=> 'MacIntel'});
    Object.defineProperty(navigator,'maxTouchPoints',{get:()=>5});
  });
  const page=await context.newPage();
  await boot(page);
  await openSettings(page);
  const install=page.locator('[data-settings-install]');
  await expect(install).toContainText('添加到主屏幕');
  await expect(install).toContainText('如果已经添加过，请直接从主屏幕打开');
  await install.click();
  await expect(page.locator('.pwa-guide')).toContainText('Safari 无法确认这一页是否已经添加过');
  await expect(page.locator('.pwa-guide')).toContainText('顶部工具栏');
  await context.close();
});
