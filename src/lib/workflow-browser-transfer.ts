import {z} from 'zod';
import {runWorkflowHash,type WorkflowHashInput,type WorkflowDigest} from './workflow-hash-client';
const hex=z.string().regex(/^[a-f0-9]{64}$/);
const targetSchema=z.object({propertyId:z.string().min(1).max(200),sceneId:z.string().min(1).max(200),expectedUpdatedAt:z.string().datetime(),previousUrl:z.string().max(2048)}).strict();
export type WorkflowTarget=z.infer<typeof targetSchema>;
const receiptSchema=z.object({schema:z.literal(1),roundtripVerified:z.literal(true),input:z.object({revision:z.number().int().nonnegative(),projectSha256:hex}),archive:z.object({bytes:z.number().int().min(1).max(2*1024**3),sha256:hex})});
export const parseWorkflowReceipt=(value:unknown)=>receiptSchema.parse(value);
type Options={origin:string;storageOrigin:string;actorId:string;ids:{propertyId:string;sceneId:string};archive:File;receipt:unknown;signal:AbortSignal;snapshot?:WorkflowTarget;onTarget:(target:WorkflowTarget)=>void;session:(signal:AbortSignal)=>Promise<{actorId:string;token:string|null}>;hash?:(input:WorkflowHashInput,signal:AbortSignal)=>Promise<WorkflowDigest>;fetch?:typeof fetch;onProgress?:(phase:string)=>void};
function trusted(value:string,origin:string){const u=new URL(value);if(u.protocol!=='https:'||u.origin!==origin||u.username||u.password||u.hash)throw Error('Invalid storage origin');return u.href;}
async function json(response:Response){
 if(!response.ok||!response.headers.get('content-type')?.includes('application/json')||!response.body)throw Error('Administrative request failed');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>65536)throw Error('Administrative response too large');chunks.push(value);}const all=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(all));}
 finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
}
export async function transferWorkflowArchive(o:Options){
 const origin=new URL(o.origin);if(origin.origin!==o.origin||origin.protocol!=='https:'||!o.actorId)throw Error('Invalid application origin');
 trusted(o.storageOrigin,o.storageOrigin);
 const receipt=receiptSchema.parse(o.receipt),hash=o.hash||runWorkflowHash,fetcher=o.fetch||fetch,progress=o.onProgress||(()=>{});
 if(o.archive.size!==receipt.archive.bytes)throw Error('Archive length mismatch');
 o.signal.throwIfAborted();progress('hashing');const digest=await hash({file:o.archive},o.signal);
 if(digest.bytes!==receipt.archive.bytes||digest.sha256!==receipt.archive.sha256||! /^[a-f0-9]{32}$/.test(digest.md5))throw Error('Archive digest mismatch');
 const call=async(body:unknown)=>{
  o.signal.throwIfAborted();const controller=new AbortController();const signal=AbortSignal.any([o.signal,controller.signal]);
  let rejectAbort:(reason:unknown)=>void=()=>{};
  const aborted=new Promise<never>((_,reject)=>{rejectAbort=reject;});
  const abort=()=>rejectAbort(signal.reason);signal.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>controller.abort(Error('Administrative request timeout')),30000);
  try{
   return await Promise.race([(async()=>{
   const session=await o.session(signal);
   signal.throwIfAborted();if(session.actorId!==o.actorId||!session.token||/[\r\n]/.test(session.token))throw Error('Administrative session changed');
   return await json(await fetcher(new URL('/api/admin/workflow',origin),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.token},body:JSON.stringify(body),credentials:'same-origin',redirect:'error',signal}));
   })(),aborted]);
  }finally{clearTimeout(timer);signal.removeEventListener('abort',abort);controller.abort();}
 };
 progress('resolving_target');
 const target=targetSchema.parse(o.snapshot||await call({action:'target',...o.ids}));
 if(target.propertyId!==o.ids.propertyId||target.sceneId!==o.ids.sceneId)throw Error('Target resolution mismatch');
 if(!o.snapshot)o.onTarget(target);
 const binding={...target,revision:receipt.input.revision,projectSha256:receipt.input.projectSha256,archiveBytes:digest.bytes,archiveSha256:digest.sha256,archiveMd5:digest.md5};
 progress('reserving');const reservation=await call({action:'reserve',binding});
 const key=hex.parse(reservation.key);if(reservation.id!=='wf_'+key)throw Error('Invalid reservation');
 if(reservation.status!=='ready'){
  if(reservation.status!=='uploading')throw Error('Invalid reservation status');
  const url=trusted(reservation.putUrl,o.storageOrigin);
  const md5=btoa(String.fromCharCode(...digest.md5.match(/../g)!.map(n=>parseInt(n,16))));
  if(reservation.headers?.['Content-MD5']!==md5||reservation.headers?.['If-None-Match']!=='*')throw Error('Invalid upload binding');
  o.signal.throwIfAborted();progress('uploading');
  const response=await fetcher(url,{method:'PUT',body:o.archive,headers:{'Content-MD5':md5,'If-None-Match':'*'},credentials:'omit',redirect:'error',signal:AbortSignal.any([o.signal,AbortSignal.timeout(300000)])});
  void response.body?.cancel().catch(()=>{});if(!response.ok&&response.status!==412)throw Error('Upload failed');
 }
 progress('verifying');const verify=await call({action:'verify',key});
 if(verify.bytes!==digest.bytes||verify.sha256!==digest.sha256)throw Error('Verification binding mismatch');
 const downloaded=await hash({url:trusted(verify.downloadUrl,o.storageOrigin),origin:o.storageOrigin,bytes:digest.bytes},o.signal);
 if(downloaded.bytes!==digest.bytes||downloaded.sha256!==digest.sha256)throw Error('Downloaded digest mismatch');
 progress('attaching');const result=await call({action:'attach',key,verifiedSha256:digest.sha256});
 if(!['attached','already_attached'].includes(result.status)||result.key!==key||result.propertyId!==o.ids.propertyId||result.sceneId!==o.ids.sceneId)throw Error('Attachment readback mismatch');
 progress('attached');return result;
}
