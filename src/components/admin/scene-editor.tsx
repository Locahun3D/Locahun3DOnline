'use client';

import {useEffect,useRef,useState} from 'react';
import {createSceneReplyGate,parseSceneSession,saveSceneArchive,sceneRequest,SceneHttpError,type SceneSession} from '@/lib/scene-edit-client';
import styles from './scene-editor.module.css';

const messages:Record<string,string>={loading:'3DGSを読み込んでいます',ready:'編集できます',exporting:'編集内容をまとめています',hashing:'保存データを確認しています',reserving:'保存先を準備しています',uploading:'アップロードしています',verifying:'保存した内容を照合しています',attaching:'シーンへ反映しています',saved:'保存しました',refreshing:'保存先の状態を確認しています',savedSessionError:'保存しました。次の編集を保存する前に、接続を再確認してください。',error:'保存できませんでした。編集内容はこの画面に残っています。もう一度保存してください。',expired:'認証または編集セッションの期限が切れました。この画面を閉じずにログイン状態を確認してください。',conflict:'他の画面で物件が更新されました。上書きせず停止しました。',cancelled:'保存を中断しました。反映済みか不明な場合は物件を別画面で確認してください。',loadError:'読み込みが完了しなかったため保存できません。物件編集から開き直してください。',tooLarge:'この3DGSはオンライン編集できるサイズ（1GB）を超えています。ファイルを軽くしてから差し替えるか、管理者に相談してください。',publishedAdminOnly:'公開中の物件は管理者のみ編集・保存できます。下書きに戻すか、管理者に依頼してください。'};

export type SceneAttached={propertyId:string;sceneId:string;key:string;updatedAt:string};

/**
 * 3DGSのオンライン編集。物件編集の中にそのまま埋め込む（inline）か、単独ページで開く。
 * 2026-09-19: 専用ページは表示域が狭く見づらいとの指摘で、物件編集内の埋め込みを標準にした。
 * 読み込み完了時にビューアーへ入力フォーカスを移す（移さないと WASD の移動が効かない）。
 */
