import assert from 'node:assert/strict';

// OPTIONS only: no session, signed URL, object creation, or private data is used.
const origin='https://locahun3d.com';
const url='https://9ad06a76157fb2f40dfef1f4b7a14a93.r2.cloudflarestorage.com/locahun3d-assets/assets/splat/workflow-cors-probe.zip';
for(const method of ['PUT','GET']){
 const headers={Origin:origin,'Access-Control-Request-Method':method};
 if(method==='PUT')headers['Access-Control-Request-Headers']='content-type,content-md5,if-none-match';
 const response=await fetch(url,{method:'OPTIONS',headers,redirect:'error',signal:AbortSignal.timeout(15000)});
 assert(response.ok,`CORS ${method} returned ${response.status}`);
 assert.equal(response.headers.get('access-control-allow-origin'),origin);
 assert(response.headers.get('access-control-allow-methods')?.split(',').map(s=>s.trim()).includes(method));
 if(method==='PUT'){
  const allowed=response.headers.get('access-control-allow-headers')?.toLowerCase().split(',').map(s=>s.trim())||[];
  for(const header of ['content-type','content-md5','if-none-match'])assert(allowed.includes(header),`Missing CORS header ${header}`);
 }
 await response.body?.cancel();
 console.log(`Workflow ${method} preflight passed`);
}
