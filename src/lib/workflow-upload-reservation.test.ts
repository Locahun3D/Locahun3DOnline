import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
import {reserveWorkflowUpload} from './workflow-upload-reservation';
const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite');
it('same reservation is reused and a ready asset is never reset',async()=>{
 const sqlite=new DatabaseSync(':memory:');
 try{
  sqlite.exec('CREATE TABLE assets (id TEXT PRIMARY KEY,kind TEXT,status TEXT,uploaded_at TEXT,data TEXT)');
  sqlite.exec(readFileSync('migrations/0018_workflow_uploads.sql','utf8'));
  const db={prepare:(sql:string)=>({bind:(...args:unknown[])=>({run:async()=>sqlite.prepare(sql).run(...args),first:async()=>sqlite.prepare(sql).get(...args)??null})})};
  const key='a'.repeat(64),asset={id:'wf_'+key,kind:'splat',status:'uploading',filename:'scene.zip',r2Key:'assets/splat/scene.zip',size:123,contentType:'application/zip',uploadedAt:'now'};
  const request={key,binding:JSON.stringify({propertyId:'p',sceneId:'s',sha256:'b'.repeat(64)}),asset};
  await reserveWorkflowUpload(db,request);await reserveWorkflowUpload(db,request);
  expect(sqlite.prepare('SELECT count(*) AS n FROM assets').get().n).toBe(1);
  sqlite.prepare('UPDATE assets SET status=?, data=? WHERE id=?').run('ready',JSON.stringify({...asset,status:'ready'}),asset.id);
  expect((await reserveWorkflowUpload(db,request)).status).toBe('ready');
  await expect(reserveWorkflowUpload(db,{...request,binding:'different'})).rejects.toThrow(/binding/);
  expect(sqlite.prepare('SELECT status FROM assets').get().status).toBe('ready');
 }finally{sqlite.close();}
});
it('retry recovers reservation created before interrupted asset insertion',async()=>{
 const sqlite=new DatabaseSync(':memory:');
 try{
  sqlite.exec('CREATE TABLE assets (id TEXT PRIMARY KEY,kind TEXT,status TEXT,uploaded_at TEXT,data TEXT)');
  sqlite.exec(readFileSync('migrations/0018_workflow_uploads.sql','utf8'));
  const key='c'.repeat(64),binding='original',asset={id:'wf_'+key,kind:'splat',status:'uploading',filename:'a.zip',r2Key:'assets/splat/a.zip',size:1,contentType:'application/zip',uploadedAt:'now'};
  sqlite.prepare('INSERT INTO workflow_uploads(job_key,binding,asset_id) VALUES(?,?,?)').run(key,binding,asset.id);
  const db={prepare:(sql:string)=>({bind:(...args:unknown[])=>({run:async()=>sqlite.prepare(sql).run(...args),first:async()=>sqlite.prepare(sql).get(...args)??null})})};
  expect((await reserveWorkflowUpload(db,{key,binding,asset})).id).toBe(asset.id);
 }finally{sqlite.close();}
});
