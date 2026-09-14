import { isValidElement, type ReactNode, type ReactElement } from 'react';
import { expect, it, vi } from 'vitest';
import { propertySchema } from '@/lib/schemas';
vi.mock('@/components/viewer-gate',()=>({default:()=>null}));
vi.mock('@/components/data-sale-panel',()=>({default:()=>null}));
vi.mock('@/components/studio/studio-page-blocks',()=>({default:()=>null}));
vi.mock('@/components/bookmark-button',()=>({default:()=>null}));
vi.mock('@/components/inquiry-panel',()=>({default:()=>null}));
vi.mock('@/components/zoomable-image',()=>({default:()=>null}));
vi.mock('@/components/property-comments',()=>({default:()=>null}));
import PropertyDetailView from './property-detail-view';
import ViewerGate from './viewer-gate';
import DataSalePanel from './data-sale-panel';

function elements(n:ReactNode):ReactElement<Record<string,unknown>>[]{
 if(Array.isArray(n))return n.flatMap(elements);
 if(!isValidElement<Record<string,unknown>>(n))return [];
 return [n,...elements(n.props.children as ReactNode)];
}
const property=propertySchema.parse({id:'fixture',category:'studio',title:'Scene',cover:{src:'/photo.jpg',alt:'Photo'},splatItems:[
 {id:'public',label:'Public',splatUrl:'/a.rad',forSale:true,salePrice:100,downloadFiles:[{url:'/data.rad',format:'RAD'}]},
 {id:'private',label:'Private',splatUrl:'/b.rad',accessLevel:'restricted'},
 {id:'nda',label:'NDA',splatUrl:'/c.rad',accessLevel:'nda_only'},
]});
it('restores the original hero and independent scene cards with their own purchase panels',()=>{
 const tree=elements(PropertyDetailView({property,others:[]}));
 expect(tree.some(n=>n.props['data-property-legacy']!==undefined)).toBe(true);
 const cards=tree.filter(n=>n.props['data-scene-card']!==undefined);
 expect(cards).toHaveLength(1);
 expect(elements(cards[0]).some(n=>n.type===ViewerGate)).toBe(true);
 expect(elements(cards[0]).some(n=>n.type===DataSalePanel)).toBe(true);
});
it('preserves filtered source indices and preview gates without promoting access',()=>{
 const tree=elements(PropertyDetailView({property,others:[],preview:true,sharePreview:true,previewToken:'limited',displaySimulation:true}));
 const gates=tree.filter(n=>n.type===ViewerGate);
 expect(gates).toHaveLength(1);
 expect(gates[0].props).toMatchObject({splatUrl:'/a.rad',propertyId:'fixture',previewToken:'limited',displaySimulation:true,freeAccess:false,freeViewer:false,alreadyUnlocked:false});
 expect(tree.some(n=>n.type===DataSalePanel)).toBe(false);
 const privileged=elements(PropertyDetailView({property,others:[],canViewRestricted:true,canViewNdaOnly:true}));
 expect(privileged.filter(n=>n.type===ViewerGate)).toHaveLength(3);
});
it('keeps the original purchase index and stable ownership IDs when a preceding scene is hidden',()=>{
 const reordered={...property,splatItems:[property.splatItems[1],property.splatItems[0]]};
 const tree=elements(PropertyDetailView({property:reordered,others:[],purchasedItemIds:['public'],unlockedItemIds:['public']}));
 expect(tree.find(n=>n.type===DataSalePanel)?.props).toMatchObject({splatItemIndex:1,alreadyPurchased:true});
 expect(tree.find(n=>n.type===ViewerGate)?.props).toMatchObject({splatUrl:'/a.rad',alreadyUnlocked:true});
});
it('keeps many scenes and purchase indices independent',()=>{
 const p={...property,splatItems:Array.from({length:12},(_,i)=>({...property.splatItems[0],id:'scene-'+i,forSale:i%2===0}))};
 const tree=elements(PropertyDetailView({property:p,others:[],initialSceneId:'scene-10'}));
 expect(tree.filter(n=>n.props['data-scene-card']!==undefined)).toHaveLength(12);
 expect(tree.filter(n=>n.type===DataSalePanel).map(n=>n.props.splatItemIndex)).toEqual([0,2,4,6,8,10]);
 expect(tree.find(n=>n.props.id==='walkthrough')?.props['data-scene-card']).toBe('scene-10');
});
