import {createRequire} from 'node:module';
import {afterEach,beforeEach,expect,it} from 'vitest';
import {attachSceneEditConditionally} from './scene-edit-attachment';
import {propertySchema} from './schemas';
import {computeAssetUsage} from './asset-usage';
const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite');
let sqlite:InstanceType<typeof DatabaseSync>;
const old='/api/r2/assets/splat/old.zip',url='/api/r2/assets/splat/new.zip';
const before={id:'p',status:'published',category:'studio',cover:{src:''},updatedAt:'2026-09-19T00:00:00.000Z',splatItems:[{id:'s',splatUrl:old,sizeMb:2,downloadFileUrl:'/sale.zip',salePrice:450,accessLevel:'restricted',futureField:{keep:true}},{id:'other',splatUrl:'/keep.rad'}]};
const input=()=>({propertyId:'p',sceneId:'s',expectedJson:JSON.stringify(before),expectedUpdatedAt:before.updatedAt,status:'published' as const,previousUrl:old,url,bytes:123,newUpdatedAt:'2026-09-19T01:00:00.000Z',key:'a'.repeat(64)});
const db={prepare:(sql:string)=>({bind:(...args:(string|number)[])=>({run:async()=>({meta:{changes:sqlite.prepare(sql).run(...args).changes}})})})};
beforeEach(()=>{sqlite=new DatabaseSync(':memory:');sqlite.exec('CREATE TABLE properties(id TEXT PRIMARY KEY,status TEXT,updated_at TEXT,data TEXT)');sqlite.prepare('INSERT INTO properties VALUES(?,?,?,?)').run('p',before.status,before.updatedAt,JSON.stringify(before));});
afterEach(()=>sqlite.close());
it('changes only preview and timestamp, preserves sales/unknown fields and retains recovery reference',async()=>{
 expect(await attachSceneEditConditionally(db,input())).toBe(true);
 const result=JSON.parse(sqlite.prepare('SELECT data FROM properties').get().data);
 expect(result).toEqual({...before,updatedAt:'2026-09-19T01:00:00.000Z',splatItems:[{...before.splatItems[0],splatUrl:url,sizeMb:1,editVersions:[{url:old,sizeMb:2,savedAt:'2026-09-19T01:00:00.000Z',key:'a'.repeat(64)}]},before.splatItems[1]]});
 const parsed=propertySchema.parse(result);
 expect(parsed.splatItems[0].editVersions?.[0].url).toBe(old);
 expect(computeAssetUsage([parsed],[{url:old},{url}])[old]).toEqual(['p']);
});
it('uses raw preimage, status and timestamp to reject competing writes',async()=>{
 for(const sql of ["UPDATE properties SET data=data||' '","UPDATE properties SET status='draft'","UPDATE properties SET updated_at='new'"]){
  sqlite.prepare('UPDATE properties SET status=?,updated_at=?,data=?').run(before.status,before.updatedAt,JSON.stringify(before));sqlite.exec(sql);
  expect(await attachSceneEditConditionally(db,input())).toBe(false);
 }
});
it('rejects duplicate/missing scenes and changed source before updating',async()=>{
 for(const splatItems of [[],[before.splatItems[0],before.splatItems[0]],[{...before.splatItems[0],splatUrl:'/other.zip'}]])await expect(attachSceneEditConditionally(db,{...input(),expectedJson:JSON.stringify({...before,splatItems})})).rejects.toThrow();
});
it('keeps the original upload plus the latest versions only',async()=>{
 const versions=Array.from({length:5},(_,i)=>({url:`/api/r2/assets/splat/v${i}.zip`,sizeMb:1,savedAt:'2026-09-18T00:00:00.000Z',key:String(i).repeat(64)}));
 const withHistory={...before,splatItems:[{...before.splatItems[0],editVersions:versions},before.splatItems[1]]};
 sqlite.prepare('UPDATE properties SET data=?').run(JSON.stringify(withHistory));
 expect(await attachSceneEditConditionally(db,{...input(),expectedJson:JSON.stringify(withHistory)})).toBe(true);
 const urls=JSON.parse(sqlite.prepare('SELECT data FROM properties').get().data).splatItems[0].editVersions.map((v:{url:string})=>v.url);
 expect(urls).toEqual(['/api/r2/assets/splat/v0.zip','/api/r2/assets/splat/v2.zip','/api/r2/assets/splat/v3.zip','/api/r2/assets/splat/v4.zip',old]);
});
