import {runWorkflowHash} from './workflow-hash-client';
import {sceneEditTargetSchema} from './scene-edit-contract';

export type SceneTarget={propertyId:string;sceneId:string;expectedUpdatedAt:string;previousUrl:string;propertyRevision:string;expiresAt:string;sessionKey:string;status:string};
export type SceneSession={target:SceneTarget;sourceUrl:string;fileName:string;storageOrigin:string};
export function parseSceneSession(value:unknown,ids:{propertyId:string;sceneId:string}):SceneSession {
 if(!value||typeof value!=='object')throw Error('Invalid session');
 const response=value as Record<string,unknown>,target=sceneEditTargetSchema.parse(response.target);
 if(target.propertyId!==ids.propertyId||target.sceneId!==ids.sceneId||response.sourceUrl!=='/api/scene-edit/source?sessionKey='+target.sessionKey||typeof response.fileName!=='string'||! /^[A-Za-z0-9_.-]+\.(zip|rad|ply|splat|ksplat)$/i.test(response.fileName)||typeof response.storageOrigin!=='string')throw Error('Invalid session binding');
 const storage=new URL(response.storageOrigin);
 if(storage.protocol!=='https:'||storage.origin!==response.storageOrigin||storage.username||storage.password)throw Error('Invalid storage origin');
 return {target,sourceUrl:response.sourceUrl,fileName:response.fileName,storageOrigin:response.storageOrigin};
}
type ReplyEvent={origin:string;source:unknown;data:unknown};
export function sceneRefreshDecision(expected:string|null,base:string|undefined,incoming:string|undefined,pending:boolean):'wait'|'apply'|'conflict'{
 if(!expected||incoming===base)return 'wait';
 return pending||incoming!==expected?'conflict':'apply';
}
export function receiveSceneAttachment(event:ReplyEvent,options:{origin:string;propertyId:string;windows:ReadonlyMap<unknown,string>;seen:Set<string>;hasPendingChanges:()=>boolean;freeze:()=>void;conflict:()=>void;reload:()=>void}) {
 const data=event.data as {type?:unknown;propertyId?:unknown;sceneId?:unknown;key?:unknown;updatedAt?:unknown}|null;
 if(event.origin!==options.origin||!event.source||data?.type!=='locahun:scene-attached')return false;
 const sceneId=options.windows.get(event.source);
 if(!sceneId||data.propertyId!==options.propertyId||data.sceneId!==sceneId||typeof data.key!=='string'||!/^[a-f0-9]{64}$/.test(data.key)||typeof data.updatedAt!=='string'||!Number.isFinite(Date.parse(data.updatedAt))||options.seen.has(data.key))return false;
 options.seen.add(data.key);
 const pending=options.hasPendingChanges();
 options.freeze();
 if(pending)options.conflict();else options.reload();
 return true;
}
export function createSceneReplyGate(origin:string,source:unknown,requestId:string,types=['locahun:scene-exported','locahun:scene-export-error']) {
 let received=false;
 return (event:ReplyEvent)=>{
  const data=event.data as {type?:string;requestId?:string}|null;
  if(received||event.origin!==origin||event.source!==source||!data||data.requestId!==requestId||!types.includes(data.type||''))return false;
  received=true;return true;
 };
}
export function sourceRefreshDecision(state:{pending:boolean;inFlight:boolean;statusInFlight:boolean;failed:boolean}) {
 return Object.values(state).some(Boolean)?'conflict':'reload';
}
class SceneHttpError extends Error { constructor(public status:number){super('Scene request failed');} }
export async function sceneRequest(body:unknown,signal:AbortSignal,fetcher:typeof fetch=fetch,origin?:string) {
 signal.throwIfAborted();
 const response=await fetcher(origin?new URL('/api/scene-edit',origin):'/api/scene-edit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'same-origin',redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});
 if(!response.ok)throw new SceneHttpError(response.status);
 return response.json();
}
function storageUrl(value:string,origin:string) {
 const url=new URL(value);
 if(url.protocol!=='https:'||url.origin!==origin||url.username||url.password||url.hash)throw Error('Storage origin mismatch');
 return url.href;
}
type SaveOptions={target:SceneTarget;archive:File;origin:string;storageOrigin:string;revision:number;signal:AbortSignal;fetch?:typeof fetch;hash?:typeof runWorkflowHash;onPhase?:(phase:string)=>void};
export type SceneSaveResult={attached:false;phase:'error'|'expired'|'cancelled'|'conflict'}|{attached:true;phase:'saved';key:string;propertyId:string;sceneId:string;url:string;updatedAt:string};
export async function saveSceneArchive(options:SaveOptions):Promise<SceneSaveResult> {
 const {target,signal}=options,fetcher=options.fetch||fetch,hash=options.hash||runWorkflowHash;
 const phase=options.onPhase||(()=>{});
 const call=(body:unknown)=>sceneRequest(body,signal,fetcher,options.origin);
 try {
  signal.throwIfAborted();
  if(!Number.isFinite(Date.parse(target.expiresAt))||Date.parse(target.expiresAt)<=Date.now())return {phase:'expired',attached:false};
  phase('hashing');const digest=await hash({file:options.archive},signal);
  if(digest.bytes!==options.archive.size)throw Error('Archive length mismatch');
  phase('reserving');const reservation=await call({action:'reserve',target,digest:{revision:options.revision,projectSha256:digest.sha256,archiveSha256:digest.sha256,archiveMd5:digest.md5,archiveBytes:digest.bytes}});
  const key=reservation.key;
  if(typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key))throw Error('Invalid reservation');
  if(reservation.status!=='ready') {
   if(reservation.status!=='uploading')throw Error('Invalid reservation state');
   const url=storageUrl(reservation.putUrl,options.storageOrigin);
   const md5=btoa(String.fromCharCode(...digest.md5.match(/../g)!.map(n=>parseInt(n,16))));
   if(reservation.headers?.['Content-MD5']!==md5||reservation.headers?.['If-None-Match']!=='*')throw Error('Invalid upload binding');
   signal.throwIfAborted();phase('uploading');
   const response=await fetcher(url,{method:'PUT',body:options.archive,headers:{'Content-MD5':md5,'If-None-Match':'*'},credentials:'omit',redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(300000)])});
   void response.body?.cancel().catch(()=>{});
   if(!response.ok&&response.status!==412)throw Error('Upload failed');
  }
  phase('verifying');const verify=await call({action:'verify',key});
  if(verify.key!==key||verify.bytes!==digest.bytes||verify.sha256!==digest.sha256)throw Error('Verification mismatch');
  const downloaded=await hash({url:storageUrl(verify.downloadUrl,options.storageOrigin),origin:options.storageOrigin,bytes:digest.bytes},signal);
  if(downloaded.bytes!==digest.bytes||downloaded.sha256!==digest.sha256)throw Error('Readback mismatch');
  phase('attaching');const result=await call({action:'attach',key,verifiedSha256:digest.sha256});
  if(!['attached','already_attached'].includes(result.status)||result.key!==key||result.propertyId!==target.propertyId||result.sceneId!==target.sceneId||typeof result.url!=='string'||!Number.isFinite(Date.parse(result.updatedAt)))throw Error('Attachment mismatch');
  return {phase:'saved',attached:true,key,propertyId:result.propertyId,sceneId:result.sceneId,url:result.url,updatedAt:result.updatedAt};
 }catch(error){
  return {attached:false,phase:signal.aborted?'cancelled':error instanceof SceneHttpError&&error.status===409?'conflict':error instanceof SceneHttpError&&[401,403,410].includes(error.status)?'expired':'error'};
 }
}
