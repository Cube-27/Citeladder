import { chromium } from '@playwright/test';
const OUT=process.argv[2];
const b=await chromium.launch();
for(const theme of ['light','dark']){
  const ctx=await b.newContext({viewport:{width:1440,height:800}});
  await ctx.addInitScript(t=>window.localStorage.setItem('searchify-theme',t),theme);
  const p=await ctx.newPage();
  await p.goto('http://localhost:3000/',{waitUntil:'networkidle'});
  await p.waitForTimeout(1200);
  await p.hover('button:has-text("Product")');
  await p.waitForTimeout(900);
  await p.screenshot({path:`${OUT}/nav-drop-${theme}.png`, clip:{x:0,y:0,width:1440,height:620}});
  console.log('shot',theme);
  await ctx.close();
}
await b.close();
