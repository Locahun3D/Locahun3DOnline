import {getCloudflareContext} from '@opennextjs/cloudflare';
import {getCurrentUser} from '@/lib/dal';
import {getD1} from '@/lib/d1';
import {sceneEditSourceKey} from '@/lib/scene-edit-contract';
import {SceneEditError,loadSceneEditSession,sceneEditSnapshot} from '@/lib/scene-edit-session';
import {readStoredRadEntry,mapRangeIntoEntry} from '@/lib/zip-stored-entry';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type ObjectInfo={size:number;httpEtag:string;body?:ReadableStream;range?:{offset?:number;length?:number}};
type Range={offset:number;length?:number}|{suffix:number};
type Bucket={get(key:string,options?:{range:Range}):Promise<ObjectInfo|null>;head(key:string):Promise<ObjectInfo|null>};
const error=(code:string,status:number)=>Response.json({error:code},{status,headers:{'Cache-Control':'no-store'}});
function parseRange(value:string):Range{
 const match=/^bytes=(\d*)-(\d*)$/.exec(value);
 if(!match||(!match[1]&&!match[2]))throw new SceneEditError(416,'invalid_range');
 const start=Number(match[1]),end=Number(match[2]);
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end))throw new SceneEditError(416,'invalid_range');
 if(!match[1]){if(end<1)throw new SceneEditError(416,'invalid_range');return {suffix:end};}
 if(!match[2])return {offset:start};
 if(end<start)throw new SceneEditError(416,'invalid_range');
 return {offset:start,length:end-start+1};
}
export async function GET(req:Request){
 const origin=req.headers.get('origin');
 if((origin&&origin!==new URL(req.url).origin)||req.headers.get('sec-fetch-site')==='cross-site')return error('origin',403);
 const params=new URL(req.url).searchParams;
 // ref=stream: 参照保存のアーカイブが指す「元のRAD」を返す（2026-09-21）。値はこの1つだけ。URLやキーは受け取らない。
 if([...params.keys()].some(key=>key!=='sessionKey'&&key!=='ref')||params.getAll('sessionKey').length!==1||params.getAll('ref').length>1||(params.has('ref')&&params.get('ref')!=='stream'))return error('invalid_request',400);
 const actor=await getCurrentUser();if(!actor)return error('unauthorized',401);
 try{
  const db=await getD1();if(!db)throw new SceneEditError(503,'storage_unavailable');
  const target=await loadSceneEditSession(db,params.get('sessionKey')!,actor.id);
  const snapshot=await sceneEditSnapshot(db,target.propertyId,target.sceneId);
  // 2026-09-21: 配信は「同じファイルのままか」だけを見る。読み込みは Range で分割して数十回に分けて取りに来るため、
  // 途中で物件の別の欄が自動保存される（例: 回転プレビュー動画の撮り直し）と、残りが全部 409 になって読み込みが止まっていた。
  // 上書き防止の厳密な照合（updated_at・全体ハッシュ）は、保存側（/api/scene-edit の reserve/attach）が引き続き行う。
  // 編集画面は開いている間ずっと RAD を少しずつ取りに来る。保存するとシーンのURLは新しいアーカイブに変わるが、
  // このセッションのファイルが「いまのシーン」「その参照元」「保存履歴」のどれかである限りは配信を続ける。
  const scene=snapshot.scene as {splatUrl:string;streamUrl?:string;editVersions?:{url?:string}[]};
  const known=scene.splatUrl===target.previousUrl||scene.streamUrl===target.previousUrl||!!scene.editVersions?.some(v=>v.url===target.previousUrl);
  if(snapshot.row.status!==target.status||!known)throw new SceneEditError(409,'scene_changed');
  const wantsStream=params.get('ref')==='stream';
  const key=sceneEditSourceKey(wantsStream&&scene.streamUrl?scene.streamUrl:target.previousUrl);
  if(!key)return error('source_missing',404);
  const rangeHeader=req.headers.get('range'),range=rangeHeader?parseRange(rangeHeader):undefined;
  const {env}=await getCloudflareContext();const bucket=(env as unknown as {R2_ASSETS?:Bucket}).R2_ASSETS;
  if(!bucket)throw new SceneEditError(503,'storage_unavailable');
  // ref=stream で、元が ZIP のとき: 中に無圧縮で入っている .rad の部分だけを返す（2026-09-21）。
  // ビューアー用の ZIP は .rad を無圧縮で入れてあるので、ZIP 全体を落とさずに段階読み込みできる。
  if(wantsStream&&/\.zip$/i.test(key)){
   const entry=await readStoredRadEntry(async(offset,length)=>{
    const head=await bucket.get(key,{range:{offset,length}});
    return head?new Uint8Array(await new Response(head.body as ReadableStream).arrayBuffer()):null;
   });
   if(!entry)return error('source_missing',404);
   const window=mapRangeIntoEntry(entry,range);
   if(window.length<1)throw new SceneEditError(416,'invalid_range');
   const part=await (req.method==='HEAD'?bucket.head(key):bucket.get(key,{range:window}));
   if(!part)return error('source_missing',404);
   const headers=new Headers({'Content-Type':'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':'no-store','ETag':part.httpEtag,'X-Content-Type-Options':'nosniff','Content-Length':String(range?window.length:entry.size),'X-Stream-Name':entry.name});
   if(req.method==='HEAD'){await part.body?.cancel();return new Response(null,{status:200,headers});}
   if(range){
    const from=window.offset-entry.offset;
    headers.set('Content-Range',`bytes ${from}-${from+window.length-1}/${entry.size}`);
    return new Response(part.body as ReadableStream,{status:206,headers});
   }
   return new Response(part.body as ReadableStream,{status:200,headers});
  }
  if(wantsStream&&!scene.streamUrl)return error('source_missing',404);
  const object=await (req.method==='HEAD'?bucket.head(key):bucket.get(key,range?{range}:undefined));
  if(!object)return error('source_missing',404);
  const headers=new Headers({'Content-Type':'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':'no-store','ETag':object.httpEtag,'X-Content-Type-Options':'nosniff'});
  let status=200,length=object.size;
  if(range&&req.method!=='HEAD'){
   const offset=object.range?.offset,partLength=object.range?.length;
   // Never call arrayBuffer as a metadata fallback: sources may be gigabytes.
   if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(partLength)||offset!<0||partLength!<1||offset!+partLength!>object.size){await object.body?.cancel();throw new SceneEditError(416,'invalid_range');}
   length=partLength!;status=206;headers.set('Content-Range',`bytes ${offset}-${offset!+length-1}/${object.size}`);
  }
  headers.set('Content-Length',String(length));
  return new Response(req.method==='HEAD'?null:object.body,{status,headers});
 }catch(cause){if(cause instanceof SceneEditError)return error(cause.code,cause.status);return error('storage_unavailable',503);}
}
export async function HEAD(req:Request){const response=await GET(req);await response.body?.cancel();return new Response(null,{status:response.status,headers:response.headers});}
