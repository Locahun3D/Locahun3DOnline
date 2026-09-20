import {requireAdmin} from '@/lib/dal';
import {getD1} from '@/lib/d1';
import {getWorkflowStorageOrigin} from '@/lib/uploads';
import WorkflowTransfer,{type WorkflowDestination} from '@/components/admin/workflow-transfer';
import {z} from 'zod';
import AdminPageHeader,{AdminPageShell,AdminEmpty} from '@/components/admin/admin-page-header';

export const dynamic='force-dynamic';
export const metadata={title:'下書きデータ転送'};
const propertySchema=z.object({id:z.string().min(1),title:z.string(),status:z.literal('draft'),splatItems:z.array(z.object({id:z.string().min(1),label:z.string().optional()}))});
export default async function WorkflowPage(){
 const actor=await requireAdmin();const db=await getD1();
 if(!db)return <AdminPageShell><AdminPageHeader title="下書きデータ転送"/><AdminEmpty>転送先を取得できませんでした（この環境にはデータベースがありません）。</AdminEmpty></AdminPageShell>;
 const rows=await db.prepare("SELECT id,data FROM properties WHERE status='draft'").all() as {results:{id:string;data:string}[]};
 const destinations:WorkflowDestination[]=[];
 for(const row of rows.results){
  try{
   const p=propertySchema.parse(JSON.parse(row.data));
   if(p.id!==row.id||new Set(p.splatItems.map(s=>s.id)).size!==p.splatItems.length)continue;
   destinations.push({id:p.id,title:p.title,scenes:p.splatItems.map(s=>({id:s.id,label:s.label||''}))});
  }catch{continue;}
 }
 // 2026-09-20: 管理画面共通の小型ヘッダー（子の並び=[見出し, 転送UI] はテストが参照するので変えない）
 return <AdminPageShell>
  <AdminPageHeader title="下書きデータ転送"/>
  <WorkflowTransfer actorId={actor.id} storageOrigin={await getWorkflowStorageOrigin()} destinations={destinations}/>
 </AdminPageShell>;
}
