import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';

it('keeps integrity upload headers scoped to the existing production application',()=>{
 const {rules}=JSON.parse(readFileSync(new URL('../../config/r2-cors.json',import.meta.url),'utf8'));
 const workflow=rules.filter((r:{allowed:{headers:string[]}})=>r.allowed.headers.includes('content-md5'));
 expect(workflow).toHaveLength(1);
 expect(workflow[0].allowed.origins).toEqual(['https://locahun3d.com']);
 expect(workflow[0].allowed.methods).toEqual(['PUT']);
 expect(workflow[0].allowed.headers).toEqual(['content-type','content-md5','if-none-match']);
 expect(rules[0].allowed.methods).toEqual(['GET','HEAD']);
 expect(rules[1].allowed.headers).toEqual(['content-type']);
 expect(JSON.stringify(rules)).not.toContain('"*"');
});
