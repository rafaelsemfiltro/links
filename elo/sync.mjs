// Account-scoped durable queue. Never imports the old unscoped browser cache.
export function applyOperation(input,op){
 const data=structuredClone(input||{});data.clients=Array.isArray(data.clients)?data.clients:[];data.templates=data.templates||{};
 if(op.kind==='add'){if(!data.clients.some(c=>c.id===op.client.id))data.clients.push(op.client);}
 else if(op.kind==='delete')data.clients=data.clients.filter(c=>c.id!==op.id);
 else if(op.kind==='template'){const old=data.templates[op.id];data.templates[op.id]={...(typeof old==='string'?{text:old,media:''}:old||{}),...op.patch};}
 else{const c=data.clients.find(c=>c.id===op.id);if(c){if(op.kind==='patch')Object.assign(c,op.patch);if(op.kind==='step'){c.sent??={};c.skipped??={};delete c.sent[op.key];delete c.skipped[op.key];if(op.state!=='undo')c[op.state==='sent'?'sent':'skipped'][op.key]=op.date;}}}
 return data;
}
const openDB=()=>new Promise((resolve,reject)=>{const r=indexedDB.open('elo-sync-v1',1);r.onupgradeneeded=()=>{r.result.createObjectStore('queue',{keyPath:'key'});r.result.createObjectStore('cache');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
function transact(db,name,mode,fn){return new Promise((resolve,reject)=>{const tx=db.transaction(name,mode);let result;const r=fn(tx.objectStore(name));if(r)r.onsuccess=()=>result=r.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('aborted'));});}
export async function start(user,onChange){
 const db=await openDB(),uid=user.uid,firestore=firebase.firestore(),ref=firestore.collection('users').doc(uid);
 let stopped=false,baseline=await transact(db,'cache','readonly',s=>s.get(uid)),queue=[],busy=false,timer=null,unsub=null,state='loading',serverReady=false;
 let broadcast=typeof BroadcastChannel==='function'?new BroadcastChannel('elo-sync'):null;
 const result={pendingCount:0,enqueue,stop};
 async function reloadQueue(){queue=(await transact(db,'queue','readonly',s=>s.getAll())).filter(x=>x.uid===uid).sort((a,b)=>a.created-b.created||a.key.localeCompare(b.key));result.pendingCount=queue.length;}
 function emit(){if(stopped)return;let d=baseline||{clients:[],templates:{}};for(const item of queue)d=applyOperation(d,item.op);onChange({...d,ready:!!baseline},state);}
 function schedule(ms=1000){clearTimeout(timer);if(!stopped)timer=setTimeout(flush,ms);}
 async function enqueue(op){if(stopped||!baseline)throw new Error('Account unavailable');const record={uid,key:crypto.randomUUID(),created:Date.now(),op};await transact(db,'queue','readwrite',s=>s.add(record));await reloadQueue();state=navigator.onLine?'pending':'offline';emit();broadcast?.postMessage({uid});schedule(0);}
 async function flush(){if(stopped||busy)return;if(!navigator.onLine){state='offline';emit();return;}busy=true;
 try{await reloadQueue();while(queue.length&&!stopped){const item=queue[0];const receipt=ref.collection('syncReceipts').doc(item.key);
 // Receipt and data are committed atomically. Retrying after a crash cannot reapply an older edit.
 await firestore.runTransaction(async tx=>{const [ack,snap]=await Promise.all([tx.get(receipt),tx.get(ref)]);if(ack.exists)return;const d=applyOperation(snap.exists?snap.data():{},item.op);tx.set(ref,{clients:d.clients,templates:d.templates,eloUpdatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});tx.set(receipt,{committedAt:firebase.firestore.FieldValue.serverTimestamp()});});
 await transact(db,'queue','readwrite',s=>s.delete(item.key));await reloadQueue();broadcast?.postMessage({uid});}
 // Do not label saved until we have a server-confirmed snapshot and no pending queue.
 state=queue.length?'pending':serverReady?'saved':'loading';
 }catch(e){state=navigator.onLine?'error':'offline';schedule(10000);}finally{busy=false;emit();}}
 function online(){state=queue.length?'pending':'loading';emit();schedule(0);}function offline(){state='offline';emit();}
 function stop(){stopped=true;clearTimeout(timer);unsub?.();broadcast?.close();window.removeEventListener('online',online);window.removeEventListener('offline',offline);db.close();}
 await reloadQueue();state=!navigator.onLine?'offline':queue.length?'pending':'loading';emit();
 unsub=ref.onSnapshot({includeMetadataChanges:true},async snap=>{if(stopped)return;if(snap.metadata.fromCache&&!snap.exists)return;baseline=snap.exists?snap.data():{clients:[],templates:{}};serverReady=!snap.metadata.fromCache&&!snap.metadata.hasPendingWrites;try{await transact(db,'cache','readwrite',s=>s.put(baseline,uid));await reloadQueue();state=!navigator.onLine?'offline':queue.length?'pending':serverReady?'saved':'loading';emit();}catch{state='error';emit();}},()=>{state='error';emit();});
 window.addEventListener('online',online);window.addEventListener('offline',offline);
 if(broadcast)broadcast.onmessage=async e=>{if(e.data.uid===uid&&!stopped){await reloadQueue();emit();schedule(0);}};
 schedule(0);return result;
}
