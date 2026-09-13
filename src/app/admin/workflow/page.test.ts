import {it,expect,vi,beforeEach} from 'vitest';
import React from 'react';
const mocks=vi.hoisted(()=>({admin:vi.fn(),db:vi.fn(),origin:vi.fn()}));
vi.mock('@/lib/dal',()=>({requireAdmin:mocks.admin}));
vi.mock('@/lib/d1',()=>({getD1:mocks.db}));
vi.mock('@/lib/uploads',()=>({getWorkflowStorageOrigin:mocks.origin}));
vi.mock('@/components/admin/workflow-transfer',()=>({default:'workflow-fixture'}));
import Page from './page';
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('React',React);mocks.admin.mockResolvedValue({id:'admin'});mocks.origin.mockResolvedValue('https://storage.test');});
it('requires admin before reading any destinations or storage configuration',async()=>{
 mocks.admin.mockRejectedValue(Error('denied'));await expect(Page()).rejects.toThrow('denied');
 expect(mocks.db).not.toHaveBeenCalled();expect(mocks.origin).not.toHaveBeenCalled();
});
it('passes only exact unique draft scene IDs to the operator',async()=>{
 const data={id:'p',title:'Studio',status:'draft',splatItems:[{id:'s',label:'Scene'}]};
 mocks.db.mockResolvedValue({prepare:()=>({all:async()=>({results:[{id:'p',data:JSON.stringify(data)},{id:'other',data:JSON.stringify(data)},{id:'p',data:JSON.stringify({...data,splatItems:[{id:'s'},{id:'s'}]})}]})})});
 const result=await Page();const children=result.props.children;
 const transfer=children[1];expect(transfer.props.destinations).toEqual([{id:'p',title:'Studio',scenes:[{id:'s',label:'Scene'}]}]);
 expect(transfer.props.actorId).toBe('admin');
});
