import {Sha256} from '@aws-crypto/sha256-js';
import {Md5} from '@smithy/core/checksum';

export async function hashWorkflowStream(stream:ReadableStream<Uint8Array>,expectedBytes:number,signal:AbortSignal){
 if(!Number.isSafeInteger(expectedBytes)||expectedBytes<1||expectedBytes>2*1024**3)throw Error('Invalid archive length');
 const reader=stream.getReader(),sha=new Sha256(),md5=new Md5();let bytes=0;
 let rejectAbort:(reason:Error)=>void=()=>{};
 const aborted=new Promise<never>((_,reject)=>{rejectAbort=reject;});
 const abort=()=>rejectAbort(Error('Hash aborted'));
 signal.addEventListener('abort',abort,{once:true});
 if(signal.aborted)abort();
 try{
  for(;;){
   const {done,value}=await Promise.race([reader.read(),aborted]);
   if(done)break;
   bytes+=value.byteLength;
   if(bytes>expectedBytes||value.byteLength>8*1024**2)throw Error('Archive length limit');
   sha.update(value);md5.update(value);
  }
  if(bytes!==expectedBytes)throw Error('Archive length mismatch');
  const hex=(value:Uint8Array)=>Array.from(value,n=>n.toString(16).padStart(2,'0')).join('');
  return {bytes,sha256:hex(await sha.digest()),md5:hex(await md5.digest())};
 }finally{
  signal.removeEventListener('abort',abort);
  void reader.cancel().catch(()=>{});reader.releaseLock();
 }
}
