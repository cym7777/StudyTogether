// Optional development helper. Generated PNGs are committed deliverables; users
// do not need Playwright or this script to run the application.
import {readFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.STUDY_BROWSER?{executablePath:process.env.STUDY_BROWSER}:{})});
try{
 const page=await browser.newPage(),svg=await readFile(new URL('../public/icon.svg',import.meta.url),'utf8');
 for(const size of [192,512]){await page.setViewportSize({width:size,height:size});await page.setContent(`<style>body{margin:0}svg{display:block;width:100vw;height:100vh}</style>${svg}`);await page.screenshot({path:new URL(`../public/icon-${size}.png`,import.meta.url).pathname});}
}finally{await browser.close();}
