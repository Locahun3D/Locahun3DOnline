import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {fmtDateTimeLocaleJST} from './date-format';

describe('comment dates across server and browser time zones',()=>{
  it('uses the shared fixed-timezone formatter on the comment surface',()=>{
    const source=readFileSync('src/components/property-comments.tsx','utf8');
    expect(source).toContain('fmtDateTimeLocaleJST(d, en ? "en-US" : "ja-JP")');
    expect(source).not.toContain('d.toLocaleString(');
  });
  it('renders the reported timestamp in JST for both locales',()=>{
    expect(fmtDateTimeLocaleJST('2026-07-15T06:41:00Z','ja-JP')).toBe('2026/07/15 15:41');
    expect(fmtDateTimeLocaleJST('2026-07-15T06:41:00Z','en-US')).toBe('07/15/2026, 03:41 PM');
    expect(fmtDateTimeLocaleJST('2026-07-15T18:41:00Z','ja-JP')).toBe('2026/07/16 03:41');
  });
});
