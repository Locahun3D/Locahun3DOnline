import {createHash} from 'node:crypto';
import {z} from 'zod';
import {requireAdmin} from '@/lib/dal';
import {getD1} from '@/lib/d1';
import {getUploadMode,createWorkflowUpload,statWorkflowUpload,createPresignedGet} from '@/lib/uploads';
import {reserveWorkflowUpload} from '@/lib/workflow-upload-reservation';
import {attachDraftSceneConditionally} from '@/lib/conditional-scene-attachment';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const hex=z.string().regex(/^[a-f0-9]{64}$/);
const bindingSchema=z.object({
 propertyId:z.string().min(1).max(200),sceneId:z.string().min(1).max(200),
 expectedUpdatedAt:z.string().datetime(),previousUrl:z.string().max(2048),
 revision:z.number().int().nonnegative(),projectSha256:hex,archiveSha256:hex,
 archiveMd5:z.string().regex(/^[a-f0-9]{32}$/),archiveBytes:z.number().int().min(1).max(2*1024**3),
}).strict();
const requestSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('reserve'),binding:bindingSchema}).strict(),
 z.object({action:z.literal('verify'),key:hex}).strict(),
 z.object({action:z.literal('attach'),key:hex,verifiedSha256:hex}).strict(),
]);
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});

// Read-only production smoke check; never returns credentials or signed URLs.
export async function GET() {
 await requireAdmin();
 try {
  const db=await getD1();
  if(!db || await getUploadMode()!=='r2')throw new Error('storage');
  const key='0'.repeat(64),r2Key='assets/splat/wf_'+key+'-project.zip';
  await db.prepare('SELECT job_key FROM workflow_uploads WHERE job_key=?').bind(key).first();
  await statWorkflowUpload(r2Key);
  await createWorkflowUpload({r2Key,md5:'0'.repeat(32)});
  return reply({ready:true,storage:'r2',reservationSchema:1});
 }catch{return reply({ready:false,error:'workflow_storage_unavailable'},503);}
}

export async function POST(req:Request) {
 const origin=req.headers.get('origin');
 if ((origin && origin!==new URL(req.url).origin) || req.headers.get('sec-fetch-site')==='cross-site') return reply({error:'origin'},403);
 // Next authentication redirects must not be swallowed by the conflict handler.
 const actor=await requireAdmin();
 let input:z.infer<typeof requestSchema>;
 try {
  if (!req.headers.get('content-type')?.startsWith('application/json')) return reply({error:'content_type'},415);
  const reader=req.body?.getReader();if(!reader)return reply({error:'body'},400);
  const chunks:Uint8Array[]=[];let bytes=0;
  try {for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>8192){void reader.cancel();return reply({error:'too_large'},413);}chunks.push(value);}}
  finally {reader.releaseLock();}
  input=requestSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
 } catch {return reply({error:'invalid_request'},400);}
 const db=await getD1();
 if (!db || await getUploadMode()!=='r2') return reply({error:'workflow_storage_unavailable'},503);
 try {
  let key:string,binding:z.infer<typeof bindingSchema>;
  if(input.action==='reserve') {
   binding=input.binding;
   key=createHash('sha256').update(JSON.stringify({actorId:actor.id,...binding})).digest('hex');
  } else {
   key=input.key;
   const row=await db.prepare('SELECT binding,asset_id FROM workflow_uploads WHERE job_key=?').bind(key).first();
   if(!row || row.asset_id!=='wf_'+key)throw new Error('reservation');
   const saved=JSON.parse(row.binding);
   if(saved.actorId!==actor.id)throw new Error('actor');
   const {actorId:_,...fields}=saved;void _;binding=bindingSchema.parse(fields);
  }
  const r2Key='assets/splat/wf_'+key+'-project.zip',url='/api/r2/'+r2Key;
  const row=await db.prepare('SELECT data,status,updated_at FROM properties WHERE id=?').bind(binding.propertyId).first();
  if(!row || row.status!=='draft')throw new Error('draft');
  const property=JSON.parse(row.data);
  const scenes=property.splatItems?.filter((s:{id?:string})=>s?.id===binding.sceneId);
  if(property.id!==binding.propertyId || property.status!=='draft' || scenes?.length!==1)throw new Error('scene');
  const attached=scenes[0].splatUrl===url && scenes[0].sizeMb===Math.max(1,Math.round(binding.archiveBytes/1024/1024));
  if(!attached && (property.updatedAt!==binding.expectedUpdatedAt || row.updated_at!==binding.expectedUpdatedAt || (scenes[0].splatUrl||'')!==binding.previousUrl))throw new Error('changed');
  const asset=await reserveWorkflowUpload(db,{key,binding:JSON.stringify({actorId:actor.id,...binding}),asset:{
   id:'wf_'+key,kind:'splat',status:'uploading',filename:'project.zip',r2Key,size:binding.archiveBytes,
   contentType:'application/zip',uploadedAt:new Date().toISOString(),label:'project',ext:'.zip',url,thumbnailUrl:'',tags:[],
  }});
  if(input.action==='reserve') {
   const upload=asset.status==='ready'?{}:await createWorkflowUpload({r2Key,md5:binding.archiveMd5});
   return reply({key,id:asset.id,status:asset.status,url,...upload});
  }
  const stored=await statWorkflowUpload(r2Key);
  if(stored?.size!==binding.archiveBytes || stored.md5!==binding.archiveMd5)throw new Error('storage_integrity');
  if(input.action==='verify') {
   await db.prepare("UPDATE assets SET status='ready',data=? WHERE id=? AND data=? AND status='uploading'")
    .bind(JSON.stringify({...asset,status:'ready'}),asset.id,JSON.stringify(asset)).run();
   const ready=await db.prepare('SELECT data FROM assets WHERE id=?').bind(asset.id).first();
   if(!ready || JSON.parse(ready.data).status!=='ready')throw new Error('ready');
   return reply({key,id:asset.id,downloadUrl:await createPresignedGet(r2Key),bytes:binding.archiveBytes,sha256:binding.archiveSha256});
  }
  if(asset.status!=='ready' || input.verifiedSha256!==binding.archiveSha256)throw new Error('unverified');
  if(!attached) {
   const newUpdatedAt=new Date(Math.max(Date.now(),Date.parse(binding.expectedUpdatedAt)+1)).toISOString();
   if(!await attachDraftSceneConditionally(db,{propertyId:binding.propertyId,sceneId:binding.sceneId,expectedJson:row.data,expectedUpdatedAt:binding.expectedUpdatedAt,previousUrl:binding.previousUrl,url,bytes:binding.archiveBytes,newUpdatedAt}))throw new Error('conflict');
  }
  const result=await db.prepare('SELECT data,status FROM properties WHERE id=?').bind(binding.propertyId).first();
  const resultProperty=result && JSON.parse(result.data);
  const finalScenes=resultProperty?.splatItems?.filter((s:{id?:string})=>s?.id===binding.sceneId);
  if(result?.status!=='draft' || finalScenes?.length!==1 || finalScenes[0].splatUrl!==url || finalScenes[0].sizeMb!==Math.max(1,Math.round(binding.archiveBytes/1024/1024)))throw new Error('readback');
  return reply({status:attached?'already_attached':'attached',key,propertyId:binding.propertyId,sceneId:binding.sceneId,url,updatedAt:resultProperty.updatedAt});
 } catch {return reply({error:'workflow_conflict'},409);}
}
