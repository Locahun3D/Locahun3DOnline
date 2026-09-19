import {expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({key:'assets/splat/wf_'+'a'.repeat(64)+'-project.zip',put:vi.fn()}));
vi.mock('@/lib/dal',()=>({requireAdmin:async()=>({id:'admin'})}));
vi.mock('@/lib/store',()=>({assetRepo:{get:async()=>({id:'asset',r2Key:state.key,url:'/api/r2/'+state.key})}}));
vi.mock('@/lib/uploads',()=>({getUploadMode:async()=>'r2',createPresignedUpload:state.put}));
import {POST} from './route';
it('does not issue overwrite credentials for immutable workflow project keys',async()=>{
 state.put.mockResolvedValue({putUrl:'https://storage.test/put'});
 const response=await POST(new Request('https://locahun3d.com/api/admin/assets/replace-presign',{method:'POST',body:JSON.stringify({id:'asset'})}));
 expect(response.status).toBe(409);expect(state.put).not.toHaveBeenCalled();
});
