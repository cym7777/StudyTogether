import {handleApi} from './api.mjs';
import {securityHeaders} from './headers.mjs';
export default {async fetch(request,env) {
 const response=new URL(request.url).pathname.startsWith('/api/')?await handleApi(request,env.DB):await env.ASSETS.fetch(request);
 const headers=new Headers(response.headers);
 for(const [name,value]of Object.entries(securityHeaders))headers.set(name,value);
 return new Response(response.body,{status:response.status,headers});
}};
