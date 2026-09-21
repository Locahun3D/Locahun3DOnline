import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({user:vi.fn(),access:vi.fn(),db:vi.fn(),bucket:vi.fn(),get:vi.fn(),head:vi.fn()}));
vi.mock('@/lib/dal',()=>({getCurrentUser:mocks.user,assertPropertyAccess:mocks.access}));
vi.mock('@/lib/d1',()=>({getD1:mocks.db}));
vi.mock('@opennextjs/cloudflare',()=>({getCloudflareContext:mocks.bucket}));
import {GET,HEAD} from './route';
const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite');
let sqlite:InstanceType<typeof DatabaseSync>;
const sessionKey='a'.repeat(64),url='https://locahun3d.com/api/scene-edit/source?sessionKey='+sessionKey;
const property={id:'p',status:'published',updatedAt:'2026-09-19T00:00:00.000Z',splatItems:[{id:'s',splatUrl:'/api/r2/assets/splat/scene.rad'}]};
beforeEach(()=>{
 vi.clearAllMocks();sqlite=new DatabaseSync(':memory:');sqlite.exec('CREATE TABLE properties(id TEXT,status TEXT,updated_at TEXT,data TEXT); CREATE TABLE workflow_uploads(job_key TEXT,binding TEXT,asset_id TEXT)');
 sqlite.prepare('INSERT INTO properties VALUES(?,?,?,?)').run('p',property.status,property.updatedAt,JSON.stringify(property));
 const target={propertyId:'p',sceneId:'s',status:'published',expectedUpdatedAt:property.updatedAt,previousUrl:property.splatItems[0].splatUrl,propertyRevision:createHash('sha256').update(JSON.stringify(property)).digest('hex'),expiresAt:new Date(Date.now()+3600000).toISOString(),sessionKey};
 sqlite.prepare('INSERT INTO workflow_uploads VALUES(?,?,?)').run(sessionKey,JSON.stringify({purpose:'scene-edit-v1',kind:'target',actorId:'owner',target}),'se_target_'+sessionKey);
 mocks.user.mockResolvedValue({id:'owner'});mocks.access.mockResolvedValue({id:'owner',role:'admin'});
 mocks.db.mockResolvedValue({prepare:(sql:string)=>({bind:(...args:unknown[])=>({first:async()=>sqlite.prepare(sql).get(...args)??null})})});
 mocks.bucket.mockResolvedValue({env:{R2_ASSETS:{get:mocks.get,head:mocks.head}}});
 mocks.get.mockImplementation(async(_key:string,options?:{range?:unknown})=>({size:6,body:new Response(options?.range?'bcd':'abcdef').body,httpEtag:'"etag"',range:options?.range?{offset:1,length:3}:undefined}));
 mocks.head.mockResolvedValue({size:6,httpEtag:'"etag"'});
});
afterEach(()=>sqlite.close());
it('streams only the session source and preserves HTTP range semantics without buffering',async()=>{
 const whole=await GET(new Request(url));expect(whole.status).toBe(200);expect(await whole.text()).toBe('abcdef');expect(whole.headers.get('cache-control')).toBe('no-store');
 const part=await GET(new Request(url,{headers:{range:'bytes=1-3'}}));expect(part.status).toBe(206);expect(part.headers.get('content-range')).toBe('bytes 1-3/6');expect(await part.text()).toBe('bcd');expect(mocks.get).toHaveBeenLastCalledWith('assets/splat/scene.rad',{range:{offset:1,length:3}});
 const head=await HEAD(new Request(url,{method:'HEAD'}));expect(head.status).toBe(200);expect(await head.text()).toBe('');expect(head.headers.get('content-length')).toBe('6');
});
it('rejects unauthenticated, other actor, revoked access and a replaced scene source before storage; unrelated property edits keep streaming',async()=>{
 mocks.user.mockResolvedValue(null);expect((await GET(new Request(url))).status).toBe(401);
 mocks.user.mockResolvedValue({id:'other'});expect((await GET(new Request(url))).status).toBe(403);
 mocks.user.mockResolvedValue({id:'owner'});mocks.access.mockRejectedValue(new Error('forbidden'));expect((await GET(new Request(url))).status).toBe(403);
 mocks.access.mockResolvedValue({id:'owner',role:'admin'});sqlite.prepare('UPDATE properties SET data=?,updated_at=?').run(JSON.stringify({...property,title:'edited elsewhere',updatedAt:'2026-09-19T00:00:01.000Z'}),'2026-09-19T00:00:01.000Z');expect((await GET(new Request(url))).status).toBe(200);mocks.get.mockClear();
 sqlite.prepare('UPDATE properties SET data=?').run(JSON.stringify({...property,splatItems:[{id:'s',splatUrl:'/api/r2/assets/splat/other.rad'}]}));expect((await GET(new Request(url))).status).toBe(409);expect(mocks.get).not.toHaveBeenCalled();
});
it('rejects invalid ranges, foreign fetches and caller-supplied URLs',async()=>{
 for(const range of ['bytes=4-1','bytes=0-1,4-5','bytes=-0','bytes=999999999999999999999-'])expect((await GET(new Request(url,{headers:{range}}))).status).toBe(416);
 expect((await GET(new Request(url,{headers:{'sec-fetch-site':'cross-site'}}))).status).toBe(403);
 expect((await GET(new Request(url+'&url=https://evil.test'))).status).toBe(400);
});
