export type WorkflowHashInput={file:File}|{url:string;origin:string;bytes:number};
export type WorkflowDigest={bytes:number;sha256:string;md5:string};

export function runWorkflowHash(input:WorkflowHashInput,signal:AbortSignal,factory=()=>new Worker(new URL('./workflow-hash.worker.ts',import.meta.url),{type:'module'})):Promise<WorkflowDigest>{
 return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(Error('Verification cancelled'));return;}
  const expected='file' in input?input.file.size:input.bytes;
  if(!Number.isSafeInteger(expected)||expected<1||expected>2*1024**3){reject(Error('Invalid archive length'));return;}
  let worker:Worker;
  try{worker=factory();}catch{reject(Error('Verification worker unavailable'));return;}
  let settled=false;
  const finish=(error?:Error,value?:WorkflowDigest)=>{
   if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);
   worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;worker.terminate();
   if(error)reject(error);else resolve(value!);
  };
  const abort=()=>finish(Error('Verification cancelled'));
  const timer=setTimeout(()=>finish(Error('Verification timeout')),300000);
  signal.addEventListener('abort',abort,{once:true});
  worker.onerror=()=>finish(Error('Verification worker failed'));
  worker.onmessageerror=()=>finish(Error('Invalid verification response'));
  worker.onmessage=event=>{
   const data=event.data,result=data?.result;
   if(data?.ok!==true||result?.bytes!==expected||typeof result.sha256!=='string'||! /^[a-f0-9]{64}$/.test(result.sha256)||typeof result.md5!=='string'||! /^[a-f0-9]{32}$/.test(result.md5)){
    finish(Error('Invalid verification response'));return;
   }
   finish(undefined,{bytes:result.bytes,sha256:result.sha256,md5:result.md5});
  };
  if(signal.aborted){abort();return;}
  try{worker.postMessage(input);}catch{finish(Error('Verification could not start'));}
 });
}
