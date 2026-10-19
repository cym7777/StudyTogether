import {weekStart,shiftDate,streak,longestStreak,validDate} from '../public/time.mjs';
import {buildWeekly,shareText,backupCsv} from '../public/reports.mjs';
import {exportBackup,exportSegment,validateBackup,previewBackup,mergeBackup} from './backup.mjs';
import {requireValue} from './errors.mjs';
export async function handleExtensions(c){
 const {url,path,method,body,db,today,stamp,json,member,day,all,one,stmt}=c;
 if(path[0]==='stats'&&path.length===2&&method==='GET'){
  const id=path[1];member(id);const start=weekStart(today),recentStart=shiftDate(today,-6);
  const [dates,totals,subjects,recent]=await Promise.all([
   all('SELECT date FROM active_days WHERE member_id=? AND date<=? ORDER BY date',id,today),
   one("SELECT count(*) total,sum(CASE WHEN date>=? THEN 1 ELSE 0 END) week FROM tasks WHERE member_id=? AND kind='done' AND deleted_at IS NULL AND date<=?",start,id,today),
   all("SELECT subject name,count(*) count FROM tasks WHERE member_id=? AND kind='done' AND deleted_at IS NULL AND date<=? GROUP BY subject ORDER BY count(*) DESC,subject",id,today),
   all("SELECT date,count(*) count FROM tasks WHERE member_id=? AND kind='done' AND deleted_at IS NULL AND date BETWEEN ? AND ? GROUP BY date",id,recentStart,today)
  ]);const checked=dates.map(d=>d.date);
  return json({today,totalDays:checked.length,streak:streak(checked,today),longestStreak:longestStreak(checked),totalTasks:totals.total,weekTasks:totals.week||0,subjects,recent:Array.from({length:7},(_,i)=>{const date=shiftDate(recentStart,i);return {date,checked:checked.includes(date),count:recent.find(r=>r.date===date)?.count||0};})});
 }
 if(path.join('/')==='weekly'&&method==='GET'){
  const date=url.searchParams.get('date')||today;day(date,today);const start=weekStart(date),end=shiftDate(start,6);
  const [members,entries,tasks,active]=await Promise.all([all('SELECT * FROM members ORDER BY id'),all('SELECT * FROM entries WHERE date BETWEEN ? AND ? ORDER BY date',start,end),all('SELECT * FROM tasks WHERE date BETWEEN ? AND ? AND deleted_at IS NULL ORDER BY date,created_at,id',start,end),all('SELECT member_id,date FROM active_days WHERE date BETWEEN ? AND ?',start,end)]);
  return json({...buildWeekly(members,entries,tasks,active,start),today});
 }
 if(path[0]==='search'&&path.length===2&&method==='GET'){
  const id=path[1];member(id);const q=(url.searchParams.get('q')||'').trim(),subject=url.searchParams.get('subject')||'',date=url.searchParams.get('date')||'',before=url.searchParams.get('before')||'';
  requireValue(q.length<=100&&subject.length<=20,'搜索条件太长');let filter='',args=[id];
  if(date){day(date,today);filter+=' AND a.date=?';args.push(date);}
  if(before){requireValue(validDate(before),'分页日期无效');filter+=' AND a.date<?';args.push(before);}
  if(subject){filter+=' AND EXISTS(SELECT 1 FROM tasks s WHERE s.member_id=a.member_id AND s.date=a.date AND s.deleted_at IS NULL AND s.subject=?)';args.push(subject);}
  if(q){filter+=" AND (instr(lower(coalesce(e.summary,'')),lower(?))>0 OR EXISTS(SELECT 1 FROM tasks k WHERE k.member_id=a.member_id AND k.date=a.date AND k.deleted_at IS NULL AND instr(lower(k.text||' '||k.subject),lower(?))>0))";args.push(q,q);}
  const rows=await all(`SELECT a.date,substr(coalesce(e.summary,''),1,160) summary,(SELECT count(*) FROM tasks t WHERE t.member_id=a.member_id AND t.date=a.date AND t.kind='done' AND t.deleted_at IS NULL) count,(SELECT group_concat(text,' · ') FROM (SELECT text FROM tasks t WHERE t.member_id=a.member_id AND t.date=a.date AND t.deleted_at IS NULL ORDER BY created_at LIMIT 3)) preview FROM active_days a LEFT JOIN entries e ON e.member_id=a.member_id AND e.date=a.date WHERE a.member_id=?${filter} ORDER BY a.date DESC LIMIT 32`,...args);
  return json({rows,next:rows.length===32?rows.at(-1).date:null});
 }
 if(path[0]==='share'&&path.length===3&&method==='GET'){
  const id=path[1],date=path[2];member(id);day(date,today);const [profile,entry,tasks,dayCount]=await Promise.all([one('SELECT * FROM members WHERE id=?',id),one('SELECT summary FROM entries WHERE member_id=? AND date=?',id,date),all('SELECT * FROM tasks WHERE member_id=? AND date=? AND deleted_at IS NULL ORDER BY created_at,id',id,date),one('SELECT count(*) n FROM active_days WHERE member_id=? AND date<=?',id,date)]);
  return json({text:shareText(profile,date,{summary:entry?.summary||'',tasks},dayCount.n),dayNumber:dayCount.n});
 }
 if(path[0]==='backup'&&path.length===2){
  if(method==='GET'&&path[1]==='segment')return json(await exportSegment(db,url.searchParams,stamp));
  if(method==='GET'&&['json','csv'].includes(path[1])){
   const b=await exportBackup(db,stamp),filename=`StudyTogether-${today}.${path[1]}`;
   return new Response(path[1]==='json'?JSON.stringify(b,null,2):backupCsv(b),{headers:{'Content-Type':path[1]==='json'?'application/json; charset=utf-8':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${filename}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }
  if(method==='POST'&&['preview','merge'].includes(path[1])){
   const b=validateBackup(body.backup,today);
   if(path[1]==='preview')return json(await previewBackup(db,b,stamp));
   return json(await mergeBackup(db,b,body,stamp,c.storage));
  }
 }
 return null;
}
