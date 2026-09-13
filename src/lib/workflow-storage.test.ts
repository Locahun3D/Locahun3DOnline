import {it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({head:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@opennextjs/cloudflare',()=>({getCloudflareContext:async()=>({env:{R2_ACCOUNT_ID:'testaccount',R2_ACCESS_KEY_ID:'testkey',R2_SECRET_ACCESS_KEY:'testsecret',R2_BUCKET:'testbucket',R2_PUBLIC_URL:'https://test.invalid',R2_ASSETS:{head:state.head}}})}));
import {createWorkflowUpload,statWorkflowUpload} from './uploads';
it('actual SigV4 signer binds write-once and MD5 headers into PUT signature',async()=>{
 const signed=await createWorkflowUpload({r2Key:'assets/splat/wf_'+'a'.repeat(64)+'-project.zip',md5:'b'.repeat(32)});
 const url=new URL(signed.putUrl);
 expect(url.searchParams.get('X-Amz-SignedHeaders')?.split(';')).toEqual(expect.arrayContaining(['content-md5','if-none-match','host']));
 expect(signed.headers['If-None-Match']).toBe('*');
 expect(signed.headers['Content-MD5']).toBe(Buffer.from('b'.repeat(32),'hex').toString('base64'));
});
it('uses R2 checksum rather than trusting custom metadata',async()=>{
 state.head.mockResolvedValue({size:20,checksums:{md5:Uint8Array.from({length:16},()=>255).buffer},customMetadata:{sha256:'untrusted'}});
 expect(await statWorkflowUpload('key')).toEqual({size:20,md5:'f'.repeat(32)});
 state.head.mockResolvedValue({size:20,checksums:{}});
 expect((await statWorkflowUpload('key'))?.md5).toBe('');
});
