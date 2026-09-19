import {expect,it} from 'vitest';
import {sceneEditRequestSchema,sceneEditSourceKey} from './scene-edit-contract';
it('accepts only internal supported source keys, never arbitrary hosts or traversal',()=>{
 expect(sceneEditSourceKey('/api/r2/assets/splat/original.zip')).toBe('assets/splat/original.zip');
 expect(sceneEditSourceKey('/uploads/p/scan.rad')).toBe('uploads/p/scan.rad');
 for(const url of ['https://evil.test/assets/splat/a.zip','//evil.test/a.zip','/api/r2/assets/../private.zip','/api/r2/assets/%2e%2e/private.zip','/api/r2/assets/splat/a.zip?x=1','/api/r2/assets/image/a.png',''])expect(sceneEditSourceKey(url)).toBeNull();
});
it('rejects unknown fields and invalid digests before doing any work',()=>{
 expect(sceneEditRequestSchema.safeParse({action:'target',propertyId:'p',sceneId:'s'}).success).toBe(true);
 expect(sceneEditRequestSchema.safeParse({action:'target',propertyId:'p',sceneId:'s',url:'evil'}).success).toBe(false);
 expect(sceneEditRequestSchema.safeParse({action:'attach',key:'a'.repeat(64),verifiedSha256:'x'}).success).toBe(false);
});
