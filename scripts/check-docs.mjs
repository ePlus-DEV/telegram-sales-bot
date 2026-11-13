// Local docs linter. Validates relative Markdown links and local heading anchors.
// Does not request external URLs (safe and deterministic in CI).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve } from 'node:path';

const root = resolve('.');
const docs = [
  'README.md','ROADMAP.md','AGENTS.md','CONTRIBUTING.md','SECURITY.md',
  ...readdirSync(resolve('docs')).filter(x=>x.endsWith('.md')).map(x=>'docs/'+x),
  // Include standalone provider runbooks, not only the documentation folder.
  ...readdirSync(resolve('deploy'),{withFileTypes:true})
    .filter(entry=>entry.isDirectory())
    .flatMap(entry=>readdirSync(resolve('deploy',entry.name))
      .filter(file=>file.endsWith('.md'))
      .map(file=>'deploy/'+entry.name+'/'+file))
];
function headingSlug(text) {
  return text.toLowerCase().replace(/<[^>]*>/g,'').replace(/[\x60*_~]/g,'')
    .replace(/&amp;/g,'').replace(/[^\p{L}\p{N}\-_ ]/gu,'').replace(/ /g,'-');
}
function getAnchors(path) {
  const text=readFileSync(path,'utf8');
  const counts=new Map(), anchors=new Set();
  for(const line of text.split(/\r?\n/)) {
    const match=line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if(!match)continue;
    const base=headingSlug(match[1]);
    const n=counts.get(base)||0;
    counts.set(base,n+1);
    anchors.add(base+(n?'-'+n:''));
  }
  return anchors;
}
let checked=0;
const failures=[];
for(const path of docs) {
  const full=resolve(root,path);
  if(!existsSync(full)) {failures.push(path+': missing docs source');continue;}
  const text=readFileSync(full,'utf8');
  for(const line of text.split(/\r?\n/)) {
    const rx=/\[[^\]]*\]\(([^)]+)\)/g;
    for(const match of line.matchAll(rx)) {
      let target=match[1].trim();
      if(/^https?:\/\//i.test(target)||/^mailto:/i.test(target)||target.startsWith('data:'))continue;
      // Markdown title syntax: [label](path "title"). Not currently used,
      // but skip the optional title rather than treating it as a filename.
      target=target.replace(/\s+["'][^"']+["']$/,'');
      const [filePart,hash]=target.split('#',2);
      const filePath=filePart?resolve(dirname(full),decodeURIComponent(filePart)):full;
      checked++;
      if(!filePath.startsWith(root+'/') && filePath!==root) {
        failures.push(path+': link escapes repository: '+target);continue;
      }
      if(!existsSync(filePath)||!statSync(filePath).isFile()) {
        failures.push(path+': missing target '+target);continue;
      }
      if(hash && filePath.endsWith('.md')) {
        const anchor=decodeURIComponent(hash);
        if(!getAnchors(filePath).has(anchor)) failures.push(path+': missing heading #'+anchor+' in '+relative(root,filePath));
      }
    }
  }
}
if(failures.length) {
  console.error('Documentation check failed:\n'+failures.map(x=>' - '+x).join('\n'));
  process.exitCode=1;
} else {
  console.log('Documentation links OK: '+checked+' relative links in '+docs.length+' Markdown files.');
}
