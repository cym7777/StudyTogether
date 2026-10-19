import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {performance} from 'node:perf_hooks';
import {openDatabase} from '../server/sqlite.mjs';
import {handleApi} from '../server/api.mjs';
import worker from '../server/worker.mjs';
import {shiftDate} from '../public/time.mjs';
import {collectBackup,cloudBackupBlob} from '../public/backup-download.mjs';
const now=new Date('2026-10-11T08:00:00Z');
const task={member_id:'member-1',date:'2026-10-11',kind:'done',text:'运动拉伸',subject:'运动',version:0};
function fixture(t){const db=openDatabase();t.after(()=>db.close());return {db,async call(path,body,method='POST'){const response=await handleApi(new Request(`https://study.example/api/${path}`,body===undefined?{}:{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),db,{now});return {status:response.status,data:await response.json()};}};}
test('同步游标只读一个固定行，不返回记录；重试创建不会额外推进',async t=>{
 const {db,call}=fixture(t);let queries=[];const original=db.prepare;db.prepare=sql=>{queries.push(sql);return original(sql);};
 const first=(await call('sync')).data;assert.deepEqual(Object.keys(first).sort(),['revision','today']);assert.equal(queries.length,1);assert.match(queries[0],/sync_state WHERE id=1/);
 assert.equal((await call('tasks/sync-new-task',task,'PUT')).status,200);const next=(await call('sync')).data;assert.ok(next.revision>first.revision);
 await call('tasks/sync-new-task',task,'PUT');assert.equal((await call('sync')).data.revision,next.revision);
 const home=(await call('home')).data;assert.equal(home.revision,next.revision);assert.equal(home.members[0].tasks.length,1);
});
test('任务修改/删除/恢复、历史总结、姓名、日期、科目均推进游标',async t=>{
 const {call}=fixture(t);let previous=(await call('sync')).data.revision;
 for(const [path,body,method]of [['tasks/sync-edit-task',task,'PUT'],['tasks/sync-edit-task',{...task,version:1,text:'改成跑步'},'PUT'],['tasks/sync-edit-task/delete',{version:2}],['tasks/sync-edit-task/restore',{version:3}],['entries/member-2/2026-10-01',{summary:'补记总结',version:0},'PUT'],['members/member-2',{name:'新名称',color:'#abcdef',version:1},'PUT'],['settings',{exam_date:'2026-12-20',version:1},'PUT'],['subjects',{name:'拉伸'}]]){
  assert.equal((await call(path,body,method)).status,200);const revision=(await call('sync')).data.revision;assert.ok(revision>previous,path);previous=revision;
 }
});
test('事务失败同步游标也回滚；跨天无写入仍返回新中国日期',async t=>{
 const {db,call}=fixture(t),revision=(await call('sync')).data.revision;
 await assert.rejects(db.batch([db.prepare("INSERT INTO subjects VALUES('回滚分类','now')"),db.prepare('INSERT INTO missing_table VALUES(1)')]));
 assert.equal((await call('sync')).data.revision,revision);
 const response=await handleApi(new Request('https://study.example/api/sync'),db,{now:new Date('2026-10-11T16:00:00Z')});assert.equal((await response.json()).today,'2026-10-12');
});
test('从第二阶段旧库升级保留所有业务行；重开不重复迁移',t=>{
 const dir=mkdtempSync(join(tmpdir(),'study-upgrade-')),filename=join(dir,'study.sqlite');t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const old=new DatabaseSync(filename);old.exec('PRAGMA foreign_keys=ON; CREATE TABLE _local_migrations(name TEXT PRIMARY KEY)');
 for(const name of readdirSync(new URL('../migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')&&n<'0005').sort()){old.exec(readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'));old.prepare('INSERT INTO _local_migrations VALUES(?)').run(name);}
 old.exec("INSERT INTO entries VALUES('member-1','2026-10-01','原有总结',1,'now');INSERT INTO tasks(id,member_id,date,kind,subject,text,created_at,updated_at) VALUES('upgrade-old-task','member-1','2026-10-01','done','运动','原有运动','now','now')");
 const tables=['members','settings','subjects','entries','tasks','revisions','day_activity'],before=tables.map(name=>old.prepare(`SELECT * FROM ${name}`).all());old.close();
 let db=openDatabase(filename);assert.deepEqual(tables.map(name=>db.raw.prepare(`SELECT * FROM ${name}`).all()),before);db.close();db=openDatabase(filename);assert.equal(db.raw.prepare("SELECT count(*) n FROM _local_migrations WHERE name='0005_sync_revision.sql'").get().n,1);assert.equal(db.raw.prepare('SELECT revision FROM sync_state').get().revision,0);db.close();
});
test('一年真实数据规模：10,950 条任务、1,095 天，首页/统计/周报/搜索/备份可用',async t=>{
 const {db,call}=fixture(t),insert=db.raw.prepare('INSERT INTO tasks(id,member_id,date,kind,subject,text,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)');
 db.raw.exec('BEGIN');for(let day=0;day<365;day++)for(let member=1;member<=3;member++)for(let i=0;i<10;i++)insert.run(`scale-${member}-${day}-${i}`,`member-${member}`,shiftDate('2026-10-11',-day),'done',i%2?'数学':'运动',`任务 ${day} ${i}`,'now','now');db.raw.exec('COMMIT');
 const elapsed={};for(const path of ['sync','home','stats/member-1','weekly?date=2026-10-11','search/member-1?q=任务','backup/json']){const start=performance.now(),r=await call(path);elapsed[path]=Math.round((performance.now()-start)*100)/100;assert.equal(r.status,200,path);if(path==='home'){assert.equal(r.data.members[0].totalDays,365);assert.equal(r.data.members[0].streak,365);assert.equal(r.data.members[0].tasks.length,10);}if(path==='stats/member-1')assert.equal(r.data.totalTasks,3650);if(path==='backup/json')assert.equal(r.data.tasks.length,10950);}
 t.diagnostic(`本机参考耗时(ms)，非 D1 CPU 或云额度测量：${JSON.stringify(elapsed)}`);
});
test('Worker 共用入口为静态页与 API 设置安全头；不引入外部资源',async t=>{
 const {db}=fixture(t),env={DB:db,ASSETS:{fetch:async()=>new Response('<h1>静态页</h1>',{headers:{'Content-Type':'text/html'}})}};
 for(const path of ['/','/api/home']){const response=await worker.fetch(new Request(`https://study.example${path}`),env);assert.equal(response.status,200);assert.match(response.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');}
 const manifest=JSON.parse(readFileSync(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));assert.equal(manifest.display,'standalone');assert.ok(manifest.icons.some(icon=>icon.sizes==='512x512'));assert.equal(manifest.start_url,'/');
});
test('云端分段备份包含全部字段/历史与分页，无重复、不一致变动拒绝导出',async t=>{
 const {call}=fixture(t);for(let i=0;i<105;i++)await call(`tasks/segment-task-${i}`,{...task,text:`任务 ${i}`},'PUT');await call('entries/member-1/2026-10-11',{summary:'完整总结',version:0},'PUT');await call('tasks/segment-task-1/delete',{version:1});
 const api=async path=>{const result=await call(path);if(result.status!==200)throw new Error(result.data.error);return result.data;};
 const collected=await collectBackup(api),whole=(await call('backup/json')).data;for(const key of ['members','subjects','entries','tasks','revisions'])assert.deepEqual([...collected[key]].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),[...whole[key]].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));assert.deepEqual(collected.settings,whole.settings);assert.equal(collected.tasks.length,105);assert.equal(new Set(collected.tasks.map(t=>t.id)).size,105);assert.deepEqual([...new Uint8Array(await (await cloudBackupBlob(api,'csv')).arrayBuffer()).subarray(0,3)],[239,187,191]);
 let changed=false;await assert.rejects(collectBackup(async path=>{const result=await api(path);if(path.includes('table=tasks')&&!changed){changed=true;await call('subjects',{name:'导出时变动'});}return result;}),/记录发生变化/);
 assert.equal((await call('backup/segment?table=tasks&revision=0&after=-1')).status,400);assert.equal((await call('backup/segment?table=bad&revision=0')).status,400);
});
test('恢复计数不采用 D1 包含触发器写入的 meta.changes',async t=>{
 const source=fixture(t),target=fixture(t);await source.call('tasks/d1-trigger-count',task,'PUT');const backup=(await source.call('backup/json')).data,preview=(await target.call('backup/preview',{backup})).data;
 const batch=target.db.batch;target.db.batch=async jobs=>(await batch(jobs)).map(result=>({...result,meta:{changes:99}}));
 const result=await target.call('backup/merge',{backup,fingerprint:preview.fingerprint,confirmation:'合并恢复'});assert.equal(result.data.inserted.tasks,1);assert.equal(result.data.inserted.subjects,0);assert.equal(result.data.inserted.entries,0);
});
