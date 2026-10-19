// One-time, guarded setup step. Copies data; never deletes the local database.
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {collectBackup} from '../public/backup-download.mjs';
const cloud=process.env.STUDY_CLOUD_URL,filename=process.env.STUDY_MIGRATION_BACKUP;
assert.ok(cloud&&new URL(cloud).protocol==='https:'&&filename,'需要指定 HTTPS 云网址及备份文件位置');
async function api(path,body){const response=await fetch(`${cloud}/api/${path}`,{cache:'no-store',signal:AbortSignal.timeout(30000),...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const data=await response.json();assert.equal(response.status,200,`${path}: ${data.error||response.status}`);return data;}
const localResponse=await fetch('http://127.0.0.1:8787/api/backup/json',{signal:AbortSignal.timeout(15000)});assert.equal(localResponse.status,200);const backup=await localResponse.json();
mkdirSync(dirname(filename),{recursive:true});writeFileSync(filename,JSON.stringify(backup,null,2),{flag:'wx'});console.log('完整本地 JSON 已另存，不修改本地数据库。');
const before=await collectBackup(api);assert.equal(before.tasks.length,0,'云端非空，拒绝自动迁移；请使用设置页预览合并。');assert.equal(before.entries.length,0,'云端已有总结，拒绝自动迁移。');
const preview=await api('backup/preview',{backup});assert.equal(preview.missingTasks,backup.tasks.length);assert.equal(preview.missingEntries,backup.entries.length);
const result=await api('backup/merge',{backup,fingerprint:preview.fingerprint,confirmation:'合并恢复',restoreProfiles:true,profileVersions:preview.profileVersions,settingsVersion:preview.settingsVersion});
const after=await collectBackup(api);
for(const table of ['tasks','entries']){const key=row=>table==='tasks'?row.id:`${row.member_id}:${row.date}`;const current=new Map(after[table].map(row=>[key(row),row]));assert.equal(after[table].length,backup[table].length);for(const row of backup[table])assert.deepEqual(current.get(key(row)),row,`${table} 原记录必须完整一致`);}
for(const member of backup.members){const saved=after.members.find(m=>m.id===member.id);assert.equal(saved.name,member.name);assert.equal(saved.color,member.color);}assert.equal(after.settings.exam_date,backup.settings.exam_date);
for(const revision of backup.revisions)assert.ok(after.revisions.some(r=>r.entity===revision.entity&&r.entity_key===revision.entity_key&&r.before_json===revision.before_json&&r.changed_at===revision.changed_at));
console.log(JSON.stringify({migration:'verified',tasks:after.tasks.length,entries:after.entries.length,revisions:after.revisions.length,inserted:result.inserted}));
