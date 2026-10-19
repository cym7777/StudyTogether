import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const dir=mkdtempSync(join(tmpdir(),'study-final-ui-')),url='http://127.0.0.1:8792';
const server=spawn(process.execPath,['server/local.mjs'],{env:{...process.env,STUDY_PORT:'8792',STUDY_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});server.stderr.on('data',data=>process.stderr.write(data));
let browser;const errors=[],requests=[];let passed=0;const record=text=>{passed++;console.log(`PASS ${text}`);};
const write=async(path,body,method='PUT')=>{const response=await fetch(`${url}/api/${path}`,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,200);return response.json();};
try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('服务启动超时')),10000);server.stdout.once('data',()=>{clearTimeout(timer);resolve();});server.once('error',reject);});
 const home=await (await fetch(`${url}/api/home`)).json(),today=home.today,subject='LongSubject'.repeat(2).slice(0,20);
 await write('members/member-1',{name:'三十个字以内的成员长姓名测试一起坚持每天都记录学习和运动',color:'#5c93b4',version:1});await write('subjects',{name:subject},'POST');
 await write('tasks/final-long-task',{member_id:'member-1',date:today,kind:'done',subject,text:'LongText'.repeat(120),version:0});
 browser=await chromium.launch({headless:true,...(process.env.STUDY_BROWSER?{executablePath:process.env.STUDY_BROWSER}:{})});
 const context=await browser.newContext(),p=await context.newPage();p.on('pageerror',error=>errors.push(error.message));p.on('request',request=>requests.push(request.url()));p.on('dialog',dialog=>dialog.accept());await p.clock.install({time:new Date()});
 const routes=[['home','.member-card'],[`entry/member-1/${today}`,'#summary'],['history/member-1','.calendar'],['stats/member-1','.stat-grid'],['weekly/member-1','.weekly-day'],['settings','#backup-panel']];
 for(const width of [320,390,768,1440]){
  await p.setViewportSize({width,height:900});
  for(const [route,ready]of routes){await p.goto(`${url}/#${route}`);await p.locator(ready).first().waitFor();assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}px ${route}`);if(route.startsWith('entry')){await p.locator('[data-add=done]').click();await p.locator('#task-text').fill('任务弹窗布局测试');assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.locator('#cancel-task').click();}}
  record(`${width}px 首页/个人/历史/统计/周报/设置与弹窗，长姓名/长科目/长任务不溢出`);
 }
 await p.goto(`${url}/#settings`);await p.locator('#backup-panel').waitFor();await p.locator('.install-help').waitFor();const manifestResponse=await fetch(`${url}/manifest.webmanifest`);assert.match(manifestResponse.headers.get('Content-Type'),/application\/manifest\+json/);const manifest=await manifestResponse.json();for(const icon of manifest.icons){const response=await fetch(url+icon.src);assert.equal(response.status,200);assert.ok((await response.arrayBuffer()).byteLength>0);}assert.equal(await p.evaluate(()=>navigator.serviceWorker.getRegistrations().then(r=>r.length)),0);record('桌面快捷入口说明、manifest/图标可读取，不缓存 API 或伪装离线保存');
 await p.goto(`${url}/#entry/member-1/${today}`);await p.locator('#summary').waitFor();
 async function tick(){const response=p.waitForResponse(r=>r.url()===`${url}/api/sync`);await p.clock.fastForward(60001);await response;}
 let count=requests.filter(u=>u.includes('/api/home')||u.includes('/api/entries')).length;await tick();assert.equal(requests.filter(u=>u.includes('/api/home')||u.includes('/api/entries')).length,count);record('一分钟空闲同步只请求一次游标，没有重读首页/历史/详情');
 await write('tasks/final-sync-task',{member_id:'member-1',date:today,kind:'done',subject:'运动',text:'另一浏览器新增的运动',version:0});await tick();await p.locator('#done-tasks').getByText('另一浏览器新增的运动',{exact:true}).waitFor();record('数据变化后自动读取并显示另一客户端新增记录');
 await p.goto(`${url}/#weekly/member-1`);await p.locator('.weekly-day').first().waitFor();await p.locator('.weekly-day').first().locator('summary').click();const date=await p.locator('.weekly-day').first().getAttribute('data-date');await write('tasks/final-week-task',{member_id:'member-1',date:today,kind:'done',subject:'数学',text:'周报刷新触发事项',version:0});await tick();await p.locator('.weekly-day li').filter({hasText:'周报刷新触发事项'}).waitFor({state:'attached'});assert.equal(await p.locator(`.weekly-day[data-date="${date}"]`).getAttribute('open'),'');assert.equal(await p.locator(`.weekly-day[data-date="${today}"] .continue`).count(),1);record('周报同步保留已展开日期，不重置阅读位置');
 await p.goto(`${url}/#history/member-1`);await p.locator('#history-search').waitFor();await p.locator('#history-search [name=q]').fill('还没提交的搜索');await write('subjects',{name:'并发分类'},'POST');await tick();assert.equal(await p.locator('#history-search [name=q]').inputValue(),'还没提交的搜索');record('自动同步不会覆盖正在输入的搜索条件');
 await p.goto(`${url}/#settings`);await p.locator('#exam-form').waitFor();await p.locator('[data-member=member-1] [name=name]').fill('尚未提交姓名');await p.clock.fastForward(60001);assert.equal(await p.locator('[data-member=member-1] [name=name]').inputValue(),'尚未提交姓名');record('设置输入期间不自动重建表单');
 const header=await fetch(url);assert.match(header.headers.get('Content-Security-Policy'),/object-src 'none'/);assert.equal(header.headers.get('X-Content-Type-Options'),'nosniff');assert.ok(requests.every(u=>u.startsWith(url)));assert.deepEqual(errors,[]);record('全程无第三方网络请求、无页面异常；本地安全头与云入口一致');
 if(process.env.STUDY_SCREENSHOTS_DIR){mkdirSync(process.env.STUDY_SCREENSHOTS_DIR,{recursive:true});await p.setViewportSize({width:390,height:844});for(const [route,name,ready]of [['home','第三阶段-手机首页.png','.member-card'],[`entry/member-1/${today}`,'第三阶段-手机记录.png','#summary']]){await p.goto(`${url}/#${route}`);await p.locator(ready).first().waitFor();await p.screenshot({path:join(process.env.STUDY_SCREENSHOTS_DIR,name),fullPage:true});}}
 console.log(`STAGE3 BROWSER: ${passed} passed; actual phone/QQ/cloud NOT RUN`);
}finally{if(browser)await browser.close();server.kill('SIGTERM');await new Promise(resolve=>server.exitCode!==null?resolve():server.once('exit',resolve));rmSync(dir,{recursive:true,force:true});}
