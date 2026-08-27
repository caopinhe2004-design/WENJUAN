const { test, expect } = require('@playwright/test');

const APP_ID='https://caopinhe2004-design.github.io/WENJUAN/';
const MANIFEST_URL='https://caopinhe2004-design.github.io/WENJUAN/manifest.webmanifest';

async function boot(page){
  await page.goto('/');
  await expect(page.locator('[data-open]')).toHaveCount(13);
}

test('manifest 自关联以支持桌面端识别已安装 PWA', async ({ page }) => {
  await boot(page);
  const manifest=await page.evaluate(async()=>{
    const response=await fetch(document.querySelector('link[rel="manifest"]').href,{cache:'no-store'});
    return response.json();
  });
  expect(manifest.related_applications).toContainEqual({platform:'webapp',url:MANIFEST_URL,id:APP_ID});
});

test('Edge 已安装时设置页明确显示已安装且不再尝试安装', async ({ browser }) => {
  const context=await browser.newContext({
    userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0'
  });
  const page=await context.newPage();
  await boot(page);
  await page.evaluate(({id,url})=>{
    Object.defineProperty(navigator,'getInstalledRelatedApps',{configurable:true,value:async()=>[{platform:'webapp',id,url}]});
  },{id:APP_ID,url:MANIFEST_URL});
  await page.locator('[data-settings-open]').click();
  const install=page.locator('[data-settings-install]');
  await expect(install).toContainText('已安装到桌面');
  await expect(install).toContainText('已经安装');
  await install.click();
  await expect(page.locator('.toast')).toContainText('已经安装到桌面');
  await expect(page.locator('.pwa-guide')).toHaveCount(0);
  await context.close();
});
