import {randomBytes} from 'node:crypto';
import {revalidatePath} from 'next/cache';
import {getCurrentUser} from '@/lib/dal';
import {getD1} from '@/lib/d1';
import {getUploadMode,getWorkflowStorageOrigin,createWorkflowUpload,statWorkflowUpload,createPresignedGet} from '@/lib/uploads';
import {reserveWorkflowUpload} from '@/lib/workflow-upload-reservation';
import {sceneEditMaxSourceBytes,sceneEditRequestSchema,sceneEditTargetSchema,sceneEditDigestSchema,sceneEditSourceKey,type SceneEditTarget,type SceneEditDigest,type SceneEditReceipt} from '@/lib/scene-edit-contract';
import {attachSceneEditConditionally,revertSceneEditConditionally} from '@/lib/scene-edit-attachment';
import {readStoredRadEntry} from '@/lib/zip-stored-entry';
import {getCloudflareContext} from '@opennextjs/cloudflare';
import {SCENE_EDIT_PURPOSE,SceneEditError,sceneEditPublishPolicy,sceneEditAccess,sceneEditSnapshot,sceneEditMatches,sceneEditHash,loadSceneEditSession} from '@/lib/scene-edit-session';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const conflict=(code:string):never=>{throw new SceneEditError(409,code);};

