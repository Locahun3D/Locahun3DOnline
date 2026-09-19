import {getD1} from './d1';
import {computeAssetUsage} from './asset-usage';
import type {Asset,Property} from './schemas';
export const SCENE_EDIT_RESERVATION_GRACE_MS=24*60*60*1000;
/** Protect all deletion entry points, including legacy actions and stale-upload GC. */
export async function sceneEditAssetProtection(asset:Pick<Asset,'id'|'url'>&Partial<Pick<Asset,'r2Key'>>,loadProperties:()=>Promise<Property[]>):Promise<string|null>{
 if(/^wf_[a-f0-9]{64}$/.test(asset.id)){
  const db=await getD1();if(!db)return 'reservation_check_unavailable';
  const reservation=await db.prepare('SELECT binding FROM workflow_uploads WHERE asset_id=?').bind(asset.id).first();
  if(reservation){
   const binding=JSON.parse(reservation.binding);
   if(binding.purpose==='scene-edit-v1'){
    // Protect in-flight uploads until the edit session expires plus a grace period (attach/delete race).
    // After that only history/current references keep it; trimmed history becomes collectable.
    const expires=Date.parse(binding.target?.expiresAt??'');
    if(!Number.isFinite(expires)||Date.now()<expires+SCENE_EDIT_RESERVATION_GRACE_MS)return 'scene_edit_reserved';
   }
  }
 }
 const recovery=computeAssetUsage(await loadProperties(),[asset],{historyOnly:true});
 return (recovery[asset.url]?.length??0)>0?'scene_edit_recovery_in_use':null;
}
