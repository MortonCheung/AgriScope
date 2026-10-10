async (page) => {
  const check=(value,message)=>{if(!value)throw new Error(message);};
  const states=[];
  await page.setViewportSize({width:1440,height:900});
  await page.goto('http://127.0.0.1:5173/liaoning');
  await page.getByRole('heading',{name:'辽宁 农业观察'}).waitFor();await page.locator('.province-crops').waitFor();
  const canvas=await page.locator('canvas').elementHandle();
  const record=async(label)=>states.push({label,url:page.url(),selected:await page.locator('.liaoning-city-rail button[aria-pressed="true"]').allTextContents(),preview:await page.locator('.liaoning-hover-preview').textContent(),sameCanvas:await canvas.evaluate(node=>node===document.querySelector('canvas'))});
  check(new URL(page.url()).search==='','默认全省不应补城市/跨度');
  await record('province_default');
  async function meshPoint(name){const box=await page.locator('.liaoning-label').filter({hasText:new RegExp('^'+name+'$')}).boundingBox();check(box,'地图标签不存在');return {x:box.x+box.width/2,y:box.y+box.height/2+8};}
  let point=await meshPoint('沈阳');await page.mouse.move(point.x,point.y);await page.waitForTimeout(400);
  check((await page.locator('.liaoning-hover-preview').textContent()).includes('沈阳'),'真实Mesh hover未生效');
  check(await page.locator('.liaoning-city-rail button[aria-pressed="true"]').count()===0,'hover不能选择城市');
  await page.screenshot({path:'output/playwright/v4/province-hover.png'});await record('mesh_hover_shenyang');
  await page.mouse.move(720,780);await page.waitForTimeout(200);await record('leave_shenyang');
  point=await meshPoint('朝阳');await page.mouse.move(point.x,point.y);await page.waitForTimeout(250);await page.mouse.click(point.x,point.y);
  await page.waitForURL('**/liaoning?city=chaoyang');await page.getByRole('heading',{name:'朝阳',exact:true,level:1}).waitFor();await record('mesh_select_chaoyang');
  point=await meshPoint('锦州');await page.mouse.move(point.x,point.y);await page.waitForTimeout(250);await record('hover_jinzhou_keeps_chaoyang');
  check((await page.locator('.liaoning-city-rail button[aria-pressed="true"]').textContent()).includes('朝阳'),'hover改变锁定选择');
  await page.mouse.move(720,780);await page.waitForTimeout(250);await record('leave_keeps_chaoyang');
  await page.getByRole('button',{name:'锦州',exact:true}).click();await page.waitForURL('**city=jinzhou');await page.locator('.liaoning-city-rail button[aria-pressed="true"]').filter({hasText:'锦州'}).waitFor();await record('select_jinzhou');
  await page.getByRole('button',{name:'返回全省'}).click();await page.waitForURL('**/liaoning');await page.getByRole('heading',{name:'辽宁 农业观察'}).waitFor();check(await page.locator('.liaoning-city-rail button[aria-pressed="true"]').count()===0,'返回全省仍有选中城市');await record('return_province');
  await page.goBack();await page.waitForURL('**city=jinzhou');await page.locator('.liaoning-city-rail button[aria-pressed="true"]').filter({hasText:'锦州'}).waitFor();await record('browser_back_jinzhou');
  await page.goBack();await page.waitForURL('**city=chaoyang');await page.locator('.liaoning-city-rail button[aria-pressed="true"]').filter({hasText:'朝阳'}).waitFor();await record('browser_back_chaoyang');
  await page.goForward();await page.waitForURL('**city=jinzhou');await page.locator('.liaoning-city-rail button[aria-pressed="true"]').filter({hasText:'锦州'}).waitFor();await record('browser_forward_jinzhou');
  await page.reload();await page.getByRole('heading',{name:'锦州',exact:true,level:1}).waitFor();check(new URL(page.url()).searchParams.get('city')==='jinzhou','刷新选择丢失');
  await page.getByRole('button',{name:'返回全省'}).click();await page.getByRole('button',{name:'丹东',exact:true}).click();await page.waitForURL('**city=dandong');
  await page.screenshot({path:'output/playwright/v4/province-selected-dandong.png'});
  await page.goto('http://127.0.0.1:5173/liaoning');await page.reload();await page.getByRole('heading',{name:'辽宁 农业观察'}).waitFor();check(await page.locator('.liaoning-city-rail button[aria-pressed="true"]').count()===0,'无参数刷新补了城市');
  return states;
}
