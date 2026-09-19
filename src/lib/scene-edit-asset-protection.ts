import {getD1} from './d1';
import {computeAssetUsage} from './asset-usage';
import type {Asset,Property} from './schemas';
/** Protect all deletion entry points, including legacy actions and stale-upload GC. */
export async function sceneEditAssetProtection(asset:Pick<Asset,'id'|'url'>&Partial<Pick<Asset,'r2Key'>>,loadProperties:()=>Promise<Property[]>):Promise<string|null>{
 if(/^wf_[a-f0-9]{64}$/.test(asset.id)){
  const db=await getD1();if(!db)return 'reservation_check_unavailable';
  const reservation=await db.prepare('SELECT binding FROM workflow_uploads WHERE asset_id=?').bind(asset.id).first();
  // Retention is deliberate even after expiration, eliminating attach/delete races.
  if(reservation&&JSON.parse(reservation.binding).purpose==='scene-edit-v1')return 'scene_edit_reserved';
 }
 const recovery=computeAssetUsage(await loadProperties(),[asset],{historyOnly:true});
 return (recovery[asset.url]?.length??0)>0?'scene_edit_recovery_in_use':null;
}
