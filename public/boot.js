// Classic bootstrap can explain a file:// launch before ES modules or API calls fail.
document.querySelector('.skip-link').addEventListener('click',event=>{event.preventDefault();document.querySelector('#app').focus();});
if (location.protocol === 'file:') {
 document.querySelector('#app').innerHTML = '<section class="panel"><h1>请先启动自习室</h1><p>你打开的是网页源文件，无法连接学习数据库。</p><p>请回到 StudyTogether 文件夹，双击“启动本地预览.command”。启动成功后，会自动打开可使用的网页。</p><p>请保持启动终端开启，关闭终端会停止服务，已经保存的记录仍会保留。</p><a id="open-local" class="continue" href="http://127.0.0.1:8787">已经启动？点击进入自习室 →</a></section>';
 document.querySelector('.bottom').hidden = true;
 document.querySelector('#refresh').hidden = true;
} else {
 import('./app.mjs').catch(() => {
  document.querySelector('#app').textContent = '页面程序加载失败，请刷新页面后重试。请通过启动脚本打开，不要直接双击 index.html。';
 });
}
