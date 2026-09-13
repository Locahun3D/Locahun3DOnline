import {it,expect,vi,afterEach} from 'vitest';
import {runWorkflowHash} from './workflow-hash-client';
afterEach(()=>vi.useRealTimers());
const input={url:'https://storage.test/object',origin:'https://storage.test',bytes:3};
function fixture(){
 const worker={postMessage:vi.fn(),terminate:vi.fn(),onmessage:null as null|((e:MessageEvent)=>void),onerror:null as null|((e:ErrorEvent)=>void),onmessageerror:null as null|((e:MessageEvent)=>void)};
 return {worker,factory:()=>worker as unknown as Worker};
}
it('validates a digest and terminates the worker after success',async()=>{
 const {worker,factory}=fixture();const pending=runWorkflowHash(input,new AbortController().signal,factory);
 const result={bytes:3,sha256:'a'.repeat(64),md5:'b'.repeat(32)};
 worker.onmessage?.({data:{ok:true,result}} as MessageEvent);
 expect(await pending).toEqual(result);expect(worker.terminate).toHaveBeenCalledOnce();
});
it('abort terminates work and rejects immediately',async()=>{
 const {worker,factory}=fixture(),controller=new AbortController();
 const pending=runWorkflowHash(input,controller.signal,factory);controller.abort();
 await expect(pending).rejects.toThrow(/cancel/i);expect(worker.terminate).toHaveBeenCalledOnce();
});
it('does not create a worker when already cancelled',async()=>{
 const factory=vi.fn();const controller=new AbortController();controller.abort();
 await expect(runWorkflowHash(input,controller.signal,factory)).rejects.toThrow(/cancel/i);expect(factory).not.toHaveBeenCalled();
});
it('times out even if the worker sends nothing',async()=>{
 vi.useFakeTimers();const {worker,factory}=fixture();
 const pending=runWorkflowHash(input,new AbortController().signal,factory);
 const result=expect(pending).rejects.toThrow(/timeout/i);await vi.advanceTimersByTimeAsync(300000);await result;
 expect(worker.terminate).toHaveBeenCalledOnce();
});
it('rejects a digest for the wrong byte length',async()=>{
 const {worker,factory}=fixture();const pending=runWorkflowHash(input,new AbortController().signal,factory);
 worker.onmessage?.({data:{ok:true,result:{bytes:4,sha256:'a'.repeat(64),md5:'b'.repeat(32)}}} as MessageEvent);
 await expect(pending).rejects.toThrow(/Invalid/);expect(worker.terminate).toHaveBeenCalledOnce();
});
