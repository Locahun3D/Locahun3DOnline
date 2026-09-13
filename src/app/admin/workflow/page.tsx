import {requireAdmin} from '@/lib/dal';
import {getD1} from '@/lib/d1';
import {getWorkflowStorageOrigin} from '@/lib/uploads';
import WorkflowTransfer,{type WorkflowDestination} from '@/components/admin/workflow-transfer';
import {z} from 'zod';

export const dynamic='force-dynamic';
export const metadata={title:'下書きデータ転送'};
const propertySchema=z.object({id:z.string().min(1),title:z.string(),status:z.literal('draft'),splatItems:z.array(z.object({id:z.string().min(1),label:z.string().optional()}))});
export default async function WorkflowPage(){
 const actor=await requireAdmin();const db=await getD1();
 if(!db)return <div className="ui-page-shell p-8">転送先を取得できませんでした。</div>;
 const rows=await db.prepare("SELECT id,data FROM properties WHERE status='draft'").all() as {results:{id:string;data:string}[]};
 const destinations:WorkflowDestination[]=[];
 for(const row of rows.results){
  try{
   const p=propertySchema.parse(JSON.parse(row.data));
   if(p.id!==row.id||new Set(p.splatItems.map(s=>s.id)).size!==p.splatItems.length)continue;
   destinations.push({id:p.id,title:p.title,scenes:p.splatItems.map(s=>({id:s.id,label:s.label||''}))});
  }catch{continue;}
 }
 return <div className="ui-page-shell px-4 sm:px-8 pb-8">
  <div className="ui-page-header"><h1 className="ui-page-title">下書きデータ転送</h1></div>
  <WorkflowTransfer actorId={actor.id} storageOrigin={await getWorkflowStorageOrigin()} destinations={destinations}/>
 </div>;
}
