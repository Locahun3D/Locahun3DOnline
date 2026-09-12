import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {propertySchema,localizeProperty} from './schemas';
import {propertyTitleSegments} from './property-presentation';

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
  it('preserves authored line breaks while grouping title words for display',()=>{
    // Browser rendering is covered by verify-property-presentation.mjs at three
    // widths. Assert content here, not the incidental JSX expression spelling.
    for(const title of ['Studio\nSeeYouTomorrow','Studio\nSee You Tomorrow','渋谷\nスクランブル交差点']){
      const parts=propertyTitleSegments(title);
      expect(parts.join('')).toBe(title);
      expect(parts.filter(part=>part.includes('\n'))).toEqual(['\n']);
      expect(parts.filter(part=>!part.includes('\n')).join('')).toBe(title.replace('\n',''));
    }
  });
});
