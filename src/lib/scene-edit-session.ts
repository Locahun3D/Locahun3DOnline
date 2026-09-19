import {createHash} from 'node:crypto';
import {z} from 'zod';
import {assertPropertyAccess} from './dal';
import {type D1} from './d1';
import {sceneEditTargetSchema,sceneEditSourceKey,type SceneEditTarget} from './scene-edit-contract';
export const SCENE_EDIT_PURPOSE='scene-edit-v1';
export class SceneEditError extends Error{
 constructor(public status:number,public code:string){super(code);}
}
export const sceneEditHash=(text:string)=>createHash('sha256').update(text).digest('hex');
export async function sceneEditAccess(propertyId:string){
 try{return await assertPropertyAccess(propertyId);}catch(error){
  if(error instanceof Error&&['forbidden','unauthorized'].includes(error.message))throw new SceneEditError(error.message==='unauthorized'?401:403,error.message);
  throw error;
 }
}
export async function sceneEditSnapshot(db:D1,propertyId:string,sceneId:string){
 const row=await db.prepare('SELECT data,status,updated_at FROM properties WHERE id=?').bind(propertyId).first();
 if(!row||!['draft','published'].includes(row.status)||typeof row.data!=='string')throw new SceneEditError(409,'scene_changed');
 const property=JSON.parse(row.data),scenes=property.splatItems?.filter((s:{id?:string}|null)=>s?.id===sceneId);
 if(property.id!==propertyId||property.status!==row.status||property.updatedAt!==row.updated_at||scenes?.length!==1||!sceneEditSourceKey(scenes[0].splatUrl))throw new SceneEditError(409,'scene_changed');
 z.string().datetime().parse(row.updated_at);
 return {row,property,scene:scenes[0]};
}
export function sceneEditMatches(snapshot:Awaited<ReturnType<typeof sceneEditSnapshot>>,target:SceneEditTarget){
 return snapshot.row.status===target.status&&snapshot.row.updated_at===target.expectedUpdatedAt&&snapshot.scene.splatUrl===target.previousUrl&&sceneEditHash(snapshot.row.data)===target.propertyRevision;
}
export async function loadSceneEditSession(db:D1,sessionKey:string,actorId:string):Promise<SceneEditTarget>{
 if(!/^[a-f0-9]{64}$/.test(sessionKey))throw new SceneEditError(400,'invalid_session');
 const row=await db.prepare('SELECT binding,asset_id FROM workflow_uploads WHERE job_key=?').bind(sessionKey).first();
 if(!row||row.asset_id!=='se_target_'+sessionKey)throw new SceneEditError(409,'invalid_session');
 const saved=JSON.parse(row.binding);
 if(saved.purpose!==SCENE_EDIT_PURPOSE||saved.kind!=='target')throw new SceneEditError(409,'invalid_session');
 if(saved.actorId!==actorId)throw new SceneEditError(403,'forbidden');
 const target=sceneEditTargetSchema.parse(saved.target);
 if(target.sessionKey!==sessionKey||Date.parse(target.expiresAt)<=Date.now())throw new SceneEditError(409,'session_expired');
 sceneEditPublishPolicy(await sceneEditAccess(target.propertyId),target.status);
 return target;
}
/** Published scenes change what every viewer sees immediately; only administrators may save them. */
export function sceneEditPublishPolicy(user:{role?:string}|null|undefined,status:string){
 if(status==='published'&&user?.role!=='admin')throw new SceneEditError(403,'published_admin_only');
}
