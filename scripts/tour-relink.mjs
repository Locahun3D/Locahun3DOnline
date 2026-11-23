// 手元で撮った graph.json のつながりを relinkByDistance で作り直す（撮り直しなし）。node scripts/tour-relink.mjs <graph.json> [maxD]
import fs from 'node:fs';
import { relinkByDistance } from './tour-graph.mjs';
const [f, m = '3'] = process.argv.slice(2);
const g = JSON.parse(fs.readFileSync(f, 'utf8'));
const r = relinkByDistance(g.nodes.map((p) => p.pos), g.edges, g.see, Number(m));
console.log('edges', g.edges.length, '->', r.edges.length, 'see', g.see.length, '->', r.see.length);
g.edges = r.edges; g.see = r.see; if (g.audit) { g.audit.edges = r.edges.length; g.audit.see = r.see.length; g.audit.components = 1; }
fs.writeFileSync(f, JSON.stringify(g));
