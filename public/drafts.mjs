// IndexedDB holds only unsubmitted summary drafts, never the authoritative records.
export function indexedDraftStore() {
 const ready=new Promise((resolve,reject)=>{const r=indexedDB.open('study-together-drafts',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 const tx=async(mode,key,value)=>{const db=await ready;return new Promise((resolve,reject)=>{const t=db.transaction('drafts',mode),s=t.objectStore('drafts');let r=mode==='readonly'?s.get(key):value===undefined?s.delete(key):s.put(value,key);t.oncomplete=()=>resolve(r.result);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});};
 return {get:key=>tx('readonly',key),put:(key,v)=>tx('readwrite',key,v),remove:key=>tx('readwrite',key)};
}
export class DraftManager {
 constructor(store,save,onChange=()=>{}) {this.store=store;this.save=save;this.onChange=onChange;this.states=new Map();this.writes=new Map();}
 persist(key,value) {const promise=(this.writes.get(key)||Promise.resolve()).catch(()=>{}).then(()=>value===undefined?this.store.remove(key):this.store.put(key,value));this.writes.set(key,promise);return promise;}
 async open(key,remote) {
  if(this.states.has(key)) {this.sync(key,remote);return this.states.get(key);}
  let draft;try {draft=await this.store.get(key);}catch { /* volatile draft: explicit warning below */ }
  const state=draft?{...draft,dirty:true,status:'待重试',remote}:{text:remote.summary,version:remote.version,dirty:false,status:'已保存',remote};
  this.states.set(key,state);return state;
 }
 sync(key,remote) {const s=this.states.get(key);if(!s)return;s.remote=remote;if(!s.dirty && !s.inflight){s.text=remote.summary;s.version=remote.version;s.status='已保存';}}
 edit(key,text) {
  const s=this.states.get(key);s.text=text;s.dirty=true;s.conflict=null;s.status='待保存';
  this.persist(key,{text:s.text,version:s.version}).catch(()=>{s.status='草稿仅在当前页面，请勿关闭';this.onChange(key,s);});
  this.onChange(key,s);
 }
 async flush(key) {
  const s=this.states.get(key);if(!s||!s.dirty||s.conflict)return;
  if(s.inflight)return s.inflight;
  const text=s.text,base=s.version;s.status='保存中';this.onChange(key,s);
  const job=(async()=>{
   try {
    const saved=await this.save(key,{summary:text,version:base});s.version=saved.version;s.remote=saved;
    if(s.text===text){s.dirty=false;s.status='已保存';await this.persist(key,undefined);}
    else {s.status='待保存';await this.persist(key,{text:s.text,version:s.version});}
   }catch(e){s.status=e.status===409?'版本冲突，草稿已保留':'保存失败，草稿已保留';s.conflict=e.status===409?e.current:null;await this.persist(key,{text:s.text,version:s.version}).catch(()=>{s.status='保存失败，草稿仅在当前页面';});}
   finally{s.inflight=null;this.onChange(key,s);}
  })();s.inflight=job;return job;
 }
 async resolve(key,keepDraft) {
  const s=this.states.get(key);if(!s.conflict)return;
  if(!keepDraft){s.text=s.conflict.summary;s.dirty=false;s.status='已保存';await this.persist(key,undefined);}
  s.version=s.conflict.version;s.conflict=null;this.onChange(key,s);if(keepDraft)await this.flush(key);
 }
 hasPending(){return [...this.states.values()].some(s=>s.dirty);}
}