export default function SceneEditor({propertyId,sceneId,label,published,inline=false,onClose,onAttached}:{propertyId:string;sceneId:string;label:string;published:boolean;inline?:boolean;onClose?:()=>void;onAttached?:(data:SceneAttached)=>void}) {
 const frame=useRef<HTMLIFrameElement>(null);
 const session=useRef<SceneSession|null>(null);
 const controller=useRef<AbortController|null>(null);
 const dirty=useRef(false),generation=useRef(0),revision=useRef(0),busyRef=useRef(false);
 const transportReady=useRef(false),loadSent=useRef(false);
 const saveRef=useRef<()=>void>(()=>{});
 const validRef=useRef(false);
 const [phase,setPhase]=useState('loading'),[ready,setReady]=useState(false),[busy,setBusy]=useState(false);
 // 読み込みの進み具合（MB）と、最後に保存できた時刻。「本当に保存されたか」を画面で確かめられるようにする（2026-09-21）。
 const [download,setDownload]=useState(''),[savedAt,setSavedAt]=useState('');
 useEffect(()=>{
  const abort=new AbortController();controller.current=abort;
  let loadId='',loadTimer:ReturnType<typeof setTimeout>|undefined;
  let loadReply:(event:MessageEvent)=>boolean=()=>false;
  const load=()=>{
   if(!transportReady.current||!session.current||loadSent.current)return;
   loadSent.current=true;loadId=crypto.randomUUID();
   loadReply=createSceneReplyGate(location.origin,frame.current?.contentWindow,loadId,['locahun:scene-ready','locahun:scene-load-error']);
   frame.current?.contentWindow?.postMessage({type:'locahun:scene-load',requestId:loadId,sourceUrl:session.current.sourceUrl,fileName:session.current.fileName,streamFileName:session.current.streamFileName},location.origin);
   loadTimer=setTimeout(()=>setPhase('loadError'),300000);
  };
  const mb=(n:number)=>Math.round(n/1048576);
  const onMessage=(event:MessageEvent)=>{
   if(event.origin!==location.origin||event.source!==frame.current?.contentWindow)return;
   const data=event.data;
   // ビューアーは新しい文書になるたびに ready を送る。**その都度**読み込みを出し直す（2026-09-21）。
   // ⚠ 本番の /viewer/scene-editor.html は拡張子なしのURLへ 307 で飛ぶ（Cloudflare の
   //    静的配信の既定）。iframe は文書を2回作り、1回目の ready で送った読み込み指示は
   //    差し替えで消える。1回だけ送る作りだと、2回目の文書は指示を受け取れず
   //    「3DGSを読み込んでいます」のまま永久に止まる（本番で実測）。
   //    新しい文書は何も読み込んでいないので、出し直しても二重取得にはならない。
   if(data?.type==='locahun:scene-editor-ready'){transportReady.current=true;loadSent.current=false;load();}
   // 進んでいる間は打ち切らない（大きい3DGSでも、止まったときだけ5分で失敗にする）。
   if(data?.type==='locahun:scene-load-progress'&&data.requestId===loadId&&Number.isFinite(data.loaded)){clearTimeout(loadTimer);loadTimer=setTimeout(()=>setPhase('loadError'),300000);setDownload(data.total?`${mb(data.loaded)} / ${mb(data.total)} MB`:`${mb(data.loaded)} MB`);}
   if(['locahun:scene-ready','locahun:scene-load-error'].includes(data?.type)&&loadReply(event)){
    clearTimeout(loadTimer);validRef.current=data.type==='locahun:scene-ready';setReady(validRef.current);setPhase(validRef.current?'ready':'loadError');
    if(validRef.current){frame.current?.focus();frame.current?.contentWindow?.focus();}
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
  }).catch(error=>{if(abort.signal.aborted)return;setPhase(error instanceof SceneHttpError&&error.code==='source_too_large'?'tooLarge':error instanceof SceneHttpError&&error.code==='published_admin_only'?'publishedAdminOnly':'loadError');});
  return ()=>{abort.abort();controller.current?.abort();clearTimeout(loadTimer);window.removeEventListener('message',onMessage);window.removeEventListener('beforeunload',unload);};
 },[propertyId,sceneId]);

 const save=async()=>{
  if(busyRef.current||!validRef.current||!ready||!session.current)return;
  busyRef.current=true;setBusy(true);dirty.current=true;setPhase('exporting');
  const abort=new AbortController();controller.current=abort;
  const requestId=crypto.randomUUID(),atExport=generation.current;
  try {
   // 開いている間に物件の別の欄が保存されていることがある（回転動画の撮り直し・物件編集の自動保存）。
   // このシーンのファイルが同じままなら、最新の状態に結び直してから保存する。違うファイルになっていたら止める。
   setPhase('refreshing');
   const fresh=parseSceneSession(await sceneRequest({action:'target',propertyId,sceneId},abort.signal),{propertyId,sceneId});
   if(fresh.target.previousUrl!==session.current.target.previousUrl){setPhase('conflict');setReady(false);return;}
   session.current=fresh;setPhase('exporting');
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
    setSavedAt(new Date().toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'}));
    if(atExport===generation.current){dirty.current=false;frame.current?.contentWindow?.postMessage({type:'locahun:scene-saved',requestId},location.origin);}
    if(onAttached)onAttached({propertyId,sceneId,key:result.key,updatedAt:result.updatedAt});
    else window.opener?.postMessage({type:'locahun:scene-attached',propertyId,sceneId,key:result.key,updatedAt:result.updatedAt},location.origin);
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
 const status=phase==='edited'?'未保存の変更があります':phase==='loading'&&download?`${messages.loading}（${download}）`:phase==='saved'?`保存しました（${savedAt}）。アップロードを照合済みです`:messages[phase]||phase;
 const tone=phase==='saved'?styles.ok:phase==='edited'?styles.warn:['error','conflict','expired','loadError','tooLarge','publishedAdminOnly','cancelled','savedSessionError'].includes(phase)?styles.bad:'';
 const close=()=>{if((dirty.current||busyRef.current)&&!confirm('未保存の編集があります。閉じますか？'))return;onClose?.();};
 return <section className={`${inline?'':'theme-online '}${styles.root} ${inline?styles.inline:styles.window}`}>
  <header className={styles.bar}>
   {inline
    ? <button type="button" className={styles.back} onClick={close}>× 閉じる</button>
    : <a className={styles.back} href={`/admin/properties/${encodeURIComponent(propertyId)}/edit`} onClick={event=>{
       if((dirty.current||busyRef.current)&&!confirm('未保存の編集があります。閉じますか？')){event.preventDefault();return;}
       // 物件編集から別ウィンドウで開いた場合は、ウィンドウを閉じて元の物件編集へ戻す。
       if(window.opener){event.preventDefault();dirty.current=false;busyRef.current=false;window.close();}
      }}>× 閉じて物件編集に戻る</a>}
   <strong className={styles.title}>{label||'3DGS'}の編集</strong>
   <span className={`${styles.status} ${tone}`} role="status" aria-live="polite">{status}</span>
   {savedAt&&phase!=='saved'&&<span className={styles.last}>最終保存 {savedAt}</span>}
   <span className={styles.actions}>
    {['expired','savedSessionError'].includes(phase)&&<button type="button" disabled={busy} onClick={()=>void reconnect()}>接続を再確認</button>}
    {busy&&phase!=='attaching'&&<button type="button" onClick={()=>controller.current?.abort()}>中断</button>}
    <button type="button" className={styles.primary} onClick={()=>void save()} disabled={!ready||busy}>このシーンに保存</button>
   </span>
  </header>
  <p className={styles.hint}>視点: 右ドラッグで回転／W・A・S・Dで移動／Q・Eで上下／ホイールで画角（Shift＋ホイールで速度）。うまく動かない時はビューアーを一度クリック。{published&&' 公開中の物件です。保存すると閲覧に反映されます。'} 販売用データは変わりません。</p>
  <iframe ref={frame} title={`${label||'3DGS'} 編集ビューアー`} src="/viewer/scene-editor.html?onlineSceneEdit=1" className={styles.viewer} allow="fullscreen" tabIndex={0} />
 </section>;
}
