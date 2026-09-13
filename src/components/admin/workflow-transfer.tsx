'use client';
import {useEffect,useRef,useState} from 'react';
import {useClerk} from '@clerk/nextjs';
import {parseWorkflowReceipt,transferWorkflowArchive,type WorkflowTarget} from '@/lib/workflow-browser-transfer';

export type WorkflowDestination={id:string;title:string;scenes:{id:string;label:string}[]};
type Props={actorId:string;storageOrigin:string;destinations:WorkflowDestination[]};
type Session=(signal:AbortSignal)=>Promise<{actorId:string;token:string|null}>;
const labels:Record<string,string>={hashing:'データを検証中',resolving_target:'転送先を確認中',reserving:'転送を準備中',uploading:'アップロード中',verifying:'保存データを検証中',attaching:'下書きに登録中',attached:'下書きへの登録完了'};
export function WorkflowTransferPanel({actorId,storageOrigin,destinations,session}:Props&{session:Session}){
 const [propertyId,setProperty]=useState(''),[sceneId,setScene]=useState('');
 const [archive,setArchive]=useState<File|null>(null),[receiptFile,setReceiptFile]=useState<File|null>(null);
 const [phase,setPhase]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const active=useRef<AbortController|null>(null);
 useEffect(()=>()=>active.current?.abort(),[]);
 const property=destinations.find(p=>p.id===propertyId);
 async function transfer(){
  if(active.current||!archive||!receiptFile||!property||!property.scenes.some(s=>s.id===sceneId))return;
  const controller=new AbortController();active.current=controller;setBusy(true);setError('');setPhase('');
  try{
   if(receiptFile.size>32768)throw Error('検証情報のサイズが不正です。');
   const receipt=parseWorkflowReceipt(JSON.parse(await receiptFile.text()));
   if(!navigator.locks)throw Error('このブラウザーでは転送を開始できません。');
   const key=JSON.stringify(['locahun-workflow-v1',location.origin,actorId,receipt.archive.sha256,receipt.input.projectSha256,receipt.input.revision,propertyId,sceneId]);
   await navigator.locks.request(key,{mode:'exclusive',signal:controller.signal},async()=>{
    const saved=localStorage.getItem(key);
    if(saved&&saved.length>8192)throw Error('保存された転送情報が不正です。');
    const snapshot=saved?JSON.parse(saved) as WorkflowTarget:undefined;
    await transferWorkflowArchive({origin:location.origin,storageOrigin,actorId,ids:{propertyId,sceneId},archive,receipt,signal:controller.signal,snapshot,session,
     onTarget:target=>localStorage.setItem(key,JSON.stringify(target)),onProgress:setPhase});
   });
  }catch{setPhase('');setError(controller.signal.aborted?'転送を中止しました。':'転送を完了できませんでした。ログイン状態・転送先・選択ファイルを確認してください。');}
  finally{active.current=null;setBusy(false);}
 }
 const field='w-full min-w-0 border border-line bg-bg px-3 py-3 text-sm';
 return <section className="max-w-3xl space-y-6" aria-label="下書きデータ転送">
  <fieldset disabled={busy} className="grid grid-cols-1 sm:grid-cols-2 gap-5 min-w-0">
   <label className="min-w-0 space-y-2"><span>物件</span><select className={field} value={propertyId} onChange={e=>{setProperty(e.target.value);setScene('');setPhase('');}}><option value="">選択してください</option>{destinations.map(p=><option key={p.id} value={p.id}>{p.title} / {p.id}</option>)}</select></label>
   <label className="min-w-0 space-y-2"><span>シーン</span><select className={field} value={sceneId} onChange={e=>{setScene(e.target.value);setPhase('');}} disabled={!property||busy}><option value="">選択してください</option>{property?.scenes.map(s=><option key={s.id} value={s.id}>{s.label||s.id} / {s.id}</option>)}</select></label>
   <label className="min-w-0 space-y-2"><span>書き出しデータ（project.zip）</span><input className={field} type="file" accept=".zip" onChange={e=>{setArchive(e.target.files?.[0]||null);setPhase('');}}/></label>
   <label className="min-w-0 space-y-2"><span>検証情報（receipt.json）</span><input className={field} type="file" accept=".json" onChange={e=>{setReceiptFile(e.target.files?.[0]||null);setPhase('');}}/></label>
  </fieldset>
  <div className="flex flex-wrap items-center gap-3">
   <button type="button" onClick={()=>void transfer()} disabled={busy||!archive||!receiptFile||!sceneId} className="border border-accent px-5 py-3 text-accent disabled:opacity-40">下書きへ転送</button>
   {busy&&<button type="button" onClick={()=>active.current?.abort()} className="border border-line px-5 py-3">中止</button>}
  </div>
  {phase&&<p role="status">{labels[phase]||phase}</p>}
  {error&&<p role="alert" className="text-red-700 break-words">{error}</p>}
 </section>;
}
export default function WorkflowTransfer(props:Props){
 const clerk=useClerk();
 return <WorkflowTransferPanel {...props} session={async signal=>{
  signal.throwIfAborted();const current=clerk.session;
  if(!current||!current.user)throw Error('Administrative session unavailable');
  const token=await current.getToken({skipCache:true});signal.throwIfAborted();
  if(clerk.session?.id!==current.id)throw Error('Administrative session changed');
  return {actorId:current.user.id,token};
 }}/>;
}
