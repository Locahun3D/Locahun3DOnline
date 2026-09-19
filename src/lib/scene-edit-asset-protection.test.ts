import {expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({binding:JSON.stringify({purpose:'scene-edit-v1'})}));
vi.mock('./d1',()=>({getD1:async()=>({prepare:()=>({bind:()=>({first:async()=>({binding:state.binding})})})})}));
import {sceneEditAssetProtection} from './scene-edit-asset-protection';
it('protects in-flight/reserved outputs independently of a property reference',async()=>{
 expect(await sceneEditAssetProtection({id:'wf_'+'a'.repeat(64),url:'/output.zip'},async()=>[])).toBe('scene_edit_reserved');
});
it('protects recovery aliases but allows unrelated ordinary assets',async()=>{
 const properties=async()=>[{id:'p',splatItems:[{editVersions:[{url:'/uploads/p/original.rad'}]}]}] as never[];
 expect(await sceneEditAssetProtection({id:'old',url:'https://old-cdn.test/original.rad',r2Key:'uploads/p/original.rad'},properties)).toBe('scene_edit_recovery_in_use');
 expect(await sceneEditAssetProtection({id:'unrelated',url:'/other.zip'},properties)).toBeNull();
});
