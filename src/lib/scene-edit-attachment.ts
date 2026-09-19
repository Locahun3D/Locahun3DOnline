import {sceneEditSourceKey} from './scene-edit-contract';
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
 scene.editVersions=[...(scene.editVersions??[]),{url:scene.splatUrl,sizeMb:scene.sizeMb??0,savedAt:b.newUpdatedAt,key:b.key}];
 scene.splatUrl=b.url;scene.sizeMb=Math.max(1,Math.round(b.bytes/1024**2));property.updatedAt=b.newUpdatedAt;
 const result=await db.prepare('UPDATE properties SET data=?, updated_at=? WHERE id=? AND status=? AND updated_at=? AND data=?')
 .bind(JSON.stringify(property),b.newUpdatedAt,b.propertyId,b.status,b.expectedUpdatedAt,b.expectedJson).run();
 if(result.meta?.changes!==0&&result.meta?.changes!==1)throw new Error('Unconfirmed conditional update');
 return result.meta.changes===1;
}
