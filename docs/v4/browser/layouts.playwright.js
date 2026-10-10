async (page) => {
  const pageErrors=[],consoleErrors=[];const onError=e=>pageErrors.push(e.message);const onConsole=m=>{if(m.type()==='error')consoleErrors.push(m.text());};page.on('pageerror',onError);page.on('console',onConsole);
  const check=(v,m)=>{if(!v)throw new Error(m);};const results=[];
  for(const [width,height] of [[1920,1080],[1440,900],[1280,800],[1024,768],[768,1024],[390,844]]){
    await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:5173/liaoning');await page.getByRole('heading',{name:'辽宁 农业观察'}).waitFor();await page.waitForTimeout(350);
    check(await page.locator('canvas').count()===1,'Canvas数量错误');const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);check(!overflow,`页面横向溢出 ${width}`);
    await page.waitForTimeout(800);await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`output/playwright/v4/province-${width}x${height}.png`});
    const labels=await page.locator('.liaoning-label').evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();return {city:el.textContent.trim(),x:r.x,y:r.y,w:r.width,h:r.height};}));
    check(labels.every(r=>r.x>=0&&r.y>=0&&r.x+r.w<=width&&r.y+r.h<=height),'地图标签超出视口');
    await page.getByRole('button',{name:'丹东',exact:true}).click();await page.getByRole('link',{name:'进入决策 →',exact:true}).click();await page.getByRole('heading',{name:'投入多少，怎样保本。'}).waitFor();
    check(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)),`决策页横向溢出 ${width}`);
    await page.waitForTimeout(800);await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`output/playwright/v4/decision-${width}x${height}.png`});
    await page.getByRole('link',{name:'查看研究 →',exact:true}).click();await page.getByRole('heading',{name:'丹东 · 研究工作台',exact:true}).waitFor();
    if(width<=900){await page.getByRole('button',{name:/A07/}).click();await page.waitForURL('**/research/A7?**');await page.getByRole('heading',{name:'丹东市农业生产结构与变化',exact:true}).waitFor();}
    check(await page.getByRole('button',{name:'返回城市概览',exact:true}).count()===1,'重复关闭');
    await page.waitForTimeout(800);await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`output/playwright/v4/research-${width}x${height}.png`});
    await page.keyboard.press('Escape');await page.waitForURL('**/liaoning?city=dandong');
    results.push({width,height,noHorizontalOverflow:!overflow,labels,decision:true,research:true,escReturned:true});
  }
  page.off('pageerror',onError);page.off('console',onConsole);check(pageErrors.length===0&&consoleErrors.length===0,'正常流程出现浏览器错误 '+JSON.stringify({pageErrors,consoleErrors}));return {results,pageErrors,consoleErrors};
}
