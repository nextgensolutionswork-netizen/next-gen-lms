const fs=require('fs'),path=require('path'),ts=require('typescript');
const root=process.cwd(),sources={},pages=[],apis=[],controls=[],links=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name).replace(/\\/g,'/');if(e.isDirectory())walk(f);else if(/\.[jt]sx?$/.test(f))sources[f]=fs.readFileSync(f,'utf8');}}
for(const d of ['app','components','lib'])walk(d);
const resolve=(from,s)=>{const p=s.startsWith('@/')?s.slice(2):s.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(from),s)):null;if(!p)return null;return [p,p+'.ts',p+'.tsx',p+'/index.ts',p+'/index.tsx'].find(p=>p in sources)||null;};
const dependencies={};
for(const [file,text] of Object.entries(sources)){
 const sf=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,file.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 const line=n=>sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1;
 const imports=[...text.matchAll(/(?:from\s*|import\s*\()['"]([^'"]+)['"]/g)].map(m=>m[1]);dependencies[file]=imports.map(i=>resolve(file,i)).filter(Boolean);
 const route='/'+path.posix.dirname(file).split('/').slice(1).filter(x=>!x.startsWith('(')).join('/');
 if(/\/page\.[jt]sx?$/.test(file))pages.push({id:'',route,file,name:(text.match(/export default (?:async )?function\s+(\w+)/)||[])[1]||'default component',imports,redirects:[...text.matchAll(/redirect\(['"]([^'"]+)/g)].map(m=>m[1])});
 if(/\/route\.[jt]s$/.test(file))apis.push({route,file,methods:[...text.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)|export\s+const\s+(GET|POST|PUT|PATCH|DELETE)/g)].map(m=>m[1]||m[2])});
 function visit(n){
  if(ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n)){
   const tag=n.tagName.getText(sf),attrs=n.attributes.properties.map(a=>a.getText(sf)).join(' ');
   if(['button','Button','a','Link','input','Input','select','Select','textarea','form','Modal','Dialog','AlertDialog','table','Table','Tabs','TabsTrigger','TabsContent'].includes(tag)||/on(?:Click|Submit|Change|Close|OpenChange|Upload|Select|Drop)=/.test(attrs)||/Modal$|Dialog$|FileUpload$|Dropdown/.test(tag)){
    const parent=ts.isJsxElement(n.parent)?n.parent:null;const label=parent?parent.children.map(c=>ts.isJsxText(c)?c.text.trim():ts.isJsxExpression(c)?'{'+c.getText(sf).slice(1,-1)+'}':'').filter(Boolean).join(' ').replace(/\s+/g,' ').slice(0,160):'';
    controls.push({id:'',file,line:line(n),tag,label,attributes:attrs.replace(/\s+/g,' ').slice(0,1000),handlers:[...attrs.matchAll(/(?:onClick|onSubmit|onChange|onClose|onOpenChange)=\{([^}]+)/g)].map(m=>m[1]),status:'BLOCKED runtime; source inventoried'});
   }
  }
  ts.forEachChild(n,visit);
 }
 visit(sf);
 for(const m of text.matchAll(/(?:href\s*=\s*|href\s*:\s*|router\.(?:push|replace)\(\s*|redirect\(\s*)['"]([^'"]+)['"]/g))if(m[1].startsWith('/'))links.push({file,line:text.slice(0,m.index).split('\n').length,url:m[1],scope:/layout|sidebar|header/i.test(file)?'navigation':'page/service'});
}
function closure(file,seen=new Set()){if(seen.has(file))return seen;seen.add(file);for(const dep of dependencies[file]||[])closure(dep,seen);return seen;}
pages.sort((a,b)=>a.route.localeCompare(b.route)).forEach((p,i)=>{
 p.id='P'+String(i+1).padStart(2,'0');const reach=closure(p.file);let parent=path.posix.dirname(p.file);while(parent&&parent!=='.'){for(const ext of ['tsx','ts']){const layout=parent+'/layout.'+ext;if(sources[layout])closure(layout,reach);}parent=path.posix.dirname(parent);}const deps=[...reach];p.componentDependencies=deps.filter(x=>x.startsWith('components/'));p.serviceDependencies=deps.filter(x=>x.startsWith('lib/services/'));p.controlIds=[];
 p.apiDependencies=[...new Set(deps.flatMap(f=>[...sources[f].matchAll(/['"`]\/api\/([^'"`\s?]+)/g)].map(m=>'/api/'+m[1])))];
 p.tableDependencies=[...new Set(deps.flatMap(f=>[...sources[f].matchAll(/\.from\(['"]([^'"]+)['"]\)/g)].map(m=>m[1])))];
 p.sourceFacts={headings:[...sources[p.file].matchAll(/<h[1-6][^>]*>([^<{]+)/g)].map(m=>m[1].trim()),loading:/loading|isLoading|Skeleton/.test(sources[p.file]),empty:/No .*found|No .*yet|length === 0|length > 0/.test(sources[p.file]),error:/catch|error|Error/.test(sources[p.file]),pagination:/pageSize|currentPage|Pagination/.test(sources[p.file])};
 p.dependencies=deps;
});
controls.forEach((c,i)=>{c.id='C'+String(i+1).padStart(4,'0');c.pages=pages.filter(p=>p.dependencies.includes(c.file)).map(p=>p.id);for(const p of pages.filter(p=>c.pages.includes(p.id)))p.controlIds.push(c.id);});
for(const l of links){const u=l.url.split(/[?#]/)[0];l.target=pages.find(p=>p.route===u||new RegExp('^'+p.route.replace(/\[[^\]]+\]/g,'[^/]+')+'$').test(u))?.id||null;l.status=l.target?'Source target exists':'Unresolved literal link; inspect before calling broken';}
const result={pages,apis,controls,links,counts:{pages:pages.length,apis:apis.length,controls:controls.length,buttons:controls.filter(c=>['button','Button'].includes(c.tag)).length,forms:controls.filter(c=>c.tag==='form').length,dialogs:controls.filter(c=>/Modal|Dialog/.test(c.tag)).length,tables:controls.filter(c=>/^[Tt]able$/.test(c.tag)).length}};
fs.writeFileSync(path.join(__dirname,'inventory.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result.counts));
