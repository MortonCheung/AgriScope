async (page) => {
  const check=(v,m)=>{if(!v)throw new Error(m);};
  const errors=[];const onError=e=>errors.push(e.message);page.on('pageerror',onError);
  await page.addInitScript(()=>{
    window.__webglContexts=0;window.__webglAllocations=[];const contexts=new WeakSet();const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args){const value=original.call(this,type,...args);if(value&&/^webgl/.test(type)&&!contexts.has(value)){contexts.add(value);window.__webglContexts++;window.__webglAllocations.push({canvas:this,stack:new Error().stack});}return value;};
  });
  await page.setViewportSize({width:1440,height:900});await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('http://127.0.0.1:5173/');await page.getByRole('button',{name:'进入 →',exact:true}).click();
  const skip=page.getByRole('button',{name:'跳过动画',exact:true});await skip.waitFor();check(await skip.evaluate(el=>el===document.activeElement),'跳过按钮未取得焦点');
  const skipAt=Date.now();await page.keyboard.press('Enter');await page.waitForURL('**/liaoning');check(Date.now()-skipAt<2000,'跳过动画仍等待完整时间轴');
  await page.getByRole('heading',{name:'辽宁 农业观察'}).waitFor();check(new URL(page.url()).search==='','跳过后注入默认城市');
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('http://127.0.0.1:5173/');await page.waitForTimeout(600);check(new URL(page.url()).pathname==='/','减少动效时未经点击自动导航');
  await page.getByRole('link',{name:'进入 →',exact:true}).click();await page.waitForURL('**/liaoning');check(await page.locator('canvas').count()===1,'减少动效重复Canvas');
  await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('http://127.0.0.1:5173/');await page.getByRole('button',{name:'进入 →',exact:true}).click();await page.getByRole('button',{name:'跳过动画'}).waitFor();
  await page.goto('http://127.0.0.1:5173/decision');await page.getByRole('heading',{name:'从一座城市开始'}).waitFor();await page.waitForTimeout(5200);check(new URL(page.url()).pathname==='/decision','离开开场后旧时间轴再次导航');
  await page.goto('http://127.0.0.1:5173/cities/dandong/decision?city=dandong&crop=玉米&horizon=30&as_of=2026-10-06');await page.getByRole('heading',{name:'投入多少，怎样保本。'}).waitFor();
  for(const [label,value] of [[/^种植面积/,'10'],[/^预计亩产/,'500'],[/^每亩总成本/,'1000'],[/^假设销售价格/,'5'],[/^可销售比例/,'80']])await page.getByRole('spinbutton',{name:label}).fill(value);await page.getByRole('button',{name:'核算我的计划',exact:true}).click();
  await page.getByRole('button',{name:'为什么？看生产结构依据'}).click();await page.getByRole('dialog').waitFor();const drawerUrl=page.url();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});check(page.url()===drawerUrl,'Esc关闭证据时退出工作台');
  await page.getByRole('link',{name:'查看研究 →',exact:true}).click();await page.getByRole('heading',{name:'丹东 · 研究工作台'}).waitFor();
  for(const [key,value] of [['city','dandong'],['crop','玉米'],['horizon','30'],['as_of','2026-10-06']])check(new URL(page.url()).searchParams.get(key)===value,'研究丢失上下文 '+key);
  await page.getByRole('button',{name:'后退',exact:true}).click();await page.getByRole('heading',{name:'投入多少，怎样保本。'}).waitFor();
  await page.getByRole('button',{name:'前进',exact:true}).click();await page.getByRole('heading',{name:'丹东 · 研究工作台'}).waitFor();
  await page.getByRole('link',{name:'进入决策 →',exact:true}).click();await page.getByRole('heading',{name:'投入多少，怎样保本。'}).waitFor();await page.reload();await page.getByRole('heading',{name:'投入多少，怎样保本。'}).waitFor();
  check(await page.getByRole('spinbutton',{name:/^假设销售价格/}).inputValue()==='5','刷新丢失经营输入');check((await page.getByRole('region',{name:'经营核算结果'}).textContent()).includes('10,000'),'刷新丢失核算结果');
  const canvas=await page.locator('canvas').elementHandle();
  for(let i=0;i<8;i++){
    await page.getByRole('link',{name:'查看研究 →',exact:true}).click();await page.getByRole('heading',{name:'丹东 · 研究工作台'}).waitFor();
    await page.getByRole('link',{name:'进入决策 →',exact:true}).click();await page.getByRole('heading',{name:'投入多少，怎样保本。'}).waitFor();
    check(await canvas.evaluate(el=>el===document.querySelector('canvas')),'快速往返重建Canvas');
  }
  await page.waitForTimeout(2500);const idle=await page.evaluate(async()=>{const original=window.requestAnimationFrame;let frames=0;window.requestAnimationFrame=function(cb){frames++;return original.call(window,cb);};await new Promise(resolve=>setTimeout(resolve,1000));window.requestAnimationFrame=original;return {rafRequests:frames,webglContexts:window.__webglAllocations.filter(item=>item.canvas.isConnected).length,webglProbeAllocations:window.__webglAllocations.filter(item=>!item.canvas.isConnected).map(item=>item.stack.split('\n').slice(1,4)),canvases:document.querySelectorAll('canvas').length};});
  check(idle.webglContexts===1&&idle.canvases===1,'单Canvas/WebGL不成立 '+JSON.stringify(idle));check(idle.rafRequests===0,'静止工作台仍在持续请求动画帧 '+JSON.stringify(idle));
  check(errors.length===0,'正常流程出现页面异常 '+errors.join(';'));
  const beforeFailures=errors.length;
  await page.route('**/geo/liaoning.json',route=>route.fulfill({status:503,body:'geometry unavailable'}));await page.goto('http://127.0.0.1:5173/liaoning');await page.getByRole('alert').filter({hasText:'地图暂时无法显示'}).waitFor();
  await page.getByRole('button',{name:'丹东',exact:true}).click();await page.getByRole('heading',{name:'丹东',exact:true,level:1}).waitFor();await page.waitForTimeout(800);await page.screenshot({path:'output/playwright/v4/map-fallback.png'});
  await page.unroute('**/geo/liaoning.json');await page.reload();await page.locator('canvas').waitFor();await page.waitForTimeout(600);check(await page.getByRole('alert').filter({hasText:'地图暂时无法显示'}).count()===0,'重载没有恢复地图');
  await page.evaluate(()=>document.querySelector('canvas').dispatchEvent(new Event('webglcontextlost')));await page.getByRole('alert').filter({hasText:'地图暂时无法显示'}).waitFor();
  await page.evaluate(()=>document.querySelector('canvas').dispatchEvent(new Event('webglcontextrestored')));await page.getByRole('alert').filter({hasText:'地图暂时无法显示'}).waitFor({state:'hidden'});
  await page.route('**/api/observations*',route=>route.fulfill({status:503,body:'temporarily unavailable'}));await page.goto('http://127.0.0.1:5173/liaoning');await page.locator('.liaoning-page [role=alert]').waitFor();
  check(!(await page.locator('.province-inspector').textContent()).includes('528.8'),'观测失败仍伪装有效数值');await page.unroute('**/api/observations*');
  page.off('pageerror',onError);
  return {skip:true,reducedMotion:true,openingCleanup:true,contextRoundTrip:['city','crop','horizon','as_of'],browserBackForward:true,refreshRestored:true,rapidRouteCycles:8,idle,normalPageErrors:errors.slice(0,beforeFailures),geometryFallback:true,contextLossRecovery:true,observationFailure:true};
}
