import {it,expect,vi,afterEach} from 'vitest';
afterEach(()=>vi.useRealTimers());
import {transferWorkflowArchive,workflowFailureCode} from './workflow-browser-transfer';
const sha='a'.repeat(64),key='b'.repeat(64),md5='c'.repeat(32);
it('exposes only allowlisted failure codes, never signed URLs or session errors',()=>{
 expect(workflowFailureCode(Error('Invalid upload binding'))).toBe('upload_binding');
 expect(workflowFailureCode(Error('Administrative request failed (HTTP 409)'))).toBe('http_409');
 expect(workflowFailureCode(Error('secret token https://storage.test/?signature=secret'))).toBe('unexpected');
});
it('reports HTTP status without exposing the administrative response',async()=>{
 const {options}=fixture();options.fetch.mockResolvedValue(Response.json({secret:'private'},{status:409}));
 await expect(transferWorkflowArchive(options)).rejects.toThrow('Administrative request failed (HTTP 409)');
});
function fixture(){
 const calls:string[]=[];
 const options={origin:'https://app.test',storageOrigin:'https://storage.test',actorId:'admin',ids:{propertyId:'p',sceneId:'s'},archive:new File(['abc'],'project.zip'),receipt:{schema:1,input:{revision:1,projectSha256:sha},archive:{bytes:3,sha256:sha},roundtripVerified:true},signal:new AbortController().signal,
 session:vi.fn(async()=>({actorId:'admin',token:'test-token'})),hash:vi.fn(async()=>({bytes:3,sha256:sha,md5})),onTarget:vi.fn(),
 fetch:vi.fn(async(url:string|URL|Request,init?:RequestInit)=>{
  if(String(url).startsWith('https://storage.test')){expect(init?.credentials).toBe('omit');expect(new Headers(init?.headers).has('Authorization')).toBe(false);calls.push('put');return new Response();}
  expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-token');
  const body=JSON.parse(String(init?.body));calls.push(body.action);
  if(body.action==='target')return Response.json({propertyId:'p',sceneId:'s',expectedUpdatedAt:'2026-09-14T00:00:00.000Z',previousUrl:''});
  if(body.action==='reserve')return Response.json({key,id:'wf_'+key,status:'uploading',putUrl:'https://storage.test/object',headers:{'Content-MD5':'zMzMzMzMzMzMzMzMzMzMzA==','If-None-Match':'*'}});
  if(body.action==='verify')return Response.json({bytes:3,sha256:sha,downloadUrl:'https://storage.test/object'});
  return Response.json({status:'attached',key,propertyId:'p',sceneId:'s'});
 })};
 return {options,calls};
}
it('connects hashing, fresh sessions, write-once upload, download verification and attachment',async()=>{
 const {options,calls}=fixture();expect((await transferWorkflowArchive(options)).status).toBe('attached');
 expect(calls).toEqual(['target','reserve','put','verify','attach']);expect(options.session).toHaveBeenCalledTimes(4);expect(options.hash).toHaveBeenCalledTimes(2);
});
it('account switch cannot attach data',async()=>{
 const {options,calls}=fixture();let count=0;options.session.mockImplementation(async()=>({actorId:++count===4?'other':'admin',token:'test-token'}));
 await expect(transferWorkflowArchive(options)).rejects.toThrow(/session/i);expect(calls).not.toContain('attach');
});
it('bad source checksum never contacts the administrative API',async()=>{
 const {options,calls}=fixture();options.hash.mockResolvedValue({bytes:3,sha256:'d'.repeat(64),md5});
 await expect(transferWorkflowArchive(options)).rejects.toThrow(/digest/i);expect(calls).toEqual([]);
});
it('cancels immediately even when session acquisition ignores abort',async()=>{
 const {options}=fixture(),controller=new AbortController();options.session.mockImplementation(()=>new Promise(()=>{}));
 const pending=transferWorkflowArchive({...options,signal:controller.signal});
 await Promise.resolve();await Promise.resolve();controller.abort();
 await expect(pending).rejects.toThrow();
});
it('bounds an administrative request that ignores its abort signal',async()=>{
 vi.useFakeTimers();const {options}=fixture();options.fetch.mockImplementation(()=>new Promise(()=>{}));
 const pending=transferWorkflowArchive(options),check=expect(pending).rejects.toThrow(/timeout/i);
 await vi.advanceTimersByTimeAsync(30000);await check;
});
it('a failed download digest cannot attach',async()=>{
 const {options,calls}=fixture();options.hash.mockResolvedValueOnce({bytes:3,sha256:sha,md5}).mockResolvedValueOnce({bytes:3,sha256:'d'.repeat(64),md5});
 await expect(transferWorkflowArchive(options)).rejects.toThrow(/Downloaded digest/);expect(calls).not.toContain('attach');
});
it('retained target skips resolution instead of refreshing a successful binding',async()=>{
 const {options,calls}=fixture();
 await transferWorkflowArchive({...options,snapshot:{propertyId:'p',sceneId:'s',expectedUpdatedAt:'2026-09-14T00:00:00.000Z',previousUrl:''}});
 expect(calls).toEqual(['reserve','put','verify','attach']);expect(options.onTarget).not.toHaveBeenCalled();
});
