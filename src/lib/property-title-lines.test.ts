import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {propertySchema,localizeProperty} from './schemas';

describe('authored property title line breaks',()=>{
  it('retains line breaks through persistence and localization',()=>{
    const p=propertySchema.parse({id:'title-lines',category:'studio',cover:{src:'/test.jpg',alt:''},title:'Studio\nSeeYouTomorrow',titleEn:'Studio\nSee You Tomorrow'});
    const restored=propertySchema.parse(JSON.parse(JSON.stringify(p)));
    expect(restored.title).toBe('Studio\nSeeYouTomorrow');
    expect(localizeProperty(restored,'en').title).toBe('Studio\nSee You Tomorrow');
  });
  it('offers multiline controls for both title fields',()=>{
    const source=readFileSync('src/components/admin/property-editor.tsx','utf8');
    for(const name of ['title','titleEn'])
      expect(source).toMatch(new RegExp('<textarea\\s[^>]*register\\("'+name+'"\\)[^>]*/>'));
  });
  it('preserves authored line breaks on detail and catalog title surfaces',()=>{
    for(const file of ['src/components/property-detail-view.tsx','src/components/property-card.tsx','src/components/properties/catalog-client.tsx']){
      const source=readFileSync(file,'utf8');
      expect(source).toMatch(/<h[13] className="[^"]*whitespace-pre-wrap[^"]*">\s*\{property.title/);
    }
  });
});
