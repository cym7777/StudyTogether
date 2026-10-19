import {shiftDate} from './time.mjs';
import {cloudBackupBlob} from './backup-download.mjs';
export function createFeatures({api,app,getHome,getRoute,getToken,drafts,escape,toast}) {
 const alive=token=>token===getToken();
 const ensureSaved=async()=>{for(const [key,s]of drafts.states)if(s.dirty&&!s.conflict)await drafts.flush(key);if(drafts.hasPending())throw new Error('还有未保存的总结草稿，请先回到对应日期保存或处理冲突。');};
 const memberPicker=(id,page)=>`<div class="member-picker">${getHome().members.map(m=>`<a class="${m.id===id?'selected':''}" href="#${page}/${m.id}">${escape(m.name)}</a>`).join('')}</div>`;
 const subjectBars=subjects=>{const total=subjects.reduce((n,s)=>n+s.count,0);return subjects.length?subjects.map(s=>`<div class="subject-bar"><span>${escape(s.name)}</span><div class="bar-track"><div style="width:${100*s.count/total}%"></div></div><b>${s.count}</b></div>`).join(''):'<p class="empty">尚无完成任务。</p>';};
 async function renderStats(token) {
  const r=getRoute(),id=r.id,data=await api(`stats/${id}`);if(!alive(token))return;
  const m=getHome().members.find(m=>m.id===id),max=Math.max(1,...data.recent.map(d=>d.count));
  app.innerHTML=`${memberPicker(id,'stats')}<span class="eyebrow">用真实记录，看见积累</span><h1>${escape(m.name)}的学习统计</h1><a class="continue" href="#weekly/${id}">查看三人每周总结 →</a><div class="stat-grid">${[[data.totalDays,'累计打卡天数'],[data.streak,'连续打卡天数'],[data.longestStreak,'最长连续天数'],[data.totalTasks,'累计完成任务'],[data.weekTasks,'本周完成任务']].map(([value,label])=>`<div class="card stat-card"><strong>${value}</strong><span>${label}</span></div>`).join('')}</div><section class="panel"><h2>最近七天学习情况</h2><p class="muted">柱高表示完成任务数，● 表示当天有打卡。未完成计划不计入完成任务数量。</p><div class="activity-chart">${data.recent.map(d=>`<a href="#entry/${id}/${d.date}" class="activity-column" aria-label="${d.date} 完成${d.count}项 ${d.checked?'已打卡':'未打卡'}"><b>${d.count}</b><div class="activity-bar" style="height:${4+100*d.count/max}px"></div><small>${d.date.slice(5)}</small><span class="muted">${d.checked?'●':'○'}</span></a>`).join('')}</div></section><section class="panel"><h2>各科目完成任务分布</h2>${subjectBars(data.subjects)}</section><p class="muted">统计依据已保存、未删除的记录计算。运动与其他分类一样计入任务统计。</p>`;
 }
 async function renderWeekly(token) {
  const expanded=new Set([...app.querySelectorAll('.weekly-day[open]')].map(el=>el.dataset.date));
  const r=getRoute(),id=r.id,data=await api(`weekly?date=${r.date}`);if(!alive(token))return;
  const m=data.members.find(m=>m.id===id),next=shiftDate(data.start,7);
  app.innerHTML=`<span class="eyebrow">每周一回望，再向前一步</span><h1>每周学习总结</h1><div class="toolbar"><div><b>${data.start} ～ ${data.end}</b><p class="muted">周一至周日 · 按真实记录自动汇总</p></div><div class="date-controls"><a class="quiet week-link" href="#weekly/${id}/${shiftDate(data.start,-7)}">上一周</a>${next<=data.today?`<a class="quiet week-link" href="#weekly/${id}/${next}">下一周</a>`:''}<input type="date" id="week-date" aria-label="周报日期" value="${r.date}" max="${data.today}"><a class="quiet week-link" href="#weekly/${id}">本周</a></div></div><div class="grid">${data.members.map(member=>`<a class="card" href="#weekly/${member.id}/${r.date}"><h3>${escape(member.name)}</h3><p>本周打卡 <b>${member.checkedDays}</b> 天</p><p>完成 <b>${member.totalTasks}</b> 项任务</p></a>`).join('')}</div><h2>${escape(m.name)}的本周记录</h2><section class="panel"><h2>科目分布</h2>${subjectBars(m.subjects)}</section><section class="panel"><h2>本周每天的完成情况与总结</h2>${m.days.map(d=>`<details class="weekly-day"><summary>${d.date} · ${d.checked?'已打卡':'未打卡'} · 完成 ${d.tasks.length} 项</summary><ul>${d.tasks.map(t=>`<li>${escape(t.subject)}：${escape(t.text)}</li>`).join('')||'<li class="muted">暂无完成任务</li>'}</ul><p class="prewrap">${escape(d.summary||'暂无当日总结')}</p><a class="continue" href="#entry/${id}/${d.date}">查看完整记录 →</a></details>`).join('')}</section><section class="panel"><h2>本周学习关键词</h2><p>${m.keywords.map(k=>`<span class="tag">${escape(k.word)} · ${k.count}</span>`).join(' ')||'<span class="muted">记录还不足以提取关键词。</span>'}</p><p class="muted">从完成任务和每日总结中按词频提取，仅作为回顾线索。</p></section><section class="panel"><h2>下周需要继续关注</h2><h3>总结中提到的疑问与待复习内容</h3><ul>${m.nextFocus.unresolved.map(item=>`<li>${item.date}：${escape(item.text)}</li>`).join('')||'<li class="muted">没有找到明确的待关注句子，可在每日总结中记录疑问。</li>'}</ul><h3>${m.nextFocus.planDate?`本周最后一次制定的计划（${m.nextFocus.planDate}）`:'计划线索'}</h3><ul>${m.nextFocus.plans.map(t=>`<li>${escape(t.subject)}：${escape(t.text)}</li>`).join('')||'<li class="muted">暂无计划。</li>'}</ul><p class="muted">这里只摘录原记录，不推断问题是否已经解决，也不会自动创建下周任务。</p></section>`;
  document.querySelector('#week-date').onchange=e=>{if(e.target.value)location.hash=`weekly/${id}/${e.target.value}`;};
  app.querySelectorAll('.weekly-day').forEach((el,i)=>{const date=m.days[i].date;el.dataset.date=date;if(expanded.has(date))el.open=true;if(date>data.today){el.querySelector('.continue')?.remove();el.querySelector('summary').textContent=`${date} · 尚未到来`;}});
 }
 async function openShare(r,button) {
  button.disabled=true;const token=getToken();
  try{await ensureSaved();const data=await api(`share/${r.id}/${r.date}`);if(!alive(token))return;document.querySelector('#share-text').value=data.text;document.querySelector('#copy-status').textContent='';document.querySelector('#share-dialog').showModal();}catch(e){toast(e.message);}finally{button.disabled=false;}
 }
 document.querySelector('#close-share').onclick=()=>document.querySelector('#share-dialog').close();
 document.querySelector('#copy-share').onclick=async()=>{
  const text=document.querySelector('#share-text'),status=document.querySelector('#copy-status');
  try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text.value);else{text.focus();text.select();if(!document.execCommand('copy'))throw new Error('复制不可用');}status.textContent='已复制，可以粘贴到 QQ 群。';}
  catch{status.textContent='浏览器未允许自动复制，请长按文字或全选后手动复制。';text.focus();text.select();}
 };
 async function download(format,onProgress) {
  await ensureSaved();const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try{let blob;if(getHome().storage==='cloud-d1'){clearTimeout(timer);blob=await cloudBackupBlob(api,format,onProgress);}else{const response=await fetch(`/api/backup/${format}`,{cache:'no-store',signal:controller.signal});if(!response.ok){const error=await response.json();throw new Error(error.error||'导出失败');}blob=await response.blob();}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`StudyTogether-${getHome().today}-${Date.now()}.${format}`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);return true;}finally{clearTimeout(timer);}
 }
 function renderBackupControls() {
  const panel=document.createElement('section');panel.className='panel';panel.id='backup-panel';panel.innerHTML=`<h2>数据备份与恢复</h2><p class="muted">JSON 包含三名成员、所有日期、任务、总结、计划、分类、删除记录与修改历史。CSV 方便 Excel 查阅，恢复请使用 JSON。</p><div class="actions"><button id="export-json">导出完整 JSON</button><button id="export-csv" class="quiet">导出 Excel CSV</button></div><hr><h3>从 JSON 备份合并恢复</h3><p class="muted">只补回缺失任务和总结，保留已有记录，包括已有删除状态。请选择完整 JSON 备份，最多 16 MB。</p><label>选择备份文件<input type="file" id="backup-file" accept=".json,application/json"></label><button id="preview-backup" class="quiet">检查并预览备份</button><div id="restore-preview"></div><p id="backup-status" role="status"></p>`;app.append(panel);
  let backup=null,preview=null,prepared=false;
  const status=message=>{if(panel.isConnected)panel.querySelector('#backup-status').textContent=message;};
  for(const format of ['json','csv'])panel.querySelector(`#export-${format}`).onclick=async e=>{e.target.disabled=true;try{await download(format,status);status(`已生成 ${format.toUpperCase()} 下载，请确认文件已保存到电脑。`);if(format==='json')prepared=true;}catch(error){status(`导出失败：${error.message}`);}finally{e.target.disabled=false;}};
  panel.querySelector('#backup-file').onchange=()=>{backup=null;preview=null;panel.querySelector('#restore-preview').replaceChildren();status('');};
  panel.querySelector('#preview-backup').onclick=async e=>{
   const button=e.target;button.disabled=true;try{
    await ensureSaved();const file=panel.querySelector('#backup-file').files[0];if(!file)throw new Error('请先选择 JSON 文件');if(file.size>16*1024*1024)throw new Error('备份超过 16 MB，请保留文件并使用数据库迁移方法恢复');
    try{backup=JSON.parse(await file.text());}catch{throw new Error('文件不是有效 JSON');}
    status('正在检查备份…');preview=await api('backup/preview',{backup});if(!panel.isConnected)return;
    panel.querySelector('#restore-preview').innerHTML=`<div class="restore-box"><h3>恢复预览</h3><p>可补回 ${preview.missingEntries} 条总结、${preview.missingTasks} 条任务。</p><p>已有 ${preview.existingEntries} 条总结、${preview.existingTasks} 条任务会保留，不被备份覆盖。</p><p>备份包含 ${preview.revisionCount} 条修改历史。</p><p>备份成员：${preview.members.map(m=>escape(m.name)).join('、')}；考试日期：${preview.exam_date||'未设置'}。</p><label class="check-label"><input id="restore-profiles" type="checkbox"> 同时恢复上述成员姓名、颜色和考试日期（会修改当前设置）</label><label class="check-label"><input id="restore-backed-up" type="checkbox"> 我已导出完整 JSON，并确认当前数据备份已保存</label><label>输入“合并恢复”以确认<input id="restore-confirmation" placeholder="合并恢复" autocomplete="off"></label><button id="merge-backup" class="danger">确认合并恢复</button></div>`;
    status('检查通过。先导出当前 JSON 备份并保存，再确认恢复。');
    panel.querySelector('#merge-backup').onclick=async event=>{
     const mergeButton=event.target;if(!prepared||!panel.querySelector('#restore-backed-up').checked){status('请先点击“导出完整 JSON”，确认文件已保存后勾选备份确认。');return;}
     if(panel.querySelector('#restore-confirmation').value!=='合并恢复'){status('请输入完整的“合并恢复”四个字。');return;}
     if(!confirm('确认合并恢复？已有任务和总结会保留；如勾选恢复设置，成员和考试设置可能改变。'))return;
     mergeButton.disabled=true;try{await ensureSaved();status('正在合并，请保持页面开启…');const result=await api('backup/merge',{backup,fingerprint:preview.fingerprint,confirmation:'合并恢复',restoreProfiles:panel.querySelector('#restore-profiles').checked,profileVersions:preview.profileVersions,settingsVersion:preview.settingsVersion},'POST',60000);status(`合并完成：补回 ${result.inserted.entries} 条总结、${result.inserted.tasks} 条任务、${result.inserted.subjects} 个科目、${result.inserted.revisions} 条历史；更新 ${result.inserted.profiles} 项成员/考试设置。已有记录保留。请刷新页面。`);panel.querySelector('#restore-preview').replaceChildren();}
     catch(error){status(`恢复未确认成功：${error.message}。保留备份文件；刷新检查后可重新预览，重复合并不会覆盖已有任务和总结。`);}finally{mergeButton.disabled=false;}
    };
   }catch(error){status(`检查失败：${error.message}`);}finally{button.disabled=false;}
  };
 }
 return {renderStats,renderWeekly,renderBackupControls,openShare};
}
