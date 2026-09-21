import {sceneEditSourceKey} from './scene-edit-contract';
export const SCENE_EDIT_HISTORY_LIMIT=5;
type Database={prepare(sql:string):{bind(...values:(string|number)[]):{run():Promise<{meta?:{changes?:number}}>}}};
type Attachment={propertyId:string;sceneId:string;expectedJson:string;expectedUpdatedAt:string;status:'draft'|'published';previousUrl:string;url:string;bytes:number;newUpdatedAt:string;key:string};
// Internal primitive: caller authenticates and checks immutable upload integrity, then reads back.
export async function attachSceneEditConditionally(db:Database,b:Attachment):Promise<boolean>{
 if(!b.propertyId||!b.sceneId||!['draft','published'].includes(b.status)||!sceneEditSourceKey(b.previousUrl)||!sceneEditSourceKey(b.url)||
 !/^[a-f0-9]{64}$/.test(b.key)||!Number.isSafeInteger(b.bytes)||b.bytes<1||b.bytes>2*1024**3||
 !Number.isFinite(Date.parse(b.newUpdatedAt))||Date.parse(b.newUpdatedAt)<=Date.parse(b.expectedUpdatedAt)||b.expectedJson.length>16*1024**2)throw new Error('Invalid attachment');
 const property=JSON.parse(b.expectedJson);
 const scenes=property.splatItems?.filter((s:{id?:string}|null)=>s?.id===b.sceneId);
 if(property.id!==b.propertyId||property.status!==b.status||property.updatedAt!==b.expectedUpdatedAt||scenes?.length!==1||scenes[0].splatUrl!==b.previousUrl)throw new Error('Changed scene');
 const scene=scenes[0];
 if(scene.editVersions!==undefined&&!Array.isArray(scene.editVersions))throw new Error('Invalid history');
 const history=[...(scene.editVersions??[]),{url:scene.splatUrl,sizeMb:scene.sizeMb??0,savedAt:b.newUpdatedAt,key:b.key}];
 // Keep the original upload plus the latest versions; older ones lose protection and become collectable.
 scene.editVersions=history.length>SCENE_EDIT_HISTORY_LIMIT?[history[0],...history.slice(-(SCENE_EDIT_HISTORY_LIMIT-1))]:history;
 // 参照保存: RAD を編集して保存したら、その RAD を「段階読み込みの元ファイル」として覚えておく。
 // 以降の保存（.zip → .zip）では変えない。editVersions[0]（最初のアップロード）は常に残るので、元ファイルは掃除されない。
 if(/\.rad$/i.test(b.previousUrl)){scene.streamUrl=b.previousUrl;scene.streamSizeMb=scene.sizeMb??0;}
 scene.splatUrl=b.url;scene.sizeMb=Math.max(1,Math.round(b.bytes/1024**2));property.updatedAt=b.newUpdatedAt;
 const result=await db.prepare('UPDATE properties SET data=?, updated_at=? WHERE id=? AND status=? AND updated_at=? AND data=?')
 .bind(JSON.stringify(property),b.newUpdatedAt,b.propertyId,b.status,b.expectedUpdatedAt,b.expectedJson).run();
 if(result.meta?.changes!==0&&result.meta?.changes!==1)throw new Error('Unconfirmed conditional update');
 return result.meta.changes===1;
}
type Revert={propertyId:string;sceneId:string;expectedJson:string;expectedUpdatedAt:string;status:'draft'|'published';versionKey:string;newUpdatedAt:string;newKey:string};
/** Switch the scene preview back to a retained version. The current preview is kept in history, so a revert is itself reversible. */
export async function revertSceneEditConditionally(db:Database,b:Revert):Promise<{ok:true;url:string}|{ok:false;reason:'changed'|'unknown_version'}>{
 if(!/^[a-f0-9]{64}$/.test(b.versionKey)||!/^[a-f0-9]{64}$/.test(b.newKey)||Date.parse(b.newUpdatedAt)<=Date.parse(b.expectedUpdatedAt))throw new Error('Invalid revert');
 const property=JSON.parse(b.expectedJson);
 const scenes=property.splatItems?.filter((s:{id?:string}|null)=>s?.id===b.sceneId);
 if(property.id!==b.propertyId||property.status!==b.status||property.updatedAt!==b.expectedUpdatedAt||scenes?.length!==1)return {ok:false,reason:'changed'};
 const scene=scenes[0];
 const version=(scene.editVersions??[]).find((v:{key?:string})=>v.key===b.versionKey);
 if(!version||!sceneEditSourceKey(version.url))return {ok:false,reason:'unknown_version'};
 const history=[...scene.editVersions,{url:scene.splatUrl,sizeMb:scene.sizeMb??0,savedAt:b.newUpdatedAt,key:b.newKey}];
 scene.editVersions=history.length>SCENE_EDIT_HISTORY_LIMIT?[history[0],...history.slice(-(SCENE_EDIT_HISTORY_LIMIT-1))]:history;
 // Never drop the version we are switching to from protection.
 if(!scene.editVersions.some((v:{url:string})=>v.url===version.url))scene.editVersions.splice(1,0,version);
 scene.splatUrl=version.url;scene.sizeMb=version.sizeMb??scene.sizeMb;property.updatedAt=b.newUpdatedAt;
 const result=await db.prepare('UPDATE properties SET data=?, updated_at=? WHERE id=? AND status=? AND updated_at=? AND data=?')
 .bind(JSON.stringify(property),b.newUpdatedAt,b.propertyId,b.status,b.expectedUpdatedAt,b.expectedJson).run();
 return result.meta?.changes===1?{ok:true,url:version.url}:{ok:false,reason:'changed'};
}
