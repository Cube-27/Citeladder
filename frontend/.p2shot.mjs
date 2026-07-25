import { chromium } from '@playwright/test';
const OUT=process.argv[2]; const routes=process.argv.slice(3);
const b=await chromium.launch();
for(const theme of ['light','dark']){
  const ctx=await b.newContext({viewport:{width:1440,height:900}});
  await ctx.addInitScript(t=>window.localStorage.setItem('searchify-theme',t),theme);
  const p=await ctx.newPage();
  for(const r of routes){
    await p.goto(`http://localhost:3000/${r}`,{waitUntil:'networkidle'});
    await p.waitForTimeout(1500);
    await p.screenshot({path:`${OUT}/p2-${r||'home'}-${theme}.png`});
    console.log('shot',r||'home',theme);
  }
  await ctx.close();
}
await b.close();
