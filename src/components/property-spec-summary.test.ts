import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {propertySchema} from '@/lib/schemas';
import Summary from './property-spec-summary';
const p=propertySchema.parse({id:'fixture',title:'Fixture',category:'studio',cover:{src:'/fixture.jpg',alt:''},floorAreaSqm:120,ceilingHeightM:3,parkingCapacity:2,hasNaturalLight:true,powerVoltage:'100V',greenRoom:true,availableHours:'平日のみ'});
it('groups registered fields into the six approved category cards',()=>{
 const html=renderToStaticMarkup(createElement(Summary,{property:p,en:false}));
 expect(html.match(/data-property-spec-group=/g)).toHaveLength(6);
 expect(html).toContain('面積');expect(html).toContain('天井高');expect(html).toContain('100V');
 expect(html).not.toContain('掲載項目の設計例');expect(html).not.toContain('EV寸法');
});
it('does not create six empty cards from schema defaults',()=>{
 const empty=propertySchema.parse({id:'empty',title:'Empty',category:'outdoor',cover:{src:'/fixture.jpg',alt:''}});
 const html=renderToStaticMarkup(createElement(Summary,{property:empty,en:true}));
 expect(html).not.toContain('data-property-spec-group=');expect(html).toContain('not registered');
});
