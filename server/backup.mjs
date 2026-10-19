import {validDate,shiftDate} from '../public/time.mjs';
import {Problem,requireValue} from './errors.mjs';
const ids=['member-1','member-2','member-3'];
const string=(s,max,empty=false)=>typeof s==='string'&&s.length<=max&&(empty||s.trim().length>0);
const timestamp=s=>string(s,50)&&Number.isFinite(Date.parse(s));
const revision=v=>Number.isSafeInteger(v)&&v>=1;
export function validateBackup(b,today) {
 requireValue(b&&b.format==='StudyTogether'&&b.schema_version===1&&b.timezone==='Asia/Shanghai','不是兼容的 StudyTogether JSON 备份');
 for(const key of ['members','subjects','entries','tasks','revisions'])requireValue(Array.isArray(b[key])&&b[key].length<=100000&&b[key].every(row=>row&&typeof row==='object'&&!Array.isArray(row)),`备份 ${key} 无效或过大`);
 requireValue(b.members.length===3&&new Set(b.members.map(m=>m.id)).size===3,'备份必须包含三名固定成员');
 for(const m of b.members)requireValue(ids.includes(m.id)&&string(m.name,30)&&/^#[a-fA-F0-9]{6}$/.test(m.color)&&revision(m.version)&&timestamp(m.updated_at),'备份成员数据无效');
 requireValue(b.settings&&b.settings.id===1&&(b.settings.exam_date===null||validDate(b.settings.exam_date))&&revision(b.settings.version)&&timestamp(b.settings.updated_at),'备份考试设置无效');
 const subjects=new Set();for(const s of b.subjects){requireValue(s&&string(s.name,20)&&timestamp(s.created_at)&&!subjects.has(s.name),'备份科目无效或重复');subjects.add(s.name);}
 const entries=new Set();for(const e of b.entries){const key=`${e.member_id}:${e.date}`;requireValue(ids.includes(e.member_id)&&validDate(e.date)&&e.date<=today&&string(e.summary,20000,true)&&revision(e.version)&&timestamp(e.updated_at)&&!entries.has(key),'备份总结无效或重复');entries.add(key);}
 const tasks=new Map(),pairs=new Set();for(const t of b.tasks){requireValue(t&&typeof t.id==='string'&&/^[a-zA-Z0-9-]{8,160}$/.test(t.id)&&(t.kind!=='plan'||t.id.length<=80)&&!tasks.has(t.id)&&ids.includes(t.member_id)&&validDate(t.date)&&t.date<=today&&['done','plan'].includes(t.kind)&&subjects.has(t.subject)&&string(t.text,1000)&&revision(t.version)&&timestamp(t.created_at)&&timestamp(t.updated_at)&&(t.deleted_at===null||timestamp(t.deleted_at))&&(t.source_plan_id===null||string(t.source_plan_id,160)),'备份任务无效或重复');tasks.set(t.id,t);}
 for(const t of b.tasks)if(t.source_plan_id){const p=tasks.get(t.source_plan_id),pair=`${t.source_plan_id}:${t.date}`;requireValue(p&&p.kind==='plan'&&t.kind==='done'&&p.member_id===t.member_id&&shiftDate(p.date,1)===t.date&&!pairs.has(pair),'备份的计划转换关联无效');pairs.add(pair);}
 for(const r of b.revisions){requireValue(r&&['task','summary','member','settings'].includes(r.entity)&&string(r.entity_key,200)&&string(r.before_json,100000)&&timestamp(r.changed_at),'备份修改历史无效');try{const value=JSON.parse(r.before_json);requireValue(value&&typeof value==='object'&&!Array.isArray(value),'修改历史内容无效');}catch{throw new Problem(400,'备份修改历史不是有效 JSON');}}
 return b;
}
export async function fingerprint(b){const bytes=new TextEncoder().encode(JSON.stringify(b));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export async function exportBackup(db,stamp) {
 const tables=['members','settings','subjects','entries','tasks','revisions'];
 const results=await db.batch(tables.map(table=>db.prepare(`SELECT * FROM ${table} ORDER BY ${table==='members'?'id':table==='settings'?'id':table==='subjects'?'name':table==='entries'?'member_id,date':table==='tasks'?'id':'id'}`)));
 const data=Object.fromEntries(tables.map((table,i)=>[table,results[i].results]));data.settings=data.settings[0];
 return {format:'StudyTogether',schema_version:1,timezone:'Asia/Shanghai',exported_at:stamp,...data};
}
export async function exportSegment(db,params,stamp){
 const table=params.get('table'),revision=params.get('revision'),after=Number(params.get('after')||0);
 if(table==='manifest'){const state=await db.prepare('SELECT revision FROM sync_state WHERE id=1').first();return {format:'StudyTogether',schema_version:1,timezone:'Asia/Shanghai',exported_at:stamp,revision:state.revision};}
 requireValue(['members','settings','subjects','entries','tasks','revisions'].includes(table),'备份分段类型无效');requireValue(revision!==null&&/^\d+$/.test(revision)&&Number.isSafeInteger(Number(revision))&&Number.isSafeInteger(after)&&after>=0,'备份游标无效');
 const limit=['entries','revisions'].includes(table)?10:100;
 const [state,page]=await db.batch([db.prepare('SELECT revision FROM sync_state WHERE id=1'),db.prepare(`SELECT rowid AS _cursor,* FROM ${table} WHERE rowid>? ORDER BY rowid LIMIT ?`).bind(after,limit)]);
 if(state.results[0].revision!==Number(revision))throw new Problem(409,'导出期间记录发生变化，请在三人暂停修改时重新导出。未生成不一致备份。');
 const rows=page.results.map(({_cursor,...row})=>row);return {rows,next:page.results.length===limit?page.results.at(-1)._cursor:null};
}
export async function previewBackup(db,backup,stamp) {
 const current=await exportBackup(db,stamp),keys=new Set(current.entries.map(e=>`${e.member_id}:${e.date}`)),tasks=new Set(current.tasks.map(t=>t.id));
 const entryMissing=backup.entries.filter(e=>!keys.has(`${e.member_id}:${e.date}`)).length,taskMissing=backup.tasks.filter(t=>!tasks.has(t.id)).length;
 return {fingerprint:await fingerprint(backup),exported_at:backup.exported_at||null,missingEntries:entryMissing,missingTasks:taskMissing,existingEntries:backup.entries.length-entryMissing,existingTasks:backup.tasks.length-taskMissing,revisionCount:backup.revisions.length,subjects:backup.subjects.map(s=>s.name),members:backup.members.map(m=>({id:m.id,name:m.name,color:m.color})),exam_date:backup.settings.exam_date,profileVersions:Object.fromEntries(current.members.map(m=>[m.id,m.version])),settingsVersion:current.settings.version};
}
function chunks(rows) {
 const result=[];let chunk=[],bytes=2;
 for(const row of rows){const size=new TextEncoder().encode(JSON.stringify(row)).length+1;if(bytes+size>120000&&chunk.length){result.push(JSON.stringify(chunk));chunk=[];bytes=2;}chunk.push(row);bytes+=size;}
 if(chunk.length)result.push(JSON.stringify(chunk));return result;
}
export async function mergeBackup(db,b,options,stamp,storage) {
 requireValue(options.confirmation==='合并恢复','请明确确认合并恢复');
 requireValue(options.fingerprint===await fingerprint(b),'备份已变化，请重新预览');
 const jobs=[],types=[];
 // D1 meta.changes also counts trigger writes. RETURNING reports only the
 // statement's own affected rows, matching SQLite and avoiding inflated UI counts.
 const add=(type,sql,...args)=>{jobs.push(db.prepare(`${sql} RETURNING 1 AS changed`).bind(...args));types.push(type);};
 for(const chunk of chunks(b.subjects))add('subjects',"INSERT OR IGNORE INTO subjects(name,created_at) SELECT json_extract(value,'$.name'),json_extract(value,'$.created_at') FROM json_each(?)",chunk);
 for(const chunk of chunks(b.entries))add('entries',"INSERT OR IGNORE INTO entries(member_id,date,summary,version,updated_at) SELECT json_extract(value,'$.member_id'),json_extract(value,'$.date'),json_extract(value,'$.summary'),json_extract(value,'$.version'),json_extract(value,'$.updated_at') FROM json_each(?)",chunk);
 const columns=['id','member_id','date','kind','subject','text','version','created_at','updated_at','deleted_at','source_plan_id'];
 const insert=`INSERT OR IGNORE INTO tasks(${columns.join(',')}) SELECT ${columns.map(c=>`json_extract(j.value,'$.${c}')`).join(',')} FROM json_each(?) j`;
 for(const chunk of chunks(b.tasks.filter(t=>!t.source_plan_id)))add('tasks',insert,chunk);
 for(const chunk of chunks(b.tasks.filter(t=>t.source_plan_id)))add('tasks',`${insert} WHERE EXISTS(SELECT 1 FROM tasks p WHERE p.id=json_extract(j.value,'$.source_plan_id') AND p.kind='plan' AND p.member_id=json_extract(j.value,'$.member_id') AND date(p.date,'+1 day')=json_extract(j.value,'$.date'))`,chunk);
 for(const chunk of chunks(b.revisions))add('revisions',"INSERT INTO revisions(entity,entity_key,before_json,changed_at) SELECT DISTINCT json_extract(j.value,'$.entity'),json_extract(j.value,'$.entity_key'),json_extract(j.value,'$.before_json'),json_extract(j.value,'$.changed_at') FROM json_each(?) j WHERE NOT EXISTS(SELECT 1 FROM revisions r WHERE r.entity=json_extract(j.value,'$.entity') AND r.entity_key=json_extract(j.value,'$.entity_key') AND r.before_json=json_extract(j.value,'$.before_json') AND r.changed_at=json_extract(j.value,'$.changed_at'))",chunk);
 if(options.restoreProfiles===true){
  for(const m of b.members){requireValue(revision(options.profileVersions?.[m.id]),'请重新预览成员设置');add('profiles','UPDATE members SET name=?,color=?,version=version+1,updated_at=? WHERE id=? AND version=? AND (name<>? OR color<>?)',m.name,m.color,stamp,m.id,options.profileVersions[m.id],m.name,m.color);}
  requireValue(revision(options.settingsVersion),'请重新预览考试设置');add('profiles','UPDATE settings SET exam_date=?,version=version+1,updated_at=? WHERE id=1 AND version=? AND exam_date IS NOT ?',b.settings.exam_date,stamp,options.settingsVersion,b.settings.exam_date);
 }
 // Keep a single transaction. Large cloud imports are deliberately refused, never partly applied.
 if(storage==='cloud-d1'&&jobs.length>40)throw new Problem(413,'此备份超出当前云端单次安全恢复规模。请保留 JSON，使用本地版本恢复后再迁移；没有写入任何数据。');
 const results=await db.batch(jobs),counts={subjects:0,entries:0,tasks:0,revisions:0,profiles:0};
 results.forEach((r,i)=>counts[types[i]]+=r.results?.length||0);
 return {inserted:counts,preservedExisting:true,message:'合并完成。已有任务和总结保持不变；成员/考试设置仅在勾选且版本未变化时更新。'};
}
