// Safe for a used room: no mutations. Optional screenshot uses existing Chrome.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {collectBackup} from '../public/backup-download.mjs';
import {streak} from '../public/time.mjs';
const base=process.env.STUDY_CLOUD_URL;
assert.ok(base&&new URL(base).protocol==='https:','指定 STUDY_CLOUD_URL');
async function api(path){for(let attempt=0;;attempt++){try{const r=await fetch(`${base}/api/${path}`,{cache:'no-store',signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);return await r.json();}catch(error){if(attempt>=2)throw error;}}}
const home=await api('home');assert.equal(home.storage,'cloud-d1');assert.equal(home.members.length,3);
const backup=await collectBackup(api);
assert.ok(backup.subjects.some(s=>s.name==='运动'));
// Also verify derived daily counters against primary records, not only the backup.
for(const member of home.members){const dates=[...new Set([...backup.tasks.filter(t=>t.member_id===member.id&&!t.deleted_at).map(t=>t.date),...backup.entries.filter(e=>e.member_id===member.id&&e.summary.trim()).map(e=>e.date)])].sort();assert.equal(member.checked,dates.includes(home.today));assert.equal(member.totalDays,dates.length);assert.equal(member.streak,streak(dates,home.today));const stats=await api(`stats/${member.id}`);assert.equal(stats.totalDays,dates.length);assert.equal(stats.totalTasks,backup.tasks.filter(t=>t.member_id===member.id&&!t.deleted_at&&t.kind==='done').length);}
if(process.env.STUDY_COMPARE_BACKUP){const original=JSON.parse(readFileSync(process.env.STUDY_COMPARE_BACKUP,'utf8'));for(const table of ['tasks','entries'])for(const row of original[table])assert.deepEqual(backup[table].find(current=>table==='tasks'?current.id===row.id:current.member_id===row.member_id&&current.date===row.date),row,`${table} 原记录一致`);}
if(process.env.PLAYWRIGHT_MODULE){const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);const browser=await chromium.launch({headless:true,...(process.env.STUDY_BROWSER?{executablePath:process.env.STUDY_BROWSER}:{}),...(process.env.STUDY_TEST_PROXY?{proxy:{server:process.env.STUDY_TEST_PROXY}}:{})});try{const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.locator('.member-card').first().waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(process.env.STUDY_SCREENSHOT)await page.screenshot({path:process.env.STUDY_SCREENSHOT,fullPage:true});assert.deepEqual(errors,[]);}finally{await browser.close();}}
console.log(JSON.stringify({readonly:'passed',members:home.members.length,tasks:backup.tasks.length,entries:backup.entries.length,revisions:backup.revisions.length}));
