async (page) => {
  await page.setViewportSize({width:1440,height:900});await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('http://127.0.0.1:5173/');await page.getByRole('button',{name:'进入 →',exact:true}).waitFor();await page.waitForTimeout(600);
  const canvas=await page.locator('canvas').elementHandle();const start=Date.now();await page.getByRole('button',{name:'进入 →',exact:true}).click();
  await page.waitForURL('**/liaoning');await page.getByRole('heading',{name:'辽宁 农业观察'}).waitFor();
  const elapsedMs=Date.now()-start;await page.waitForTimeout(800);await page.screenshot({path:'output/playwright/v4/province-default.png'});
  if(new URL(page.url()).search!=='')throw new Error('开场注入默认城市/跨度');
  if(!(await canvas.evaluate(el=>el===document.querySelector('canvas'))))throw new Error('开场结束重建了Canvas');
  return {elapsedMs,url:page.url(),sameCanvas:true,selectedCities:await page.locator('.liaoning-city-rail [aria-pressed=true]').count()};
}
