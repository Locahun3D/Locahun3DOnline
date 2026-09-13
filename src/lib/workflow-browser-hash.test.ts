import {it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {hashWorkflowStream} from './workflow-browser-hash';

it('incrementally hashes bounded chunks without buffering the archive',async()=>{
 const bytes=new TextEncoder().encode('source-data'.repeat(10000));let offset=0;
 const stream=new ReadableStream<Uint8Array>({pull(c){if(offset===bytes.length){c.close();return;}const end=Math.min(offset+137,bytes.length);c.enqueue(bytes.subarray(offset,end));offset=end;}});
 const result=await hashWorkflowStream(stream,bytes.length,new AbortController().signal);
 expect(result).toEqual({bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),md5:createHash('md5').update(bytes).digest('hex')});
});
it('rejects incorrect length and cancels the reader',async()=>{
 let cancelled=false;
 const stream=new ReadableStream<Uint8Array>({pull(c){c.enqueue(new Uint8Array(5));},cancel(){cancelled=true;}});
 await expect(hashWorkflowStream(stream,4,new AbortController().signal)).rejects.toThrow(/length/);
 expect(cancelled).toBe(true);
});
it('aborts a stalled stream instead of waiting forever',async()=>{
 const controller=new AbortController();const stream=new ReadableStream<Uint8Array>();
 const pending=hashWorkflowStream(stream,1,controller.signal);controller.abort();
 await expect(pending).rejects.toThrow(/abort/i);
});