export async function POST(req:Request){
 const origin=req.headers.get('origin');
 if((origin&&origin!==new URL(req.url).origin)||req.headers.get('sec-fetch-site')==='cross-site')return reply({error:'origin'},403);
 const actor=await getCurrentUser();if(!actor)return reply({error:'unauthorized'},401);
 let input;
 try{
  if(!req.headers.get('content-type')?.startsWith('application/json'))return reply({error:'content_type'},415);
  const reader=req.body?.getReader();if(!reader)return reply({error:'body'},400);
  const chunks:Uint8Array[]=[];let bytes=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>8192){void reader.cancel();return reply({error:'too_large'},413);}chunks.push(value);}}
  finally{reader.releaseLock();}
  input=sceneEditRequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
 }catch{return reply({error:'invalid_request'},400);}
 try{
  const db=await getD1();if(!db||await getUploadMode()!=='r2')throw new SceneEditError(503,'storage_unavailable');
  if(input.action==='target'){
   const user=await sceneEditAccess(input.propertyId);
   const snapshot=await sceneEditSnapshot(db,input.propertyId,input.sceneId);
   sceneEditPublishPolicy(user,snapshot.row.status);
   const sourceKey=sceneEditSourceKey(snapshot.scene.splatUrl)!;
   const source=await statWorkflowUpload(sourceKey);
   if(!source)conflict('source_missing');
   if(source!.size>sceneEditMaxSourceBytes())throw new SceneEditError(413,'source_too_large');
   const target:SceneEditTarget=sceneEditTargetSchema.parse({propertyId:input.propertyId,sceneId:input.sceneId,expectedUpdatedAt:snapshot.row.updated_at,previousUrl:snapshot.scene.splatUrl,propertyRevision:sceneEditHash(snapshot.row.data),expiresAt:new Date(Date.now()+24*60*60*1000).toISOString(),sessionKey:randomBytes(32).toString('hex'),status:snapshot.row.status});
   const storageOrigin=new URL(await getWorkflowStorageOrigin()).origin;
   // 段階読み込みできるか（2026-09-21）。元が .rad ならそのまま、ZIP なら中の無圧縮 .rad を見る。
   // できる場合は、編集画面が ZIP 全体を落とさずに Range で少しずつ読む。
   // ただし、一度でも編集して保存したシーン（streamUrl がある）は、置いたモデルや経路が入った
   // プロジェクトを開く必要がある。その場合は本体だけを流し込まず、従来どおりアーカイブを読む
   // （アーカイブは 3DGS 本体を含まないので小さい。本体は ?ref=stream で段階読み込みする）。
   let streamFileName='';
   const streamKey=snapshot.scene.streamUrl?'':sourceKey;
   if(/\.rad$/i.test(streamKey))streamFileName=streamKey.split('/').at(-1)!;
   else if(/\.zip$/i.test(streamKey)){
    try{
     const {env}=await getCloudflareContext();
     const bucket=(env as unknown as {R2_ASSETS?:{get(key:string,options?:{range:{offset:number;length:number}}):Promise<{body?:ReadableStream}|null>}}).R2_ASSETS;
     if(bucket){
      const entry=await readStoredRadEntry(async(offset,length)=>{
       const head=await bucket.get(streamKey,{range:{offset,length}});
       return head?.body?new Uint8Array(await new Response(head.body).arrayBuffer()):null;
      });
      if(entry)streamFileName=entry.name;
     }
    }catch{/* 判定できないときは ZIP 全体を落とす従来どおりの読み込みにする */}
   }
   await db.prepare('INSERT INTO workflow_uploads(job_key,binding,asset_id) VALUES(?,?,?)').bind(target.sessionKey,JSON.stringify({purpose:SCENE_EDIT_PURPOSE,kind:'target',actorId:actor.id,target}),'se_target_'+target.sessionKey).run();
   return reply({target,sourceUrl:'/api/scene-edit/source?sessionKey='+target.sessionKey,fileName:sourceKey.split('/').at(-1),storageOrigin,streamFileName});
  }
  if(input.action==='revert'){
   const user=await sceneEditAccess(input.propertyId);
   if(user?.role!=='admin')throw new SceneEditError(403,'admin_only');
   const snapshot=await sceneEditSnapshot(db,input.propertyId,input.sceneId);
   if(snapshot.row.updated_at!==input.expectedUpdatedAt)conflict('scene_changed');
   const newUpdatedAt=new Date(Math.max(Date.now(),Date.parse(input.expectedUpdatedAt)+1)).toISOString();
   const result=await revertSceneEditConditionally(db,{propertyId:input.propertyId,sceneId:input.sceneId,expectedJson:snapshot.row.data,expectedUpdatedAt:input.expectedUpdatedAt,status:snapshot.row.status,versionKey:input.versionKey,newUpdatedAt,newKey:sceneEditHash('revert:'+snapshot.scene.splatUrl+':'+newUpdatedAt)});
   if(!result.ok)conflict(result.reason==='unknown_version'?'unknown_version':'scene_changed');
   for(const path of ['/properties','/en/properties','/properties/'+input.propertyId,'/en/properties/'+input.propertyId,'/admin/properties','/admin/properties/'+input.propertyId+'/edit','/dashboard'])revalidatePath(path);
   return reply({status:'reverted',propertyId:input.propertyId,sceneId:input.sceneId,url:(result as {url:string}).url,updatedAt:newUpdatedAt});
  }
  let target:SceneEditTarget,digest:SceneEditDigest,key:string,binding:string;
  if(input.action==='reserve'){
   target=input.target;digest=input.digest;
   const saved=await loadSceneEditSession(db,target.sessionKey,actor.id);
   if(JSON.stringify(saved)!==JSON.stringify(target))conflict('target_changed');
   binding=JSON.stringify({purpose:SCENE_EDIT_PURPOSE,actorId:actor.id,target,digest});key=sceneEditHash(binding);
  }else{
   key=input.key;
   const reservation=await db.prepare('SELECT binding,asset_id FROM workflow_uploads WHERE job_key=?').bind(key).first();
   if(!reservation||reservation.asset_id!=='wf_'+key)conflict('reservation');
   binding=reservation.binding;const saved=JSON.parse(binding);
   if(saved.purpose!==SCENE_EDIT_PURPOSE||sceneEditHash(binding)!==key)conflict('reservation');
   if(saved.actorId!==actor.id)throw new SceneEditError(403,'forbidden');
   target=sceneEditTargetSchema.parse(saved.target);digest=sceneEditDigestSchema.parse(saved.digest);
   if(JSON.stringify(await loadSceneEditSession(db,target.sessionKey,actor.id))!==JSON.stringify(target))conflict('target_changed');
  }
  const snapshot=await sceneEditSnapshot(db,target.propertyId,target.sceneId);
  const r2Key='assets/splat/wf_'+key+'-project.zip',url='/api/r2/'+r2Key;
  const sizeMb=Math.max(1,Math.round(digest.archiveBytes/1024**2));
  const attached=snapshot.row.status===target.status&&snapshot.scene.splatUrl===url&&snapshot.scene.sizeMb===sizeMb&&snapshot.scene.editVersions?.some((v:{key?:string;url?:string})=>v.key===key&&v.url===target.previousUrl);
  if(!attached&&!sceneEditMatches(snapshot,target))conflict('scene_changed');
  const asset=await reserveWorkflowUpload(db,{key,binding,asset:{id:'wf_'+key,kind:'splat',status:'uploading',filename:'project.zip',r2Key,size:digest.archiveBytes,contentType:'application/zip',uploadedAt:new Date().toISOString(),label:'project',ext:'.zip',url,thumbnailUrl:'',tags:[]}});
  if(input.action==='reserve')return reply({key,id:asset.id,status:asset.status,url,...(asset.status==='ready'?{}:await createWorkflowUpload({r2Key,md5:digest.archiveMd5}))});
  const stored=await statWorkflowUpload(r2Key);
  if(stored?.size!==digest.archiveBytes||stored.md5!==digest.archiveMd5)conflict('storage_integrity');
  if(input.action==='verify'){
   await db.prepare("UPDATE assets SET status='ready',data=? WHERE id=? AND data=? AND status='uploading'").bind(JSON.stringify({...asset,status:'ready'}),asset.id,JSON.stringify(asset)).run();
   const ready=await db.prepare('SELECT data FROM assets WHERE id=?').bind(asset.id).first();
   if(!ready||JSON.parse(ready.data).status!=='ready')conflict('unverified');
   return reply({key,id:asset.id,downloadUrl:await createPresignedGet(r2Key),bytes:digest.archiveBytes,sha256:digest.archiveSha256});
  }
  if(asset.status!=='ready'||input.verifiedSha256!==digest.archiveSha256)conflict('unverified');
  if(!attached){
   // Register legacy source assets too. Its URL remains referenced by editVersions.
   const sourceKey=sceneEditSourceKey(target.previousUrl)!;
   const original=await db.prepare("SELECT data FROM assets WHERE json_extract(data,'$.r2Key')=?").bind(sourceKey).first();
   if(!original){
    const source=await statWorkflowUpload(sourceKey);if(!source)throw new SceneEditError(409,'source_missing');
    const sourceAsset={id:'se_source_'+sceneEditHash(sourceKey),kind:'splat',status:'ready',filename:sourceKey.split('/').at(-1),r2Key:sourceKey,url:target.previousUrl,size:source.size,contentType:'application/octet-stream',uploadedAt:new Date().toISOString(),label:'original',ext:sourceKey.slice(sourceKey.lastIndexOf('.')),thumbnailUrl:'',tags:[]};
    await db.prepare('INSERT INTO assets(id,kind,status,uploaded_at,data) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(sourceAsset.id,sourceAsset.kind,sourceAsset.status,sourceAsset.uploadedAt,JSON.stringify(sourceAsset)).run();
   }
   const newUpdatedAt=new Date(Math.max(Date.now(),Date.parse(target.expectedUpdatedAt)+1)).toISOString();
   if(!await attachSceneEditConditionally(db,{propertyId:target.propertyId,sceneId:target.sceneId,expectedJson:snapshot.row.data,expectedUpdatedAt:target.expectedUpdatedAt,status:target.status,previousUrl:target.previousUrl,url,bytes:digest.archiveBytes,newUpdatedAt,key}))conflict('scene_changed');
  }
  const final=await sceneEditSnapshot(db,target.propertyId,target.sceneId);
  if(final.row.status!==target.status||final.scene.splatUrl!==url||final.scene.sizeMb!==sizeMb||!final.scene.editVersions?.some((v:{key?:string;url?:string})=>v.key===key&&v.url===target.previousUrl))conflict('readback');
  for(const path of ['/properties','/en/properties','/properties/'+target.propertyId,'/en/properties/'+target.propertyId,'/admin/properties','/admin/properties/'+target.propertyId+'/edit','/dashboard'])revalidatePath(path);
  const receipt:SceneEditReceipt={status:attached?'already_attached':'attached',key,propertyId:target.propertyId,sceneId:target.sceneId,url,updatedAt:final.property.updatedAt};
  return reply(receipt);
 }catch(error){
  if(error instanceof SceneEditError)return reply({error:error.code},error.status);
  return reply({error:'storage_unavailable'},503);
 }
}
