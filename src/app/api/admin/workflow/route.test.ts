import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({admin:vi.fn(),db:vi.fn(),head:vi.fn(),put:vi.fn(),get:vi.fn()}));
vi.mock('@/lib/dal',()=>({requireAdmin:mocks.admin}));
vi.mock('@/lib/d1',()=>({getD1:mocks.db}));
vi.mock('@/lib/uploads',()=>({getUploadMode:async()=> 'r2',createWorkflowUpload:mocks.put,statWorkflowUpload:mocks.head,createPresignedGet:mocks.get}));
import {GET,POST} from './route';
const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite');
let sqlite: InstanceType<typeof DatabaseSync>;
const binding={propertyId:'p',sceneId:'s',expectedUpdatedAt:'2026-09-14T00:00:00.000Z',previousUrl:'old',revision:2,projectSha256:'a'.repeat(64),archiveSha256:'b'.repeat(64),archiveMd5:'c'.repeat(32),archiveBytes:123};
const request=(body:unknown,origin='https://locahun3d.com')=>new Request('https://locahun3d.com/api/admin/workflow',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)});
beforeEach(()=>{
 vi.clearAllMocks(); sqlite=new DatabaseSync(':memory:');
 sqlite.exec('CREATE TABLE properties(id TEXT PRIMARY KEY,status TEXT,updated_at TEXT,data TEXT); CREATE TABLE assets(id TEXT PRIMARY KEY,kind TEXT,status TEXT,uploaded_at TEXT,data TEXT)');
 sqlite.exec(readFileSync('migrations/0018_workflow_uploads.sql','utf8'));
 const property={id:'p',status:'draft',updatedAt:binding.expectedUpdatedAt,title:'unchanged',splatItems:[{id:'s',splatUrl:'old'},{id:'other',splatUrl:'keep'}]};
 sqlite.prepare('INSERT INTO properties VALUES(?,?,?,?)').run('p','draft',property.updatedAt,JSON.stringify(property));
 mocks.admin.mockResolvedValue({id:'admin'});
 mocks.db.mockResolvedValue({prepare:(sql:string)=>({bind:(...args:unknown[])=>({first:async()=>sqlite.prepare(sql).get(...args)??null,run:async()=>({meta:{changes:sqlite.prepare(sql).run(...args).changes}})})})});
 mocks.head.mockResolvedValue({size:123,md5:binding.archiveMd5});
 mocks.put.mockResolvedValue({putUrl:'https://storage.test/put',headers:{'Content-MD5':'zMzMzMzMzMzMzMzMzMzMzA==','If-None-Match':'*'}});
 mocks.get.mockResolvedValue('https://storage.test/get');
});
afterEach(()=>sqlite.close());
it('resolves only the exact draft scene without creating uploads',async()=>{
 const result=await POST(request({action:'target',propertyId:'p',sceneId:'s'}));
 expect(result.status).toBe(200);
 expect(await result.json()).toEqual({propertyId:'p',sceneId:'s',expectedUpdatedAt:binding.expectedUpdatedAt,previousUrl:'old'});
 expect(sqlite.prepare('SELECT count(*) n FROM assets').get().n).toBe(0);
 expect(mocks.put).not.toHaveBeenCalled();
 for(const sceneId of ['missing','S'])expect((await POST(request({action:'target',propertyId:'p',sceneId}))).status).toBe(409);
 sqlite.prepare("UPDATE properties SET status='published'").run();
 expect((await POST(request({action:'target',propertyId:'p',sceneId:'s'}))).status).toBe(409);
});
it('target rejects duplicate scene IDs and inconsistent row snapshots',async()=>{
 const row=sqlite.prepare('SELECT data FROM properties').get();const property=JSON.parse(row.data);
 property.splatItems.push({...property.splatItems[0]});
 sqlite.prepare('UPDATE properties SET data=?').run(JSON.stringify(property));
 expect((await POST(request({action:'target',propertyId:'p',sceneId:'s'}))).status).toBe(409);
 property.splatItems.pop();property.updatedAt='2026-09-15T00:00:00.000Z';
 sqlite.prepare('UPDATE properties SET data=?').run(JSON.stringify(property));
 expect((await POST(request({action:'target',propertyId:'p',sceneId:'s'}))).status).toBe(409);
 expect(sqlite.prepare('SELECT count(*) n FROM assets').get().n).toBe(0);
});
it('authenticated readiness check does not create any property or upload',async()=>{
 expect((await GET()).status).toBe(200);
 expect(mocks.admin).toHaveBeenCalled();
 expect(sqlite.prepare('SELECT count(*) n FROM assets').get().n).toBe(0);
});
it('HTTP reservation, verification and attachment roundtrip is repeatable and scoped',async()=>{
 const reserve=async()=> (await POST(request({action:'reserve',binding}))).json();
 const one=await reserve(),two=await reserve(); expect(one.key).toBe(two.key);
 expect(sqlite.prepare('SELECT count(*) n FROM assets').get().n).toBe(1);
 const verify=await POST(request({action:'verify',key:one.key})); expect(verify.status).toBe(200);
 const attach=()=>POST(request({action:'attach',key:one.key,verifiedSha256:binding.archiveSha256}));
 expect((await attach()).status).toBe(200);expect((await attach()).status).toBe(200);
 const data=JSON.parse(sqlite.prepare('SELECT data FROM properties').get().data);
 expect(data.title).toBe('unchanged'); expect(data.splatItems[1].splatUrl).toBe('keep');
 expect(data.splatItems[0].splatUrl).toMatch(/^\/api\/r2\/assets\/splat\//);
 const again=await reserve();expect(again.putUrl).toBeUndefined();
});
it('rejects cross-origin requests before authentication or writes',async()=>{
 expect((await POST(request({action:'reserve',binding},'https://evil.test'))).status).toBe(403);
 expect(mocks.admin).not.toHaveBeenCalled();expect(sqlite.prepare('SELECT count(*) n FROM assets').get().n).toBe(0);
});
it('authentication failure cannot create assets or be swallowed as a conflict',async()=>{
 mocks.admin.mockRejectedValue(new Error('not authenticated'));
 await expect(POST(request({action:'reserve',binding}))).rejects.toThrow('not authenticated');
 expect(sqlite.prepare('SELECT count(*) n FROM assets').get().n).toBe(0);
});
it('rejects oversized requests and malformed bindings without a reservation',async()=>{
 expect((await POST(request({action:'reserve',binding:{...binding,extra:'x'.repeat(9000)}}))).status).toBe(413);
 expect((await POST(request({action:'reserve',binding:{...binding,archiveBytes:0}}))).status).toBe(400);
 expect(sqlite.prepare('SELECT count(*) n FROM workflow_uploads').get().n).toBe(0);
});
it('requires admin, bound actor, verified digest and unchanged draft',async()=>{
 const one=await (await POST(request({action:'reserve',binding}))).json();
 expect((await POST(request({action:'attach',key:one.key,verifiedSha256:'d'.repeat(64)}))).status).toBe(409);
 mocks.admin.mockResolvedValue({id:'other'});
 expect((await POST(request({action:'verify',key:one.key}))).status).toBe(409);
 mocks.admin.mockResolvedValue({id:'admin'});
 await POST(request({action:'verify',key:one.key}));
 sqlite.prepare('UPDATE properties SET status=?').run('published');
 expect((await POST(request({action:'attach',key:one.key,verifiedSha256:binding.archiveSha256}))).status).toBe(409);
});
it('rejects damaged storage and stale scene without changing the property',async()=>{
 const one=await (await POST(request({action:'reserve',binding}))).json();
 mocks.head.mockResolvedValue({size:123,md5:'d'.repeat(32)});
 expect((await POST(request({action:'verify',key:one.key}))).status).toBe(409);
 expect(JSON.parse(sqlite.prepare('SELECT data FROM properties').get().data).splatItems[0].splatUrl).toBe('old');
 expect((await POST(request({action:'reserve',binding:{...binding,expectedUpdatedAt:'2026-09-13T00:00:00.000Z'}}))).status).toBe(409);
});
