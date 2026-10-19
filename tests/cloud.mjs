// Writes only to a newly provisioned, empty room. Never run on a used room.
// Run with STUDY_CLOUD_TEST=1, STUDY_CLOUD_URL=https://... and optional browser paths.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {collectBackup} from '../public/backup-download.mjs';
import {shiftDate} from '../public/time.mjs';
const base=process.env.STUDY_CLOUD_URL;
assert.ok(process.env.STUDY_CLOUD_TEST==='1'&&base&&new URL(base).protocol==='https:','请显式指定全新空库的 HTTPS 云网址和测试开关');
const prefix=`cloudcheck-${randomBytes(5).toString('hex')}`,ownedIds=[],ownedEntries=[],results=[];
const record=text=>{results.push(text);console.log(`PASS ${text}`);};
async function response(path,body,method='POST'){
 // Retry read-only transport failures, never blindly repeat a mutation.
 for(let attempt=0;;attempt++){try{return await fetch(`${base}/api/${path}`,{cache:'no-store',signal:AbortSignal.timeout(30000),...(body!==undefined?{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});}catch(error){if(body!==undefined||attempt>=2)throw error;console.log(`READ NETWORK RETRY ${attempt+1}: ${path}`);await new Promise(resolve=>setTimeout(resolve,300*(attempt+1)));}}
}
async function api(path,body,method){const r=await response(path,body,method),data=await r.json();assert.equal(r.status,200,`${path}: ${JSON.stringify(data)}`);return data;}
const initial=await collectBackup(api);assert.equal(initial.tasks.length,0,'非空数据库，拒绝执行写测试');assert.equal(initial.entries.length,0,'已有总结，拒绝执行写测试');
const home=await api('home'),today=home.today,previous=shiftDate(today,-1),older=shiftDate(today,-2);
assert.equal(home.storage,'cloud-d1');assert.equal(home.members.length,3);record('真实 Workers HTTPS 接口连接 D1，三名固定成员');
const makeTask=async(suffix,extra={})=>{const id=`${prefix}-${suffix}`;ownedIds.push(id);return api(`tasks/${id}`,{member_id:'member-1',date:today,kind:'done',subject:'数学',text:`${prefix} ${suffix}`,version:0,...extra},'PUT');};
let browser;
try{
 for(let member=1;member<=3;member++)await makeTask(`member-${member}`,{member_id:`member-${member}`});await makeTask('yesterday',{date:previous});await makeTask('older',{date:older});record('三人各自追加完成任务，历史日期不会覆盖今天');
 const taskId=ownedIds[0];let edited=await api(`tasks/${taskId}`,{member_id:'member-1',date:today,kind:'done',subject:'运动',text:`${prefix} 跑步30分钟`,version:1},'PUT');assert.equal(edited.subject,'运动');assert.equal((await response(`tasks/${taskId}`,{member_id:'member-1',date:today,kind:'done',subject:'英语',text:'陈旧版本',version:1},'PUT')).status,409);
 edited=await api(`tasks/${taskId}/delete`,{version:edited.version});assert.ok(edited.deleted_at);edited=await api(`tasks/${taskId}/restore`,{version:edited.version});assert.equal(edited.deleted_at,null);record('真实 D1 任务编辑、运动分类、软删除/恢复及版本冲突');
 const plan=await makeTask('plan',{kind:'plan',date:previous,subject:'英语'}),done=await api(`tasks/${plan.id}/complete`,{date:today});ownedIds.push(done.id);assert.equal((await api(`tasks/${plan.id}/complete`,{date:today})).id,done.id);assert.ok((await api(`entries/member-1/${previous}`)).tasks.some(t=>t.id===plan.id&&t.kind==='plan'));record('昨日计划主动转完成，云端幂等且原计划保留');
 ownedEntries.push(`member-1:${today}`);let entry=await api(`entries/member-1/${today}`,{summary:`${prefix} 第一段收获\n\n还有定积分疑问`,version:0},'PUT');entry=await api(`entries/member-1/${today}`,{summary:`${prefix} 最新总结`,version:entry.version},'PUT');assert.equal((await response(`entries/member-1/${today}`,{summary:'陈旧总结',version:1},'PUT')).status,409);assert.equal((await api(`entries/member-1/${today}`)).summary,entry.summary);record('真实云端多段总结保存、刷新读取、冲突不覆盖');
 const profile=home.members[2];const changed=await api('members/member-3',{name:'云端验证同学',color:'#abcdef',version:profile.version},'PUT');assert.equal((await api('home')).members[2].name,'云端验证同学');await api('members/member-3',{name:profile.name,color:profile.color,version:changed.version},'PUT');record('云端改名/主题色固定 ID 不变，随后恢复原姓名');
 assert.ok((await api(`history/member-1?month=${today.slice(0,7)}`)).rows.some(row=>row.date===today));const stats=await api('stats/member-1');assert.equal(stats.streak,3);assert.equal(stats.totalTasks,4);assert.equal((await api(`search/member-1?q=${prefix}`)).rows.length,3);assert.equal((await api(`weekly?date=${today}`)).members.length,3);assert.ok((await api(`share/member-1/${today}`)).text.includes('考研打卡 Day 3'));record('真实云端历史、连续天数、统计、周报、搜索与 QQ 分享');
 const backup=await collectBackup(api),newId=`${prefix}-restored`;ownedIds.push(newId);backup.tasks.push({...backup.tasks[0],id:newId,source_plan_id:null,deleted_at:null,text:`${prefix} 合并恢复`});const preview=await api('backup/preview',{backup});assert.equal(preview.missingTasks,1);const merge={backup,fingerprint:preview.fingerprint,confirmation:'合并恢复',profileVersions:preview.profileVersions,settingsVersion:preview.settingsVersion};assert.equal((await api('backup/merge',merge)).inserted.tasks,1);assert.equal((await api('backup/merge',merge)).inserted.tasks,0);assert.equal((await api(`entries/member-1/${today}`)).summary,entry.summary);record('真实 D1 分段完整备份、校验预览、事务合并、重复恢复及防覆盖');
 if(process.env.PLAYWRIGHT_MODULE){
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);browser=await chromium.launch({headless:true,...(process.env.STUDY_BROWSER?{executablePath:process.env.STUDY_BROWSER}:{}),...(process.env.STUDY_TEST_PROXY?{proxy:{server:process.env.STUDY_TEST_PROXY}}:{})});
  const a=await browser.newContext(),b=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),p=await a.newPage(),q=await b.newPage(),errors=[];for(const page of [p,q]){page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());await page.goto(`${base}/#entry/member-1/${today}`);await page.locator('#summary').waitFor();assert.equal(await page.locator('#summary').inputValue(),entry.summary);}
  await p.locator('[data-add=done]').click();await p.locator('#task-subject').selectOption('运动');await p.locator('#task-text').fill(`${prefix} 云浏览器运动同步`);const savedResponse=p.waitForResponse(r=>r.request().method()==='PUT'&&r.url().includes('/api/tasks/'));await p.locator('#submit-task').click();const saved=await (await savedResponse).json();ownedIds.push(saved.id);await p.locator('#editor').waitFor({state:'hidden'});await q.locator('#refresh').click();await q.getByText(`${prefix} 云浏览器运动同步`,{exact:true}).waitFor();await q.reload();await q.getByText(`${prefix} 云浏览器运动同步`,{exact:true}).waitFor();assert.ok(await q.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));record('两个独立浏览器通过真实公网读写 D1、另一端同步、刷新持久化（非两台物理设备）');
  await p.getByRole('link',{name:'设置',exact:true}).click();await p.locator('#backup-panel').waitFor();const [jsonDownload]=await Promise.all([p.waitForEvent('download'),p.locator('#export-json').click()]);const file=JSON.parse(readFileSync(await jsonDownload.path(),'utf8'));assert.ok(file.tasks.some(t=>t.id===saved.id));const [csvDownload]=await Promise.all([p.waitForEvent('download'),p.locator('#export-csv').click()]);assert.deepEqual([...readFileSync(await csvDownload.path()).subarray(0,3)],[239,187,191]);assert.deepEqual(errors,[]);record('公网浏览器实际下载 JSON/CSV 分段备份，BOM 正确、无页面 JS 异常');
 }
 console.log(`CLOUD TEST: ${results.length} passed. Physical device/mainland/QQ acceptance still required.`);
}finally{
 if(browser)await browser.close();
 // Save exact owned IDs for the operator's reviewed cleanup, never delete
 // records blindly from a public API or clear an entire database here.
 if(process.env.STUDY_CLOUD_REPORT)writeFileSync(process.env.STUDY_CLOUD_REPORT,JSON.stringify({base,prefix,ownedIds,ownedEntries,results,today,initial},null,2));
}
