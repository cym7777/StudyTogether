import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import {handleApi} from './api.mjs';
import {openDatabase} from './sqlite.mjs';
import {securityHeaders} from './headers.mjs';
const root=fileURLToPath(new URL('../public/',import.meta.url));
const data=process.env.STUDY_DATA_DIR||fileURLToPath(new URL('../data/',import.meta.url));mkdirSync(data,{recursive:true});
const db=openDatabase(resolve(data,'study.sqlite'));
const port=Number(process.env.STUDY_PORT||8787),host=process.env.STUDY_HOST||'127.0.0.1';
const server=createServer(async(req,res)=>{
 try {
 const url=new URL(req.url,`http://${req.headers.host}`);
 if(url.pathname.startsWith('/api/')) {
  const chunks=[];let bytes=0;const limit=url.pathname.startsWith('/api/backup/')?16*1024*1024:100000;for await(const chunk of req){bytes+=chunk.length;if(bytes>limit){res.writeHead(413,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:'备份或请求太大'}));return;}chunks.push(chunk);}
  const response=await handleApi(new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})}),db,{storage:'local-sqlite'});
  res.writeHead(response.status,{...securityHeaders,...Object.fromEntries(response.headers)});res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 const path=resolve(root,`.${decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname)}`);
 if(!path.startsWith(root)){res.writeHead(403);res.end();return;}
 const body=await readFile(path),type={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.png':'image/png'}[extname(path)]||'application/octet-stream';
 res.writeHead(200,{...securityHeaders,'Content-Type':type,'Cache-Control':'no-cache'});res.end(body);
 }catch {res.writeHead(404);res.end('未找到页面');}
});
const localUrl=`http://${host}:${port}`;
function openBrowser() {
 if(process.env.STUDY_OPEN_BROWSER==='1' && process.platform==='darwin') {
  const opener=spawn('open',[localUrl],{stdio:'ignore'});
  opener.on('error',()=>console.log(`自动打开浏览器失败，请手动访问 ${localUrl}`));
 }
}
server.on('error',async error=>{
 if(error.code==='EADDRINUSE') {
  try {const response=await fetch(`${localUrl}/api/home`,{signal:AbortSignal.timeout(2000)});const data=await response.json();if(response.ok && data.storage==='local-sqlite' && data.members?.length===3){console.log(`自习室已经启动，正在打开 ${localUrl}`);openBrowser();db.close();return;}}catch{}
  console.error(`端口 ${port} 已被其他程序占用。请关闭占用该端口的程序后再启动。`);
 } else console.error(`启动失败：${error.message}`);
 db.close();process.exitCode=1;
});
server.listen(port,host,()=>{console.log(`StudyTogether local preview: ${localUrl} (SQLite 本地预览，非云端)`);openBrowser();});
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
