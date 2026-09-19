import { describe, expect, it } from 'vitest';
import { createSceneReplyGate, saveSceneArchive, sourceRefreshDecision, receiveSceneAttachment, parseSceneSession, sceneRefreshDecision } from './scene-edit-client';

const target = {propertyId:'p',sceneId:'s',expectedUpdatedAt:'2026-09-19T00:00:00.000Z',previousUrl:'/old.zip',propertyRevision:'f'.repeat(64),expiresAt:'2099-01-01T00:00:00.000Z',sessionKey:'a'.repeat(64),status:'published'};
const digest={bytes:3,sha256:'b'.repeat(64),md5:'c'.repeat(32)};
function fixture(failure='') {
 const actions:string[]=[];
 const fetcher:typeof fetch=async (url,options)=>{
  if(options?.method==='PUT') { actions.push('PUT'); if(failure==='network')throw Error('offline');return new Response(null,{status:failure==='put'?500:200}); }
  const body=JSON.parse(String(options?.body));actions.push(body.action);
  if(failure===body.action)return Response.json({}, {status:409});
  if(body.action==='reserve')return Response.json({key:'d'.repeat(64),id:'se_'+ 'd'.repeat(64),status:'uploading',url:'/new.zip',putUrl:'https://storage.test/new.zip',headers:{'Content-MD5':'zMzMzMzMzMzMzMzMzMzMzA==','If-None-Match':'*'}});
  if(body.action==='verify')return Response.json({key:'d'.repeat(64),id:'se_'+ 'd'.repeat(64),downloadUrl:'https://storage.test/new.zip',bytes:3,sha256:digest.sha256});
  return Response.json({status:'attached',key:'d'.repeat(64),propertyId:'p',sceneId:'s',url:'/new.zip',updatedAt:'2026-09-19T01:00:00.000Z'});
 };
 return {actions,options:{target,archive:new File(['zip'],'scene.zip'),origin:'https://app.test',storageOrigin:'https://storage.test',revision:1,signal:new AbortController().signal,fetch:fetcher,hash:async (input:unknown)=>({...digest,sha256:failure==='digest'&&'url' in (input as object)?'e'.repeat(64):digest.sha256})}};
}
describe('scene reply trust',()=>{
 it('rejects wrong origin, wrong frame and duplicate replies',()=>{
  const frame={};const gate=createSceneReplyGate('https://app.test',frame,'request');
  const data={type:'locahun:scene-exported',requestId:'request',archive:new Blob(['zip'])};
  expect(gate({origin:'https://evil.test',source:frame,data})).toBe(false);
  expect(gate({origin:'https://app.test',source:{},data})).toBe(false);
  expect(gate({origin:'https://app.test',source:frame,data})).toBe(true);
  expect(gate({origin:'https://app.test',source:frame,data})).toBe(false);
 });
});
describe('immutable scene save',()=>{
 it('attaches only after PUT and readback verification',async()=>{const f=fixture();expect(await saveSceneArchive(f.options)).toMatchObject({phase:'saved',attached:true,url:'/new.zip'});expect(f.actions).toEqual(['reserve','PUT','verify','attach']);});
 for(const failure of ['put','network','digest'])it(`keeps previous target when ${failure} fails`,async()=>{const f=fixture(failure);expect(await saveSceneArchive(f.options)).toMatchObject({phase:'error',attached:false});expect(f.actions).not.toContain('attach');expect(f.options.target.previousUrl).toBe('/old.zip');});
 it('does not force retry conflicts',async()=>{const f=fixture('attach');expect(await saveSceneArchive(f.options)).toMatchObject({phase:'conflict',attached:false});expect(f.actions.filter(a=>a==='attach')).toHaveLength(1);});
 it('rejects expired sessions before upload',async()=>{const f=fixture();f.options.target={...target,expiresAt:'2000-01-01T00:00:00.000Z'};expect(await saveSceneArchive(f.options)).toMatchObject({phase:'expired',attached:false});expect(f.actions).toEqual([]);});
 it('cancellation cannot attach',async()=>{const f=fixture();const controller=new AbortController();controller.abort();f.options.signal=controller.signal;expect(await saveSceneArchive(f.options)).toMatchObject({phase:'cancelled',attached:false});expect(f.actions).toEqual([]);});
 it('rejects unconfigured storage origins',async()=>{const f=fixture();f.options.storageOrigin='https://other.test';expect(await saveSceneArchive(f.options)).toMatchObject({phase:'error',attached:false});expect(f.actions).toEqual(['reserve']);});
});
it('refreshes clean source even when RHF isDirty remains true; blocks pending writes',()=>{
 expect(sourceRefreshDecision({pending:false,inFlight:false,statusInFlight:false,failed:false})).toBe('reload');
 for(const key of ['pending','inFlight','statusInFlight','failed'] as const)expect(sourceRefreshDecision({pending:false,inFlight:false,statusInFlight:false,failed:false,[key]:true})).toBe('conflict');
});
it('source accepts only its launched editor and freezes autosave before reloading',()=>{
 const child={},calls:string[]=[];
 const options={origin:'https://app.test',propertyId:'p',windows:new Map([[child,'s']]),seen:new Set<string>(),hasPendingChanges:()=>false,freeze:()=>calls.push('freeze'),conflict:()=>calls.push('conflict'),reload:()=>calls.push('reload')};
 const data={type:'locahun:scene-attached',propertyId:'p',sceneId:'s',key:'a'.repeat(64),updatedAt:'2026-09-19T00:00:00Z'};
 expect(receiveSceneAttachment({origin:'https://evil.test',source:child,data},options)).toBe(false);
 expect(receiveSceneAttachment({origin:options.origin,source:{},data},options)).toBe(false);
 expect(receiveSceneAttachment({origin:options.origin,source:child,data:{...data,sceneId:'other'}},options)).toBe(false);
 expect(calls).toEqual([]);
 expect(receiveSceneAttachment({origin:options.origin,source:child,data},options)).toBe(true);
 expect(calls).toEqual(['freeze','reload']);
 expect(receiveSceneAttachment({origin:options.origin,source:child,data},options)).toBe(false);
});
it('source freezes autosave and preserves local edits when external save arrives during debounce',()=>{
 const child={},calls:string[]=[];
 receiveSceneAttachment({origin:'https://app.test',source:child,data:{type:'locahun:scene-attached',propertyId:'p',sceneId:'s',key:'a'.repeat(64),updatedAt:'2026-09-19T00:00:00Z'}},{origin:'https://app.test',propertyId:'p',windows:new Map([[child,'s']]),seen:new Set(),hasPendingChanges:()=>true,freeze:()=>calls.push('freeze'),conflict:()=>calls.push('conflict'),reload:()=>calls.push('reload')});
 expect(calls).toEqual(['freeze','conflict']);
});
describe('session response validation',()=>{
 const session={target,sourceUrl:'/api/scene-edit/source?sessionKey='+target.sessionKey,fileName:'source.rad',storageOrigin:'https://storage.test'};
 it('accepts a bound same-origin source without moving credentials into viewer URL',()=>{expect(parseSceneSession(session,{propertyId:'p',sceneId:'s'})).toMatchObject({sourceUrl:'/api/scene-edit/source?sessionKey='+ 'a'.repeat(64),fileName:'source.rad'});});
 it('rejects absent or malformed storage origin',()=>{for(const storageOrigin of [undefined,'https://storage.test/path','http://storage.test','https://user@storage.test'])expect(()=>parseSceneSession({...session,storageOrigin},{propertyId:'p',sceneId:'s'})).toThrow();});
 it('rejects a mismatched scene, foreign source or extensionless file',()=>{
  for(const bad of [{...session,target:{...target,sceneId:'other'}},{...session,sourceUrl:'https://evil.test/source.zip'},{...session,fileName:'source'}])expect(()=>parseSceneSession(bad,{propertyId:'p',sceneId:'s'})).toThrow();
 });
});
it('reconciles refreshed form only at the expected revision with no intervening edits',()=>{
 expect(sceneRefreshDecision('new','old','old',false)).toBe('wait');
 expect(sceneRefreshDecision('new','old','new',false)).toBe('apply');
 expect(sceneRefreshDecision('new','old','new',true)).toBe('conflict');
 expect(sceneRefreshDecision('new','old','newer',false)).toBe('conflict');
 expect(sceneRefreshDecision(null,'old','new',false)).toBe('wait');
});
