import {expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({key:'assets/splat/wf_'+'a'.repeat(64)+'-project.zip',put:vi.fn()}));
vi.mock('@/lib/dal',()=>({requireAdmin:async()=>({id:'admin'})}));
vi.mock('@/lib/store',()=>({repo:{list:async()=>[{id:'p',splatItems:[{editVersions:[{url:'/api/r2/uploads/p/original.rad'}]}]}]},assetRepo:{get:async()=>({id:'asset',r2Key:state.key,url:'/api/r2/'+state.key})}}));
vi.mock('@/lib/uploads',()=>({getUploadMode:async()=>'r2',createPresignedUpload:state.put}));
import {POST} from './route';
it('does not issue overwrite credentials for immutable workflow project keys',async()=>{
 state.put.mockResolvedValue({putUrl:'https://storage.test/put'});
 const response=await POST(new Request('https://locahun3d.com/api/admin/assets/replace-presign',{method:'POST',body:JSON.stringify({id:'asset'})}));
 expect(response.status).toBe(409);expect(state.put).not.toHaveBeenCalled();
});
it('does not issue overwrite credentials for an original kept in scene-edit history',async()=>{
 state.put.mockClear();state.key='uploads/p/original.rad';
 const response=await POST(new Request('https://locahun3d.com/api/admin/assets/replace-presign',{method:'POST',body:JSON.stringify({id:'asset'})}));
 expect(response.status).toBe(409);expect(state.put).not.toHaveBeenCalled();
});
