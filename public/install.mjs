// Installation is only a shortcut. No service worker caches API responses or
// accepts writes offline; the existing IndexedDB summary draft stays explicit.
let promptEvent=null;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();promptEvent=event;document.querySelector('#install-app')?.removeAttribute('hidden');});
window.addEventListener('appinstalled',()=>{promptEvent=null;document.querySelector('#install-app')?.setAttribute('hidden','');});
export function renderInstallHelp(app){
 const section=document.createElement('section');section.className='panel install-help';
 section.innerHTML='<h2>添加到桌面</h2><p class="muted">Safari 使用“分享 → 添加到主屏幕”；Chrome 或 Edge 使用菜单中的安装/添加快捷方式。QQ 内置浏览器中请先选择“在浏览器中打开”。各浏览器支持情况不同。</p><button id="install-app" hidden>安装自习室快捷入口</button><p class="muted">这只是打开同一网址的快捷方式，仍需连接服务器。断网时不能新建任务；总结草稿保留不代表已保存。当前本地网址也不会因此变成云端网址。</p>';
 section.querySelector('button').hidden=!promptEvent;section.querySelector('button').onclick=async()=>{if(!promptEvent)return;const event=promptEvent;promptEvent=null;await event.prompt();section.querySelector('button').hidden=true;};app.append(section);
}
