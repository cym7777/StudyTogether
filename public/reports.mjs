import {shiftDate} from './time.mjs';
const stopWords=new Set(['今天','今日','本周','学习','完成','进行','自己','可以','一个','内容','记录','明天','复习','理解','需要','继续','总结','计划','问题','还有','已经','部分','通过','开始','没有','这个','这些','我们']);
export function keywords(texts,limit=8) {
 const counts=new Map(),segmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter('zh-CN',{granularity:'word'}):null;
 for(const text of texts){const words=segmenter?[...segmenter.segment(text)].filter(s=>s.isWordLike).map(s=>s.segment):text.match(/[\p{L}]{2,}/gu)||[];
 for(const raw of words){const word=raw.toLowerCase();if(word.length<2||word.length>20||stopWords.has(word)||/^\d+$/.test(word))continue;counts.set(word,(counts.get(word)||0)+1);}}
 return [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'zh-CN')).slice(0,limit).map(([word,count])=>({word,count}));
}
export function buildWeekly(members,entries,tasks,active,start) {
 const dates=Array.from({length:7},(_,i)=>shiftDate(start,i)),end=dates[6];
 return {start,end,members:members.map(m=>{
  const mt=tasks.filter(t=>t.member_id===m.id),me=entries.filter(e=>e.member_id===m.id),days=dates.map(date=>({date,checked:active.some(a=>a.member_id===m.id&&a.date===date),tasks:mt.filter(t=>t.date===date&&t.kind==='done'),summary:me.find(e=>e.date===date)?.summary||''}));
  const done=mt.filter(t=>t.kind==='done'),subjects=new Map();for(const t of done)subjects.set(t.subject,(subjects.get(t.subject)||0)+1);
  const unresolved=me.flatMap(e=>e.summary.split(/[\n。！？!?]+/).filter(line=>/(?:未解决|不理解|没理解|疑问|困惑|需要|待复习|继续|不熟|薄弱)/.test(line)).map(text=>({date:e.date,text:text.trim()}))).filter(r=>r.text).slice(-12);
  const plans=mt.filter(t=>t.kind==='plan'),latest=plans.reduce((date,t)=>t.date>date?t.date:date,'');
  return {...m,days,checkedDays:days.filter(d=>d.checked).length,totalTasks:done.length,subjects:[...subjects].map(([name,count])=>({name,count})),keywords:keywords([...done.map(t=>`${t.subject} ${t.text}`),...me.map(e=>e.summary)]),nextFocus:{unresolved,plans:plans.filter(t=>t.date===latest),planDate:latest||null}};
 })};
}
export function shareText(member,date,record,dayNumber) {
 const list=kind=>record.tasks.filter(t=>t.kind===kind).map((t,i)=>`${i+1}. ${t.subject}：${t.text}`).join('\n')||'暂无';
 const [year,month,day]=date.split('-');
 return `考研打卡 Day ${dayNumber}\n\n成员：${member.name}\n日期：${year}年${Number(month)}月${Number(day)}日\n\n今日完成：\n${list('done')}\n\n今日收获：\n${record.summary?.trim()||'暂无'}\n\n明日计划：\n${list('plan')}`;
}
export function backupCsv(backup) {
 const rows=[['记录类型','成员ID','成员姓名','主题色','日期','任务ID','科目','内容','删除时间','来源计划ID','版本','修改时间']];
 const names=new Map(backup.members.map(m=>[m.id,m.name]));
 for(const m of backup.members)rows.push(['成员',m.id,m.name,m.color,'','','','','','',m.version,m.updated_at]);
 rows.push(['考试日期','','','',backup.settings.exam_date||'','','','','','',backup.settings.version,backup.settings.updated_at]);
 for(const s of backup.subjects)rows.push(['科目','','','','','',s.name,'','','','',s.created_at]);
 for(const e of backup.entries)rows.push(['总结',e.member_id,names.get(e.member_id),'',e.date,'','',e.summary,'','',e.version,e.updated_at]);
 for(const t of backup.tasks)rows.push([t.kind==='done'?'完成任务':'明日计划',t.member_id,names.get(t.member_id),'',t.date,t.id,t.subject,t.text,t.deleted_at||'',t.source_plan_id||'',t.version,t.updated_at]);
 for(const r of backup.revisions)rows.push([`修改历史:${r.entity}`,'','','','',r.entity_key,'',r.before_json,'','','',r.changed_at]);
 // Quote every field; neutralize spreadsheet formulas even after leading whitespace.
 const cell=value=>{let s=String(value??'');if(/^[\s\uFEFF]*[=+@-]/u.test(s)||/^[\t\r]/.test(s))s=`'${s}`;return `"${s.replaceAll('"','""')}"`;};
 return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
}
