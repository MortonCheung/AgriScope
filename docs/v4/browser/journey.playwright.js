async (page) => {
  const pageErrors=[],consoleErrors=[];const onError=e=>pageErrors.push(e.message);const onConsole=m=>{if(m.type()==='error')consoleErrors.push(m.text());};page.on('pageerror',onError);page.on('console',onConsole);
  const check=(v,m)=>{if(!v)throw new Error(m);};const results=[];
  const cities=[['dandong','丹东']];
  for(const [id,name] of cities){
    await page.goto('http://127.0.0.1:5173/liaoning');await page.getByRole('button',{name,exact:true}).click();await page.waitForURL(`**/liaoning?city=${id}`);await page.waitForTimeout(250);
    await page.waitForTimeout(800);await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`output/playwright/v4/${id}-overview.png`});const canvas=await page.locator('canvas').elementHandle();
    await page.getByRole('link',{name:'进入决策 →',exact:true}).click();await page.getByRole('heading',{name:'投入多少，怎样保本。'}).waitFor();
    await page.getByRole('combobox',{name:'计划作物',exact:true}).selectOption({label:'玉米'});
    for(const [label,value] of [[/^种植面积/,'10'],[/^预计亩产/,'500'],[/^每亩总成本/,'1000'],[/^假设销售价格/,'4'],[/^可销售比例/,'80']]) await page.getByRole('spinbutton',{name:label}).fill(value);
    await page.getByRole('button',{name:'核算我的计划',exact:true}).click();
    const result=page.getByRole('region',{name:'经营核算结果'});check((await result.textContent()).includes('6,000'),'核算利润错误');
    await page.getByRole('button',{name:'保存为方案 A'}).click();await page.getByRole('spinbutton',{name:/^假设销售价格/}).fill('5');
    check((await result.textContent()).includes('10,000'),'改价未刷新利润');
    await page.waitForTimeout(800);await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`output/playwright/v4/${id}-decision-full.png`,fullPage:true});
    if(['shenyang','chaoyang'].includes(id))await page.getByRole('button',{name:'短期市场比较',exact:true}).waitFor();
    const price=await page.getByRole('button',{name:'短期市场比较',exact:true}).count();const long=await page.getByRole('button',{name:'上市窗口情景',exact:true}).count();
    check(price===(['shenyang','chaoyang'].includes(id)?1:0),'短期功能越过真实能力');check(long===(id==='shenyang'?1:0),'长期入口越过真实能力');
    await page.getByRole('button',{name:'为什么？看生产结构依据'}).click();await page.getByRole('dialog').waitFor();await page.getByRole('heading',{name:'本城农业观测'}).waitFor();
    const deep=page.getByRole('dialog').getByRole('link',{name:/查看完整研究/});await deep.click();
    await page.getByRole('heading',{name:`${name} · 研究工作台`,exact:true}).waitFor();check(await page.getByRole('button',{name:'返回城市概览',exact:true}).count()===1,'重复退出控件');
    await page.waitForTimeout(800);await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`output/playwright/v4/${id}-research.png`});
    await page.getByRole('link',{name:'进入决策 →',exact:true}).click();await page.getByRole('heading',{name:'投入多少，怎样保本。'}).waitFor();
    check(await page.getByRole('spinbutton',{name:/^假设销售价格/}).inputValue()==='5','研究返回丢失价格输入');check((await page.getByRole('region',{name:'经营核算结果'}).textContent()).includes('10,000'),'研究返回丢失核算结果');
    check(await page.getByRole('table',{name:'两方案经营结果比较'}).count()===1,'研究返回丢失方案A');
    const sameCanvas=await canvas.evaluate(el=>el===document.querySelector('canvas'));check(sameCanvas,'路由重新创建了Canvas');
    await page.getByRole('link',{name:'返回城市概览',exact:true}).click();await page.waitForURL(`**/liaoning?city=${id}`);
    results.push({city:id,profitCny:10000,shortPrice:price===1,longScenario:long===1,returnedContext:true,sameCanvas});
  }
  page.off('pageerror',onError);page.off('console',onConsole);check(pageErrors.length===0&&consoleErrors.length===0,'正常流程出现浏览器错误 '+JSON.stringify({pageErrors,consoleErrors}));return {results,pageErrors,consoleErrors};
}
