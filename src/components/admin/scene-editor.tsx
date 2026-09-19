'use client';

import {useEffect,useRef,useState} from 'react';
import {createSceneReplyGate,parseSceneSession,saveSceneArchive,sceneRequest,type SceneSession} from '@/lib/scene-edit-client';
import styles from './scene-editor.module.css';

const messages:Record<string,string>={loading:'3DGSを読み込んでいます',ready:'編集できます',exporting:'編集内容をまとめています',hashing:'保存データを確認しています',reserving:'保存先を準備しています',uploading:'アップロードしています',verifying:'保存した内容を照合しています',attaching:'シーンへ反映しています',saved:'保存しました',savedSessionError:'保存しました。次の編集を保存する前に、接続を再確認してください。',error:'保存できませんでした。編集内容はこの画面に残っています。もう一度保存してください。',expired:'認証または編集セッションの期限が切れました。この画面を閉じずにログイン状態を確認してください。',conflict:'他の画面で物件が更新されました。上書きせず停止しました。',cancelled:'保存を中断しました。反映済みか不明な場合は物件を別画面で確認してください。',loadError:'読み込みが完了しなかったため保存できません。物件編集から開き直してください。'};

export default function SceneEditor({propertyId,sceneId,label,published}:{propertyId:string;sceneId:string;label:string;published:boolean}) {
 const frame=useRef<HTMLIFrameElement>(null);
 const session=useRef<SceneSession|null>(null);
 const controller=useRef<AbortController|null>(null);
 const dirty=useRef(false),generation=useRef(0),revision=useRef(0),busyRef=useRef(false);
 const transportReady=useRef(false),loadSent=useRef(false);
 const saveRef=useRef<()=>void>(()=>{});
 const validRef=useRef(false);
 const [phase,setPhase]=useState('loading'),[ready,setReady]=useState(false),[busy,setBusy]=useState(false);
 useEffect(()=>{
  const abort=new AbortController();controller.current=abort;
  let loadId='',loadTimer:ReturnType<typeof setTimeout>|undefined;
  let loadReply:(event:MessageEvent)=>boolean=()=>false;
  const load=()=>{
   if(!transportReady.current||!session.current||loadSent.current)return;
   loadSent.current=true;loadId=crypto.randomUUID();
   loadReply=createSceneReplyGate(location.origin,frame.current?.contentWindow,loadId,['locahun:scene-ready','locahun:scene-load-error']);
   frame.current?.contentWindow?.postMessage({type:'locahun:scene-load',requestId:loadId,sourceUrl:session.current.sourceUrl,fileName:session.current.fileName},location.origin);
   loadTimer=setTimeout(()=>setPhase('loadError'),300000);
  };
  const onMessage=(event:MessageEvent)=>{
   if(event.origin!==location.origin||event.source!==frame.current?.contentWindow)return;
   const data=event.data;
   if(data?.type==='locahun:scene-editor-ready'){transportReady.current=true;load();}
   if(['locahun:scene-ready','locahun:scene-load-error'].includes(data?.type)&&loadReply(event)){
    clearTimeout(loadTimer);validRef.current=data.type==='locahun:scene-ready';setReady(validRef.current);setPhase(validRef.current?'ready':'loadError');
   }
   if(data?.type==='locahun:scene-dirty'){dirty.current=true;generation.current++;if(!busyRef.current)setPhase(previous=>['ready','saved','edited'].includes(previous)?'edited':previous);}
   if(data?.type==='locahun:scene-invalid'){dirty.current=true;generation.current++;validRef.current=false;setReady(false);setPhase('loadError');}
   if(data?.type==='locahun:scene-save-requested')saveRef.current();
  };
  const unload=(event:BeforeUnloadEvent)=>{if(dirty.current||busyRef.current)event.preventDefault();};
  window.addEventListener('message',onMessage);window.addEventListener('beforeunload',unload);
  void sceneRequest({action:'target',propertyId,sceneId},abort.signal).then(value=>{
   if(abort.signal.aborted)return;
   const result=parseSceneSession(value,{propertyId,sceneId});
   session.current=result;load();
  }).catch(()=>{if(!abort.signal.aborted)setPhase('loadError');});
  return ()=>{abort.abort();controller.current?.abort();clearTimeout(loadTimer);window.removeEventListener('message',onMessage);window.removeEventListener('beforeunload',unload);};
 },[propertyId,sceneId]);

 const save=async()=>{
  if(busyRef.current||!validRef.current||!ready||!session.current)return;
  busyRef.current=true;setBusy(true);dirty.current=true;setPhase('exporting');
  const abort=new AbortController();controller.current=abort;
  const requestId=crypto.randomUUID(),atExport=generation.current;
  try {
   const archive=await new Promise<Blob>((resolve,reject)=>{
    const child=frame.current?.contentWindow;
    if(!child){reject(Error('Viewer unavailable'));return;}
    const gate=createSceneReplyGate(location.origin,child,requestId);
    const finish=(value?:Blob)=>{clearTimeout(timer);window.removeEventListener('message',receive);abort.signal.removeEventListener('abort',cancel);if(value)resolve(value);else reject(Error('Export failed'));};
    const receive=(event:MessageEvent)=>{if(gate(event))finish(event.data.type==='locahun:scene-exported'&&event.data.archive instanceof Blob?event.data.archive:undefined);};
    const cancel=()=>finish();const timer=setTimeout(cancel,300000);
    window.addEventListener('message',receive);abort.signal.addEventListener('abort',cancel,{once:true});
    child.postMessage({type:'locahun:scene-export',requestId},location.origin);
   });
   const result=await saveSceneArchive({target:session.current.target,archive:new File([archive],'scene.zip',{type:'application/zip'}),origin:location.origin,storageOrigin:session.current.storageOrigin,revision:revision.current++,signal:abort.signal,onPhase:setPhase});
   setPhase(result.phase);
   if(result.attached){
    if(atExport===generation.current){dirty.current=false;frame.current?.contentWindow?.postMessage({type:'locahun:scene-saved',requestId},location.origin);}
    window.opener?.postMessage({type:'locahun:scene-attached',propertyId,sceneId,key:result.key,updatedAt:result.updatedAt},location.origin);
    // Obtain a fresh session bound to the new revision, without discarding the live scene.
    session.current={...session.current,target:{...session.current.target,expectedUpdatedAt:result.updatedAt,previousUrl:result.url}};
    try {
     const next=parseSceneSession(await sceneRequest({action:'target',propertyId,sceneId},abort.signal),{propertyId,sceneId});
     if(next.target.expectedUpdatedAt!==result.updatedAt||next.target.previousUrl!==result.url){setPhase('conflict');setReady(false);return;}
     session.current=next;
    }catch{setPhase('savedSessionError');setReady(false);}
   }else if(result.phase==='conflict'||result.phase==='expired'){setReady(false);}
  }catch{setPhase(abort.signal.aborted?'cancelled':'error');}
  finally{busyRef.current=false;setBusy(false);}
 };
 useEffect(()=>{saveRef.current=()=>void save();});
 const reconnect=async()=>{
  if(busyRef.current||!session.current)return;
  busyRef.current=true;setBusy(true);
  try{
   const next=parseSceneSession(await sceneRequest({action:'target',propertyId,sceneId},new AbortController().signal),{propertyId,sceneId});
   if(next.target.propertyId!==propertyId||next.target.sceneId!==sceneId||next.target.previousUrl!==session.current.target.previousUrl||next.target.expectedUpdatedAt!==session.current.target.expectedUpdatedAt){setPhase('conflict');return;}
   session.current=next;setReady(true);setPhase('ready');
  }catch{setPhase('expired');}finally{busyRef.current=false;setBusy(false);}
 };
 return <section className={`theme-online ${styles.root}`}>
  <header className={styles.header}>
   <div><a href={`/admin/properties/${encodeURIComponent(propertyId)}/edit`} onClick={event=>{if((dirty.current||busyRef.current)&&!confirm('未保存の編集があります。物件編集へ戻りますか？'))event.preventDefault();}}>← 物件編集に戻る</a><h1>{label||'3DGS'}の編集</h1></div>
   <div className={styles.actions}><button type="button" onClick={()=>void save()} disabled={!ready||busy}>このシーンに保存</button>{['expired','savedSessionError'].includes(phase)&&<button type="button" disabled={busy} onClick={()=>void reconnect()}>接続を再確認</button>}{busy&&phase!=='attaching'&&<button type="button" onClick={()=>controller.current?.abort()}>中断</button>}</div>
   <p role="status" aria-live="polite">{phase==='edited'?'未保存の変更があります':messages[phase]||phase}</p>
   {published&&<p className={styles.notice}>公開中の物件です。保存に成功すると、以後の閲覧に変更が反映されます。</p>}
  </header>
  <iframe ref={frame} title={`${label||'3DGS'} 編集ビューアー`} src="/viewer/scene-editor.html?onlineSceneEdit=1" className={styles.viewer} allow="fullscreen" />
 </section>;
}
