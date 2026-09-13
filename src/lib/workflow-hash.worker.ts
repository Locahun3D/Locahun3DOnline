import {hashWorkflowStream} from './workflow-browser-hash';

type Request={file:File}|{url:string;origin:string;bytes:number};
self.onmessage=async(event:MessageEvent<Request>)=>{
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),300000);
 try{
  const request=event.data;let stream:ReadableStream<Uint8Array>,bytes:number;
  if('file' in request){bytes=request.file.size;stream=request.file.stream();}
  else{
   if(!Number.isSafeInteger(request.bytes)||request.bytes<1||request.bytes>2*1024**3)throw Error('Invalid archive length');
   const url=new URL(request.url);
   if(url.protocol!=='https:'||url.origin!==request.origin||url.username||url.password||url.hash)throw Error('Invalid storage origin');
   const response=await fetch(url,{credentials:'omit',redirect:'error',signal:controller.signal});
   if(response.status!==200||!response.body)throw Error('Archive download failed');
   bytes=request.bytes;stream=response.body;
  }
  self.postMessage({ok:true,result:await hashWorkflowStream(stream,bytes,controller.signal)});
 }catch{self.postMessage({ok:false,error:'Archive verification failed or cancelled'});}
 finally{clearTimeout(timer);}
};
