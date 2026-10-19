import {backupCsv} from './reports.mjs';
// Cloud API requests stay small. A shared revision guards the whole export:
// never download a mixed-version file if any record changes midway through.
export async function collectBackup(api,onProgress=()=>{}){
 const {revision,...backup}=await api('backup/segment?table=manifest');
 for(const table of ['members','settings','subjects','entries','tasks','revisions']){
  const rows=[];let after=0;
  do{onProgress(`正在读取备份：${table}（已读取 ${rows.length} 条）`);const page=await api(`backup/segment?${new URLSearchParams({table,revision:String(revision),after:String(after)})}`);rows.push(...page.rows);after=page.next;}while(after!==null);
  backup[table]=table==='settings'?rows[0]:rows;
 }
 // Last check catches a change just after reading the final segment.
 const current=await api('backup/segment?table=manifest');if(current.revision!==revision)throw new Error('导出期间记录发生变化，请暂停修改后重新导出。');
 return backup;
}
export async function cloudBackupBlob(api,format,onProgress){const backup=await collectBackup(api,onProgress);return new Blob([format==='csv'?backupCsv(backup):JSON.stringify(backup,null,2)],{type:format==='csv'?'text/csv;charset=utf-8':'application/json;charset=utf-8'});}
