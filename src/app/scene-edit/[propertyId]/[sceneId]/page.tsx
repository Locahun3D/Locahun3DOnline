import {notFound} from 'next/navigation';
import {assertPropertyAccess} from '@/lib/dal';
import {repo} from '@/lib/store';
import SceneEditor from '@/components/admin/scene-editor';

export default async function SceneEditPage({params}:{params:Promise<{propertyId:string;sceneId:string}>}) {
 const {propertyId,sceneId}=await params;
 try{await assertPropertyAccess(propertyId);}catch{notFound();}
 const property=await repo.get(propertyId);
 const scene=property?.splatItems.find(item=>item.id===sceneId);
 if(!property||!scene?.splatUrl)notFound();
 return <SceneEditor propertyId={propertyId} sceneId={sceneId} label={scene.label} published={property.status==='published'}/>;
}
