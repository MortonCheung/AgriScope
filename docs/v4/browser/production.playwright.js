async (page) => {
  const check=(v,m)=>{if(!v)throw new Error(m);};const results=[];const pageErrors=[];const onError=e=>pageErrors.push(e.message);page.on('pageerror',onError);
  await page.setViewportSize({width:1440,height:900});await page.goto('http://127.0.0.1:4173/liaoning');await page.getByRole('heading',{name:'辽宁 农业观察'}).waitFor();await page.waitForTimeout(600);check(new URL(page.url()).search==='','正式构建默认状态错误');
  for(const city of ['shenyang','chaoyang']){
    await page.goto(`http://127.0.0.1:4173/cities/${city}/decision?city=${city}&view=input`);await page.getByRole('heading',{name:'这季，怎么种。'}).waitFor();
    await page.getByRole('spinbutton',{name:/^种植面积/}).fill('10');await page.getByRole('spinbutton',{name:/^可用预算/}).fill('2');
    await page.getByText('作物与实际投入',{exact:true}).click();await page.getByRole('checkbox',{name:'西红柿',exact:true}).check();await page.getByRole('combobox',{name:'实际投入对应作物',exact:true}).selectOption('西红柿');
    await page.locator('input[name="actual-cost"]').fill('1000');await page.locator('input[name="actual-yield"]').fill('500');await page.getByRole('combobox',{name:/^市场评估跨度/}).selectOption('14');
    const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/decision')&&r.request().method()==='POST');await page.getByRole('button',{name:'比较种植选择 →',exact:true}).click();
    const response=await responsePromise;check(response.ok(),'正式模型返回错误');const payload=await response.json();
    await page.locator('.decision-result').waitFor();await page.waitForTimeout(800);await page.screenshot({path:`output/playwright/v4/production-${city}.png`});
    check(payload.model_version==='final_v1','正式构建没有调用Final引擎');check(payload.request.user_context.city_id===city,'正式模型城市不一致');
    check(await page.getByText(/旧模型历史样例|仅演示|legacy_model_fixture/).count()===0,'正式构建泄漏历史样例');
    results.push({city,status:response.status(),modelVersion:payload.model_version,actualModel:true});
  }
  await page.goto('http://127.0.0.1:4173/cities/dandong/decision?city=dandong');await page.getByRole('heading',{name:'投入多少，怎样保本。'}).waitFor();check(await page.getByRole('button',{name:'短期市场比较'}).count()===0,'丹东正式构建误开价格模型');
  page.off('pageerror',onError);check(pageErrors.length===0,'正式构建页面异常');return {provinceDefault:true,results,dandongPlanning:true,pageErrors};
}
