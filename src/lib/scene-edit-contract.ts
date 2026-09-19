import {z} from 'zod';
const hex=z.string().regex(/^[a-f0-9]{64}$/);
const id=z.string().min(1).max(200);
export const sceneEditTargetSchema=z.object({
 propertyId:id,sceneId:id,expectedUpdatedAt:z.string().datetime(),previousUrl:z.string().min(1).max(2048),
 propertyRevision:hex,expiresAt:z.string().datetime(),sessionKey:hex,status:z.enum(['draft','published']),
}).strict();
export const sceneEditDigestSchema=z.object({
 revision:z.number().int().nonnegative(),projectSha256:hex,archiveSha256:hex,
 archiveMd5:z.string().regex(/^[a-f0-9]{32}$/),archiveBytes:z.number().int().min(1).max(2*1024**3),
}).strict();
export const sceneEditRequestSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('target'),propertyId:id,sceneId:id}).strict(),
 z.object({action:z.literal('reserve'),target:sceneEditTargetSchema,digest:sceneEditDigestSchema}).strict(),
 z.object({action:z.literal('verify'),key:hex}).strict(),
 z.object({action:z.literal('attach'),key:hex,verifiedSha256:hex}).strict(),
 z.object({action:z.literal('revert'),propertyId:id,sceneId:id,versionKey:hex,expectedUpdatedAt:z.string().datetime()}).strict(),
]);
/** Editing larger sources is refused: the browser must re-archive and re-download the whole project. */
export const sceneEditMaxSourceBytes=()=>{const v=Number(process.env.SCENE_EDIT_MAX_SOURCE_BYTES);return Number.isSafeInteger(v)&&v>0?v:1024**3;};
export type SceneEditTarget=z.infer<typeof sceneEditTargetSchema>;
export type SceneEditDigest=z.infer<typeof sceneEditDigestSchema>;
export type SceneEditReceipt={status:'attached'|'already_attached';key:string;propertyId:string;sceneId:string;url:string;updatedAt:string};
/** No URL normalization: reject traversal, encoded paths, query strings and foreign hosts. */
export function sceneEditSourceKey(url:string):string|null{
 if(typeof url!=='string'||!/^\/(?:api\/r2\/)?(?:assets\/splat|uploads)\/[A-Za-z0-9_./-]+\.(?:zip|rad|ply|splat|ksplat)$/i.test(url))return null;
 const key=url.replace(/^\/(?:api\/r2\/)?/,'');
 return key.split('/').some(part=>!part||part==='.'||part==='..')?null:key;
}
