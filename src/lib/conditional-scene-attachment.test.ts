import {createRequire} from 'node:module';
import {describe,it,expect} from 'vitest';
import {attachDraftSceneConditionally} from './conditional-scene-attachment';
const require=createRequire(import.meta.url);
const {DatabaseSync}=require('node:sqlite');

describe('conditional scene attachment on actual SQLite',()=>{
 it('changes only the selected scene and refuses an outdated snapshot',async()=>{
  const db=new DatabaseSync(':memory:');
  try{
   db.exec('CREATE TABLE properties (id TEXT PRIMARY KEY, status TEXT, updated_at TEXT, data TEXT)');
   const property={id:'st-004',status:'draft',updatedAt:'v1',title:'Keep',splatItems:[{id:'a',splatUrl:'',notes:'Keep'},{id:'b',splatUrl:'/other.zip'}]};
   const original=JSON.stringify(property);
   db.prepare('INSERT INTO properties VALUES (?,?,?,?)').run('st-004','draft','v1',original);
   const adapter={prepare:(sql:string)=>({bind:(...args:unknown[])=>({run:async()=>({meta:{changes:Number(db.prepare(sql).run(...args).changes)}})})})};
   const input={propertyId:'st-004',sceneId:'a',expectedJson:original,expectedUpdatedAt:'v1',previousUrl:'',url:'/assets/splat/new.zip',bytes:1024,newUpdatedAt:'v2'};
   expect(await attachDraftSceneConditionally(adapter,input)).toBe(true);
   const saved=JSON.parse(db.prepare('SELECT data FROM properties').get().data);
   expect(saved.title).toBe('Keep');expect(saved.splatItems[0]).toEqual({id:'a',splatUrl:input.url,notes:'Keep',sizeMb:1});expect(saved.splatItems[1]).toEqual(property.splatItems[1]);
   expect(await attachDraftSceneConditionally(adapter,{...input,newUpdatedAt:'v3'})).toBe(false);
   expect(JSON.parse(db.prepare('SELECT data FROM properties').get().data).updatedAt).toBe('v2');
  }finally{db.close();}
 });
 it('same timestamp but changed content also conflicts',async()=>{
  const db=new DatabaseSync(':memory:');
  try{
   db.exec('CREATE TABLE properties (id TEXT PRIMARY KEY, status TEXT, updated_at TEXT, data TEXT)');
   const p={id:'p',status:'draft',updatedAt:'same',splatItems:[{id:'s',splatUrl:''}]};
   db.prepare('INSERT INTO properties VALUES (?,?,?,?)').run('p','draft','same',JSON.stringify({...p,title:'newer edit'}));
   const adapter={prepare:(sql:string)=>({bind:(...args:unknown[])=>({run:async()=>({meta:{changes:Number(db.prepare(sql).run(...args).changes)}})})})};
   expect(await attachDraftSceneConditionally(adapter,{propertyId:'p',sceneId:'s',expectedJson:JSON.stringify(p),expectedUpdatedAt:'same',previousUrl:'',url:'/assets/splat/a.zip',bytes:1,newUpdatedAt:'next'})).toBe(false);
  }finally{db.close();}
 });
 it('rejects published, ambiguous or wrong target before database mutation',async()=>{
  const db={prepare:()=>{throw Error('unexpected database call');}};
  for(const p of [{id:'p',status:'published',updatedAt:'v1',splatItems:[{id:'s',splatUrl:''}]},{id:'p',status:'draft',updatedAt:'v1',splatItems:[{id:'s',splatUrl:''},{id:'s',splatUrl:''}]}]){
   await expect(attachDraftSceneConditionally(db,{propertyId:'p',sceneId:'s',expectedJson:JSON.stringify(p),expectedUpdatedAt:'v1',previousUrl:'',url:'/assets/splat/a.zip',bytes:1,newUpdatedAt:'v2'})).rejects.toThrow();
  }
 });
});
