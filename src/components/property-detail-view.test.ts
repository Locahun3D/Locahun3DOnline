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
import PropertySceneWorkspace from './property-scene-workspace';
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
it('keeps photos beside purchase, then location facts, then independent 3DGS, then license details',()=>{
 const tree=elements(PropertyDetailView({property,others:[]}));
 const top=tree.find(n=>n.props['data-property-top']!==undefined);
 expect(top).toBeDefined();
 expect(elements(top).some(n=>n.type===DataSalePanel)).toBe(true);
 expect(elements(top).some(n=>n.type===ViewerGate)).toBe(false);
 const positions=['data-property-top','data-property-facts','data-property-3dgs','data-property-license-details'].map(key=>tree.findIndex(n=>n.props[key]!==undefined));
 expect(positions.every(x=>x>=0)).toBe(true);
 expect(positions[0]).toBeLessThan(positions[1]);
 expect(positions[1]).toBeLessThan(positions[2]);
 expect(positions[2]).toBeLessThan(positions[3]);
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
it('retains a non-sale scene slot in every shared workspace before a later purchase',()=>{
 const mixed={...property,splatItems:[property.splatItems[1],{...property.splatItems[0],id:'view-only',forSale:false},property.splatItems[0]]};
 const tree=elements(PropertyDetailView({property:mixed,others:[],purchasedItemIds:['public'],unlockedItemIds:['public']}));
 const workspaces=tree.filter(n=>n.type===PropertySceneWorkspace);
 expect(workspaces).toHaveLength(3);
 for(const workspace of workspaces){
  const slots=workspace.props.children as ReactElement[];
  expect(slots).toHaveLength(2);
  expect(slots.map(n=>n.key)).toEqual(['1','2']);
 }
 expect(tree.find(n=>n.type===DataSalePanel)?.props).toMatchObject({splatItemIndex:2,alreadyPurchased:true,propertyPresentation:true});
 expect(tree.filter(n=>n.type===ViewerGate).map(n=>n.props.alreadyUnlocked)).toEqual([false,true]);
});
