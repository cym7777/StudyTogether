import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {handleApi} from '../server/api.mjs';
import {openDatabase} from '../server/sqlite.mjs';
import {chinaDate,shiftDate,validDate,streak} from '../public/time.mjs';
import {DraftManager} from '../public/drafts.mjs';
const now=new Date('2026-10-11T08:00:00Z');
function fixture(t,file){const db=openDatabase(file);t.after(()=>db.close());return {db,async call(path,body,method='POST',at=now){const r=await handleApi(new Request(`https://study.example/api/${path}`,body===undefined?{}:{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),db,{now:at,storage:'test-sqlite'});return {status:r.status,data:await r.json()};}};}
const task=(extra={})=>({member_id:'member-1',date:'2026-10-11',kind:'done',text:'完成高数习题20道',subject:'数学',version:0,...extra});
test('中国日期、闰日、跨年和午夜边界',()=>{
 assert.equal(chinaDate(new Date('2026-10-10T15:59:59Z')),'2026-10-10');assert.equal(chinaDate(new Date('2026-10-10T16:00:00Z')),'2026-10-11');
 assert.equal(shiftDate('2027-01-01',-1),'2026-12-31');assert.equal(shiftDate('2024-03-01',-1),'2024-02-29');assert.equal(validDate('2026-02-30'),false);assert.equal(validDate('2026-13-01'),false);
});
test('连续天数从今天或昨天开始，缺一天中断，不计未来',()=>{
 assert.equal(streak(['2026-10-11','2026-10-10','2026-10-09'],'2026-10-11'),3);assert.equal(streak(['2026-10-10','2026-10-09'],'2026-10-11'),2);assert.equal(streak(['2026-10-09'],'2026-10-11'),0);assert.equal(streak(['2026-10-12'],'2026-10-11'),0);
});
test('恰好三人、初始数据为空，不创建虚构学习记录',async t=>{
 const {call}=fixture(t);const {data}=await call('home');assert.equal(data.members.length,3);assert.ok(data.members.every(m=>!m.checked&&m.tasks.length===0&&m.totalDays===0));assert.equal(data.settings.exam_date,null);assert.ok(data.subjects.some(s=>s.name==='运动'));
});
test('改名保持固定 ID 和历史；主题色、考试日期及自定义科目',async t=>{
 const {call}=fixture(t);await call('tasks/task-name',task(),'PUT');const m=await call('members/member-1',{name:'张三',color:'#abcdef',version:1},'PUT');assert.equal(m.status,200);assert.equal(m.data.id,'member-1');const h=await call('home');assert.equal(h.data.members[0].tasks.length,1);assert.equal(h.data.members[0].name,'张三');assert.equal((await call('members/member-1',{name:'旧设备',color:'#abcdef',version:1},'PUT')).status,409);
 assert.equal((await call('settings',{exam_date:'2026-12-20',version:1},'PUT')).status,200);assert.equal((await call('subjects',{name:'线性代数'})).status,200);assert.equal((await call('tasks/task-custom',task({subject:'线性代数'}),'PUT')).status,200);
 assert.equal((await call('tasks/task-exercise',task({subject:'运动',text:'跑步30分钟'}),'PUT')).status,200);assert.equal((await call('tasks/plan-exercise',task({subject:'运动',kind:'plan',text:'明天跳绳15分钟'}),'PUT')).status,200);
});
test('并发追加、网络重试均不覆盖或重复任务',async t=>{
 const {call}=fixture(t);const results=await Promise.all([call('tasks/task-aaaa',task(),'PUT'),call('tasks/task-bbbb',task({text:'背单词80个',subject:'英语'}),'PUT')]);assert.ok(results.every(r=>r.status===200));assert.equal((await call('tasks/task-aaaa',task(),'PUT')).status,200);assert.equal((await call('entries/member-1/2026-10-11')).data.tasks.length,2);
 assert.equal((await call('tasks/task-aaaa',task({text:'撞 ID 的新任务'}),'PUT')).status,409);
});
test('任务编辑、科目修改、陈旧版本拦截及修改历史',async t=>{
 const {call,db}=fixture(t);await call('tasks/task-edit',task(),'PUT');const edit=await call('tasks/task-edit',task({text:'修改为30道',subject:'英语',version:1}),'PUT');assert.equal(edit.status,200);assert.equal(edit.data.version,2);assert.equal((await call('tasks/task-edit',task({text:'旧设备覆盖',version:1}),'PUT')).status,409);
 const revision=db.raw.prepare("SELECT * FROM revisions WHERE entity='task'").get();assert.equal(JSON.parse(revision.before_json).text,'完成高数习题20道');
});
test('删除为软删除、可跨刷新恢复且不误删并发版本',async t=>{
 const {call}=fixture(t);await call('tasks/task-delete',task(),'PUT');const deleted=await call('tasks/task-delete/delete',{version:1});assert.equal(deleted.status,200);assert.equal((await call('home')).data.members[0].checked,false);assert.equal((await call('trash/member-1/2026-10-11')).data.length,1);assert.equal((await call('tasks/task-delete/restore',{version:1})).status,409);assert.equal((await call('tasks/task-delete/restore',{version:2})).status,200);assert.equal((await call('entries/member-1/2026-10-11')).data.tasks.length,1);
});
test('总结多段文字保存；空总结不计打卡；冲突不覆盖',async t=>{
 const {call,db}=fixture(t);assert.equal((await call('entries/member-1/2026-10-11',{summary:'',version:0},'PUT')).status,200);assert.equal((await call('home')).data.members[0].totalDays,0);const summary='理解了积分换元法。\n\n还需要复习错题。';await call('entries/member-1/2026-10-11',{summary,version:1},'PUT');assert.equal((await call('entries/member-1/2026-10-11',{summary:'另一个设备',version:1},'PUT')).status,409);assert.equal((await call('entries/member-1/2026-10-11')).data.summary,summary);assert.equal((await call('home')).data.members[0].totalDays,1);assert.ok(db.raw.prepare("SELECT count(*) n FROM revisions WHERE entity='summary'").get().n>=1);
});
test('昨日计划保留；用户确认后转次日完成；重复点击不重复',async t=>{
 const {call}=fixture(t);await call('tasks/plan-yesterday',task({date:'2026-10-10',kind:'plan',text:'复习错题'}),'PUT');let entry=(await call('entries/member-1/2026-10-11')).data;assert.equal(entry.previousPlans.length,1);assert.equal(entry.tasks.length,0);assert.equal((await call('tasks/plan-yesterday/complete',{date:'2026-10-11'})).status,200);assert.equal((await call('tasks/plan-yesterday/complete',{date:'2026-10-11'})).status,200);entry=(await call('entries/member-1/2026-10-11')).data;assert.equal(entry.tasks.length,1);assert.ok(entry.previousPlans[0].completed_id);assert.equal((await call('entries/member-1/2026-10-10')).data.tasks[0].kind,'plan');assert.equal((await call('tasks/plan-yesterday/complete',{date:'2026-10-10'})).status,400);
});
test('计划转换并发、完成任务删除后不能悄悄重新添加',async t=>{
 const {call}=fixture(t);await call('tasks/plan-concurrent',task({date:'2026-10-10',kind:'plan'}),'PUT');const results=await Promise.all([call('tasks/plan-concurrent/complete',{date:'2026-10-11'}),call('tasks/plan-concurrent/complete',{date:'2026-10-11'})]);assert.ok(results.every(r=>r.status===200));const done=results[0].data;await call(`tasks/${done.id}/delete`,{version:done.version});assert.equal((await call('tasks/plan-concurrent/complete',{date:'2026-10-11'})).status,409);assert.equal((await call(`tasks/${done.id}/restore`,{version:2})).status,200);
});
test('日历按月、时间线分页、历史日期可编辑',async t=>{
 const {call}=fixture(t);for(let i=0;i<40;i++)await call(`tasks/history-${String(i).padStart(2,'0')}`,task({date:shiftDate('2026-10-11',-i)}),'PUT');const page=(await call('history/member-1')).data;assert.equal(page.rows.length,32);const page2=(await call(`history/member-1?before=${page.next}`)).data;assert.equal(page2.rows.length,8);assert.equal(new Set([...page.rows,...page2.rows].map(r=>r.date)).size,40);const month=(await call('history/member-1?month=2026-10')).data;assert.equal(month.rows.length,11);assert.equal(month.rows[0].count,1);assert.equal((await call('entries/member-1/2026-10-01',{summary:'补充历史',version:0},'PUT')).status,200);
});
test('主页连续天数与删除变更均来自数据库',async t=>{
 const {call}=fixture(t);for(let i=0;i<3;i++)await call(`tasks/streak-${i}`,task({date:shiftDate('2026-10-11',-i)}),'PUT');let m=(await call('home')).data.members[0];assert.equal(m.totalDays,3);assert.equal(m.streak,3);await call('tasks/streak-1/delete',{version:1});m=(await call('home')).data.members[0];assert.equal(m.totalDays,2);assert.equal(m.streak,1);
});
test('两个独立请求客户端读取同一数据库；关库重开数据仍在（本地，非云端）',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'study-together-test-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const file=join(dir,'study.sqlite');const db=openDatabase(file);await handleApi(new Request('https://study.example/api/tasks/task-persist',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(task())}),db,{now});db.close();const {call}=fixture(t,file);assert.equal((await call('entries/member-1/2026-10-11')).data.tasks.length,1);assert.equal((await call('home')).data.members[0].tasks.length,1);
});
test('拒绝坏日期、未来打卡、非法成员及跨站修改',async t=>{
 const {call,db}=fixture(t);assert.equal((await call('entries/member-1/2026-02-30')).status,400);assert.equal((await call('entries/member-4/2026-10-11')).status,400);assert.equal((await call('tasks/task-future',task({date:'2026-10-12'}),'PUT')).status,400);const r=await handleApi(new Request('https://study.example/api/subjects',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{"name":"恶意"}'}),db,{now});assert.equal(r.status,403);
});
function memoryStore(){const data=new Map();return {data,async get(k){return data.get(k);},async put(k,v){data.set(k,structuredClone(v));},async remove(k){data.delete(k);}};}
test('离线总结不显示成功，刷新恢复草稿，重试后才清理草稿',async()=>{
 const store=memoryStore();let offline=true;const save=async(k,b)=>{if(offline)throw new Error('离线');return {...b,version:1};};let manager=new DraftManager(store,save);await manager.open('member-1:2026-10-11',{summary:'',version:0});manager.edit('member-1:2026-10-11','尚未提交的文字');await manager.flush('member-1:2026-10-11');assert.match(manager.states.get('member-1:2026-10-11').status,/保存失败/);manager=new DraftManager(store,save);const state=await manager.open('member-1:2026-10-11',{summary:'',version:0});assert.equal(state.text,'尚未提交的文字');offline=false;await manager.flush('member-1:2026-10-11');assert.equal(state.status,'已保存');assert.equal(store.data.size,0);
});
test('保存中继续输入不会丢失新文字，下一次以新版本追加保存',async()=>{
 const store=memoryStore();let release;const writes=[];const manager=new DraftManager(store,async(k,b)=>{writes.push(b);if(writes.length===1)await new Promise(r=>release=r);return {...b,version:writes.length};});const key='member-1:2026-10-11';await manager.open(key,{summary:'',version:0});manager.edit(key,'第一段');const saving=manager.flush(key);manager.edit(key,'第一段\n第二段');release();await saving;assert.equal(manager.states.get(key).dirty,true);assert.equal(store.data.get(key).text,'第一段\n第二段');await manager.flush(key);assert.equal(writes[1].version,1);assert.equal(writes[1].summary,'第一段\n第二段');assert.equal(manager.states.get(key).dirty,false);
});
test('总结并发冲突保留草稿，必须明确选择覆盖或使用云端内容',async()=>{
 const store=memoryStore();let conflict=true;const manager=new DraftManager(store,async(k,b)=>{if(conflict)throw Object.assign(new Error('冲突'),{status:409,current:{summary:'设备 B',version:2}});return {...b,version:3};});const key='member-1:2026-10-11';const s=await manager.open(key,{summary:'旧内容',version:1});manager.edit(key,'设备 A');await manager.flush(key);assert.equal(s.text,'设备 A');assert.equal(s.conflict.summary,'设备 B');conflict=false;await manager.resolve(key,true);assert.equal(s.version,3);assert.equal(s.text,'设备 A');assert.equal(s.dirty,false);
});
test('数据库异常不报告保存成功',async()=>{
 const bad={prepare(){throw new Error('模拟数据库不可用');}};const old=console.error;console.error=()=>{};try{const r=await handleApi(new Request('https://study.example/api/home'),bad,{now});assert.equal(r.status,503);assert.match((await r.json()).error,/失败/);}finally{console.error=old;}
});
