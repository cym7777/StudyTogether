import { chinaDate, shiftDate, validDate, streak } from '../public/time.mjs';
import {Problem,requireValue} from './errors.mjs';
import {handleExtensions} from './extensions.mjs';
const json = (data, status=200) => new Response(JSON.stringify(data), {status, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const member = id => requireValue(['member-1','member-2','member-3'].includes(id),'成员不存在');
const day = (date,today) => { requireValue(validDate(date),'日期无效'); requireValue(date<=today,'不能提前写入未来的打卡'); };
const textValue = (s,max,empty=false) => requireValue(typeof s==='string' && s.length<=max && (empty || s.trim().length>0),`请输入有效文字（最多 ${max} 字）`);
const version = v => requireValue(Number.isSafeInteger(v) && v>=0,'版本号无效');
export async function handleApi(request, db, {now=new Date(), storage='cloud-d1'}={}) {
 const url=new URL(request.url), path=url.pathname.split('/').filter(Boolean).slice(1), method=request.method, today=chinaDate(now), stamp=now.toISOString();
 const stmt=(sql,...args)=>db.prepare(sql).bind(...args);
 const all=async(sql,...args)=>(await stmt(sql,...args).all()).results;
 const one=async(sql,...args)=>stmt(sql,...args).first();
 const changed=async(s)=>Number((await s.run()).meta.changes);
 const conflict=async(current)=>{throw new Problem(409,'记录已被其他设备修改，请查看最新内容后重试',{current});};
 const getTask=async id=>one('SELECT * FROM tasks WHERE id=?',id);
 const getEntry=async(id,date)=>({...(await one('SELECT * FROM entries WHERE member_id=? AND date=?',id,date) || {member_id:id,date,summary:'',version:0,updated_at:null}),tasks:await all('SELECT * FROM tasks WHERE member_id=? AND date=? AND deleted_at IS NULL ORDER BY created_at,id',id,date)});
 try {
  if(method!=='GET') {
   const origin=request.headers.get('Origin'); if(origin && origin!==url.origin) throw new Problem(403,'不允许跨站修改');
   if(!request.headers.get('Content-Type')?.startsWith('application/json')) throw new Problem(415,'需要 JSON 请求');
   const raw=await request.text(); requireValue(new TextEncoder().encode(raw).length<=(path[0]==='backup'?16*1024*1024:100000),'请求太大');
   try { request.bodyData=JSON.parse(raw); } catch {throw new Problem(400,'JSON 无效');}
   requireValue(request.bodyData && typeof request.bodyData==='object' && !Array.isArray(request.bodyData),'JSON 必须为对象');
  }
  const b=request.bodyData;
  if(method==='GET' && path.join('/')==='sync') return json({today,revision:(await one('SELECT revision FROM sync_state WHERE id=1')).revision});
  const extension=await handleExtensions({url,path,method,body:b,db,today,stamp,storage,json,member,day,all,one,stmt});
  if(extension)return extension;
  if(method==='GET' && path.join('/')==='home') {
   // Include revision and data in the same snapshot: a concurrent change cannot
   // advance the client cursor past records it has not actually received.
   const snapshot=await db.batch([stmt('SELECT * FROM members ORDER BY id'),stmt('SELECT * FROM settings WHERE id=1'),stmt("SELECT * FROM tasks WHERE date=? AND kind='done' AND deleted_at IS NULL ORDER BY created_at,id",today),stmt('SELECT member_id,date FROM active_days WHERE date<=? ORDER BY date DESC',today),stmt('SELECT name FROM subjects ORDER BY rowid'),stmt('SELECT revision FROM sync_state WHERE id=1')]);
   const [members,settingsRows,tasks,active,subjects,state]=snapshot.map(r=>r.results);
   return json({today,storage,revision:state[0].revision,settings:settingsRows[0],subjects,members:members.map(m=>{const dates=active.filter(d=>d.member_id===m.id).map(d=>d.date);return {...m,checked:dates.includes(today),totalDays:dates.length,streak:streak(dates,today),tasks:tasks.filter(t=>t.member_id===m.id)};})});
  }
  if(path[0]==='members' && path.length===2 && method==='PUT') {
   member(path[1]);textValue(b.name,30);requireValue(/^#[a-fA-F0-9]{6}$/.test(b.color),'主题色无效');version(b.version);
   if(!await changed(stmt('UPDATE members SET name=?,color=?,version=version+1,updated_at=? WHERE id=? AND version=?',b.name.trim(),b.color,stamp,path[1],b.version))) await conflict(await one('SELECT * FROM members WHERE id=?',path[1]));
   return json(await one('SELECT * FROM members WHERE id=?',path[1]));
  }
  if(path[0]==='settings' && method==='PUT') {
   requireValue(b.exam_date===null || validDate(b.exam_date),'考试日期无效');version(b.version);
   if(!await changed(stmt('UPDATE settings SET exam_date=?,version=version+1,updated_at=? WHERE id=1 AND version=?',b.exam_date,stamp,b.version))) await conflict(await one('SELECT * FROM settings WHERE id=1'));
   return json(await one('SELECT * FROM settings WHERE id=1'));
  }
  if(path[0]==='subjects' && method==='POST') {
   textValue(b.name,20);await changed(stmt('INSERT OR IGNORE INTO subjects VALUES(?,?)',b.name.trim(),stamp));return json({name:b.name.trim()});
  }
  if(path[0]==='entries' && path.length===3) {
   const [_,id,date]=path;member(id);day(date,today);
   if(method==='GET') {
    const entry=await getEntry(id,date), previous=shiftDate(date,-1);
    const plans=await all("SELECT p.*,d.id AS completed_id,d.deleted_at AS completed_deleted FROM tasks p LEFT JOIN tasks d ON d.source_plan_id=p.id AND d.date=? WHERE p.member_id=? AND p.date=? AND p.kind='plan' AND p.deleted_at IS NULL ORDER BY p.created_at,p.id",date,id,previous);
    return json({...entry,previousPlans:plans,today});
   }
   if(method==='PUT') {
    textValue(b.summary,20000,true);version(b.version);
    let n=b.version===0 ? await changed(stmt('INSERT OR IGNORE INTO entries VALUES(?,?,?,1,?)',id,date,b.summary,stamp)) : await changed(stmt('UPDATE entries SET summary=?,version=version+1,updated_at=? WHERE member_id=? AND date=? AND version=?',b.summary,stamp,id,date,b.version));
    if(!n) {const current=await one('SELECT * FROM entries WHERE member_id=? AND date=?',id,date); if(current?.summary!==b.summary) await conflict(current);}
    return json(await one('SELECT * FROM entries WHERE member_id=? AND date=?',id,date));
   }
  }
  if(path[0]==='tasks' && path.length===2 && method==='PUT') {
   const id=path[1];requireValue(/^[a-zA-Z0-9-]{8,160}$/.test(id)&&(b.kind!=='plan'||id.length<=80),'任务 ID 无效');member(b.member_id);day(b.date,today);version(b.version);textValue(b.text,1000);textValue(b.subject,20);requireValue(['done','plan'].includes(b.kind),'任务类型无效');requireValue(await one('SELECT name FROM subjects WHERE name=?',b.subject),'科目不存在');
   if(b.version===0) {
    await changed(stmt('INSERT OR IGNORE INTO tasks(id,member_id,date,kind,subject,text,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',id,b.member_id,b.date,b.kind,b.subject,b.text.trim(),stamp,stamp));
    const t=await getTask(id);if(!t || t.member_id!==b.member_id || t.date!==b.date || t.kind!==b.kind || t.text!==b.text.trim() || t.subject!==b.subject || t.deleted_at) await conflict(t);return json(t);
   }
   if(!await changed(stmt('UPDATE tasks SET subject=?,text=?,version=version+1,updated_at=? WHERE id=? AND member_id=? AND date=? AND kind=? AND version=? AND deleted_at IS NULL',b.subject,b.text.trim(),stamp,id,b.member_id,b.date,b.kind,b.version))) await conflict(await getTask(id));return json(await getTask(id));
  }
  if(path[0]==='tasks' && path.length===3 && method==='POST' && ['delete','restore','complete'].includes(path[2])) {
   const task=await getTask(path[1]);if(!task) throw new Problem(404,'任务不存在');
   if(path[2]==='complete') {
    requireValue(task.kind==='plan' && !task.deleted_at,'计划不可用');requireValue(b.date===shiftDate(task.date,1) && b.date<=today,'计划仅能转为次日完成事项');
    const id=`done-${task.id}-${b.date}`;
    await changed(stmt("INSERT OR IGNORE INTO tasks(id,member_id,date,kind,subject,text,created_at,updated_at,source_plan_id) SELECT ?,member_id,?,'done',subject,text,?,?,id FROM tasks WHERE id=? AND deleted_at IS NULL",id,b.date,stamp,stamp,task.id));
    const done=await one('SELECT * FROM tasks WHERE source_plan_id=? AND date=?',task.id,b.date); if(!done || done.deleted_at) throw new Problem(409,'转换的任务已删除，请在回收区恢复');return json(done);
   }
   version(b.version);const deleting=path[2]==='delete';
   if(!await changed(stmt(`UPDATE tasks SET deleted_at=?,version=version+1,updated_at=? WHERE id=? AND version=? AND deleted_at IS ${deleting?'NULL':'NOT NULL'}`,deleting?stamp:null,stamp,task.id,b.version))) await conflict(await getTask(task.id));return json(await getTask(task.id));
  }
  if(path[0]==='trash' && path.length===3 && method==='GET') {member(path[1]);day(path[2],today);return json(await all('SELECT * FROM tasks WHERE member_id=? AND date=? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC',path[1],path[2]));}
  if(path[0]==='history' && path.length===2 && method==='GET') {
   const id=path[1];member(id);const month=url.searchParams.get('month'),before=url.searchParams.get('before');
   let filter='',args=[id];
   if(month) {requireValue(/^\d{4}-\d{2}$/.test(month) && validDate(`${month}-01`),'月份无效');filter=' AND a.date>=? AND a.date<?';const start=`${month}-01`,next=new Date(`${start}T00:00:00Z`);next.setUTCMonth(next.getUTCMonth()+1);args.push(start,next.toISOString().slice(0,10));}
   else if(before) {requireValue(validDate(before),'分页日期无效');filter=' AND a.date<?';args.push(before);}
   const rows=await all(`SELECT a.date,substr(coalesce(e.summary,''),1,160) AS summary,(SELECT count(*) FROM tasks t WHERE t.member_id=a.member_id AND t.date=a.date AND t.kind='done' AND t.deleted_at IS NULL) AS count,(SELECT group_concat(text,' · ') FROM (SELECT text FROM tasks t WHERE t.member_id=a.member_id AND t.date=a.date AND t.kind='done' AND t.deleted_at IS NULL ORDER BY created_at LIMIT 3)) AS preview FROM active_days a LEFT JOIN entries e ON e.member_id=a.member_id AND e.date=a.date WHERE a.member_id=?${filter} ORDER BY a.date DESC LIMIT 32`,...args);
   return json({rows,next:!month && rows.length===32?rows.at(-1).date:null});
  }
  throw new Problem(404,'接口不存在');
 } catch(e) { if(e instanceof Problem) return json({error:e.message,...e.extra},e.status);console.error('API failure',e);return json({error:'保存或读取失败，请保留草稿并重试'},503); }
}
