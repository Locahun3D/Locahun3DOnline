import {expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({remove:vi.fn(),deleteR2:vi.fn()}));
vi.mock('@/lib/store',()=>({repo:{list:async()=>[]},assetRepo:{get:async()=>({id:'a',url:'/old.zip',r2Key:'uploads/p/old.zip'}),remove:state.remove}}));
vi.mock('@/lib/uploads',()=>({getUploadMode:async()=>'r2',deleteR2Object:state.deleteR2}));
vi.mock('@/lib/dal',()=>({requireAdmin:async()=>({id:'admin'})}));
vi.mock('@/lib/scene-edit-asset-protection',()=>({sceneEditAssetProtection:async()=>'scene_edit_recovery_in_use'}));
import {deleteAssetAction} from './_actions';
it('legacy deletion action rejects recovery before directly deleting R2 bytes',async()=>{
 expect(await deleteAssetAction('a')).toMatchObject({ok:false,reason:'scene_edit_recovery_in_use'});
 expect(state.deleteR2).not.toHaveBeenCalled();expect(state.remove).not.toHaveBeenCalled();
});
