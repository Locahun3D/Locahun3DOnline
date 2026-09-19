import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({user:vi.fn(),access:vi.fn(),db:vi.fn(),head:vi.fn(),put:vi.fn(),get:vi.fn(),revalidate:vi.fn()}));
vi.mock('@/lib/dal',()=>({getCurrentUser:mocks.user,assertPropertyAccess:mocks.access}));
vi.mock('@/lib/d1',()=>({getD1:mocks.db}));
vi.mock('next/cache',()=>({revalidatePath:mocks.revalidate}));
vi.mock('@/lib/uploads',()=>({getUploadMode:async()=> 'r2',getWorkflowStorageOrigin:async()=> 'https://storage.test',createWorkflowUpload:mocks.put,statWorkflowUpload:mocks.head,createPresignedGet:mocks.get}));
import {POST} from './route';
const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite');
let sqlite: InstanceType<typeof DatabaseSync>;
const old='/api/r2/assets/splat/original.zip';
const digest={revision:2,projectSha256:'a'.repeat(64),archiveSha256:'b'.repeat(64),archiveMd5:'c'.repeat(32),archiveBytes:123};
const initial={id:'p',status:'published',updatedAt:'2026-09-14T00:00:00.000Z',ownerId:'owner',title:'unchanged',splatItems:[{id:'s',splatUrl:old,sizeMb:2,salePrice:500,downloadFileUrl:'/sale.zip',accessLevel:'paid'},{id:'other',splatUrl:'keep'}]};
const request=(body:unknown,origin='https://locahun3d.com')=>new Request('https://locahun3d.com/api/scene-edit',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)});
const data=()=>JSON.parse(sqlite.prepare('SELECT data FROM properties WHERE id=?').get('p').data);
const replace=(property:typeof initial)=>sqlite.prepare('UPDATE properties SET data=?,status=?,updated_at=? WHERE id=?').run(JSON.stringify(property),property.status,property.updatedAt,'p');
const target=async()=> (await (await POST(request({action:'target',propertyId:'p',sceneId:'s'}))).json()).target;
const reserve=async()=> (await POST(request({action:'reserve',target:await target(),digest}))).json();
const verify=(key:string)=>POST(request({action:'verify',key}));
const attach=(key:string,verifiedSha256=digest.archiveSha256)=>POST(request({action:'attach',key,verifiedSha256}));
beforeEach(()=>{
 vi.clearAllMocks();sqlite=new DatabaseSync(':memory:');
 sqlite.exec('CREATE TABLE properties(id TEXT PRIMARY KEY,status TEXT,updated_at TEXT,data TEXT); CREATE TABLE assets(id TEXT PRIMARY KEY,kind TEXT,status TEXT,uploaded_at TEXT,data TEXT)');
 sqlite.exec(readFileSync('migrations/0018_workflow_uploads.sql','utf8'));
 sqlite.prepare('INSERT INTO properties VALUES(?,?,?,?)').run('p',initial.status,initial.updatedAt,JSON.stringify(initial));
 mocks.user.mockResolvedValue({id:'owner'});mocks.access.mockResolvedValue({id:'owner',role:'admin'});
 mocks.db.mockResolvedValue({prepare:(sql:string)=>({bind:(...args:unknown[])=>({first:async()=>sqlite.prepare(sql).get(...args)??null,run:async()=>({meta:{changes:sqlite.prepare(sql).run(...args).changes}})})})});
 mocks.head.mockResolvedValue({size:123,md5:digest.archiveMd5});mocks.put.mockResolvedValue({putUrl:'https://storage.test/put',headers:{'If-None-Match':'*'}});mocks.get.mockResolvedValue('https://storage.test/get');
});
afterEach(()=>{vi.useRealTimers();sqlite.close();});
it('returns an authorized stable target and same-origin source read, never invokes paid viewing',async()=>{
 const response=await POST(request({action:'target',propertyId:'p',sceneId:'s'}));expect(response.status).toBe(200);
 const body=await response.json();expect(body.target).toMatchObject({propertyId:'p',sceneId:'s',status:'published',previousUrl:old,expectedUpdatedAt:initial.updatedAt});expect(body.sourceUrl).toBe('/api/scene-edit/source?sessionKey='+body.target.sessionKey);expect(body.fileName).toBe('original.zip');expect(body.storageOrigin).toBe('https://storage.test');
 expect(mocks.access).toHaveBeenCalledWith('p');expect(sqlite.prepare('SELECT count(*) n FROM assets').get().n).toBe(0);
});
it('published scene roundtrip preserves sale data, registers both assets and is idempotent',async()=>{
 const one=await reserve();expect(one.putUrl).toBe('https://storage.test/put');expect((await verify(one.key)).status).toBe(200);
 expect((await attach(one.key)).status).toBe(200);expect((await (await attach(one.key)).json()).status).toBe('already_attached');
 const after=data();expect(after.status).toBe('published');expect(after.splatItems[0]).toMatchObject({id:'s',salePrice:500,downloadFileUrl:'/sale.zip',accessLevel:'paid'});expect(after.splatItems[1]).toEqual(initial.splatItems[1]);expect(after.splatItems[0].editVersions).toHaveLength(1);expect(after.splatItems[0].editVersions[0].url).toBe(old);expect(sqlite.prepare('SELECT count(*) n FROM assets').get().n).toBe(2);
 expect(mocks.revalidate).toHaveBeenCalledWith('/properties/p');
});
it('rejects foreign origin, unknown fields, oversized body and unauthenticated actor without writes',async()=>{
 expect((await POST(request({action:'target',propertyId:'p',sceneId:'s'},'https://evil.test'))).status).toBe(403);
 expect((await POST(request({action:'target',propertyId:'p',sceneId:'s',extra:true}))).status).toBe(400);
 expect((await POST(request({extra:'x'.repeat(9000)}))).status).toBe(413);
 mocks.user.mockResolvedValue(null);expect((await POST(request({action:'target',propertyId:'p',sceneId:'s'}))).status).toBe(401);
 expect(sqlite.prepare('SELECT count(*) n FROM workflow_uploads').get().n).toBe(0);
});
it('returns 403 for another property or revoked access and prevents actor replay',async()=>{
 const one=await reserve();mocks.access.mockRejectedValue(new Error('forbidden'));expect((await verify(one.key)).status).toBe(403);
 mocks.access.mockResolvedValue({id:'other',role:'admin'});mocks.user.mockResolvedValue({id:'other'});expect((await verify(one.key)).status).toBe(403);
});
it('rejects missing, duplicate, archived and deleted targets',async()=>{
 for(const property of [{...initial,splatItems:[]},{...initial,splatItems:[initial.splatItems[0],initial.splatItems[0]]},{...initial,status:'archived'}]){
  replace(property);expect((await POST(request({action:'target',propertyId:'p',sceneId:'s'}))).status).toBe(409);
 }
 sqlite.exec('DELETE FROM properties');expect((await POST(request({action:'target',propertyId:'p',sceneId:'s'}))).status).toBe(409);
});
it('rejects forged or expired targets and draft-workflow reservation replay',async()=>{
 const t=await target();expect((await POST(request({action:'reserve',target:{...t,previousUrl:'/api/r2/assets/splat/other.zip'},digest}))).status).toBe(409);
 vi.useFakeTimers();vi.setSystemTime(new Date(Date.parse(t.expiresAt)+1));expect((await POST(request({action:'reserve',target:t,digest}))).status).toBe(409);vi.useRealTimers();
 sqlite.prepare('INSERT INTO workflow_uploads VALUES(?,?,?)').run('f'.repeat(64),JSON.stringify({actorId:'owner',propertyId:'p'}),'wf_'+'f'.repeat(64));expect((await verify('f'.repeat(64))).status).toBe(409);
});
it('rejects property changes even with unchanged timestamps and retains old preview',async()=>{
 const one=await reserve();await verify(one.key);replace({...initial,title:'concurrent'});expect((await attach(one.key)).status).toBe(409);expect(data().splatItems[0].splatUrl).toBe(old);
 replace({...initial,splatItems:[{...initial.splatItems[0],splatUrl:'/api/r2/assets/splat/replaced.zip'},initial.splatItems[1]]});expect((await attach(one.key)).status).toBe(409);
});
it('rejects mismatching bytes, MD5, downloaded SHA and storage failures without altering property',async()=>{
 const one=await reserve();expect((await attach(one.key)).status).toBe(409);
 mocks.head.mockResolvedValue({size:124,md5:digest.archiveMd5});expect((await verify(one.key)).status).toBe(409);
 mocks.head.mockResolvedValue({size:123,md5:'d'.repeat(32)});expect((await verify(one.key)).status).toBe(409);
 mocks.head.mockResolvedValue({size:123,md5:digest.archiveMd5});await verify(one.key);expect((await attach(one.key,'e'.repeat(64))).status).toBe(409);
 mocks.head.mockRejectedValue(new Error('offline'));expect((await attach(one.key)).status).toBe(503);expect(data()).toEqual(initial);
});
it('lets a property owner edit drafts but keeps published saves administrator-only',async()=>{
 mocks.access.mockResolvedValue({id:'owner',role:'studio'});
 const published=await POST(request({action:'target',propertyId:'p',sceneId:'s'}));expect(published.status).toBe(403);expect((await published.json()).error).toBe('published_admin_only');
 replace({...initial,status:'draft'});expect((await POST(request({action:'target',propertyId:'p',sceneId:'s'}))).status).toBe(200);
 mocks.access.mockResolvedValue({id:'owner',role:'admin'});const t=await target();replace({...initial,status:'published',updatedAt:initial.updatedAt});
 mocks.access.mockResolvedValue({id:'owner',role:'studio'});expect((await POST(request({action:'reserve',target:t,digest}))).status).toBeGreaterThanOrEqual(403);
});
it('refuses to open sources above the editable size limit',async()=>{
 mocks.head.mockResolvedValue({size:1024**3+1,md5:digest.archiveMd5});
 const response=await POST(request({action:'target',propertyId:'p',sceneId:'s'}));expect(response.status).toBe(413);expect((await response.json()).error).toBe('source_too_large');
});
it('administrator can revert to a retained version; the replaced preview stays in history',async()=>{
 const one=await reserve();await verify(one.key);await attach(one.key);
 const edited=data();const version=edited.splatItems[0].editVersions[0];
 mocks.access.mockResolvedValue({id:'owner',role:'studio'});
 expect((await POST(request({action:'revert',propertyId:'p',sceneId:'s',versionKey:version.key,expectedUpdatedAt:edited.updatedAt}))).status).toBe(403);
 mocks.access.mockResolvedValue({id:'owner',role:'admin'});
 expect((await POST(request({action:'revert',propertyId:'p',sceneId:'s',versionKey:version.key,expectedUpdatedAt:'2020-01-01T00:00:00.000Z'}))).status).toBe(409);
 const response=await POST(request({action:'revert',propertyId:'p',sceneId:'s',versionKey:version.key,expectedUpdatedAt:edited.updatedAt}));expect(response.status).toBe(200);
 const after=data();expect(after.splatItems[0].splatUrl).toBe(old);expect(after.splatItems[0]).toMatchObject({salePrice:500,downloadFileUrl:'/sale.zip',accessLevel:'paid'});
 expect(after.splatItems[0].editVersions.map((v:{url:string})=>v.url)).toContain(edited.splatItems[0].splatUrl);
});
