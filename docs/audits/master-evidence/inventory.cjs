const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const out = __dirname;
const pages = [], apis = [], controls = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, {withFileTypes:true})) {
    const f = path.join(dir,e.name).replace(/\\/g,'/');
    if(e.isDirectory()) walk(f);
    else if(/\.(tsx?|jsx?)$/.test(f)) {
      const text=fs.readFileSync(f,'utf8');
      const sf=ts.createSourceFile(f,text,ts.ScriptTarget.Latest,true,f.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
      const route='/'+path.dirname(f).split('/').slice(1).filter(p=>!p.startsWith('(')).join('/');
      const line=n=>sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1;
      const imports=[...text.matchAll(/from ['"]([^'"]+)['"]/g)].map(m=>m[1]);
      if(/\/page\.[jt]sx?$/.test(f)) pages.push({route,file:f,imports,status:'UNVERIFIED'});
      if(/\/route\.[jt]s$/.test(f)) apis.push({route,file:f,methods:[...text.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)|export\s+const\s+(GET|POST|PUT|PATCH|DELETE)/g)].map(m=>m[1]||m[2]),imports,status:'UNVERIFIED'});
      function visit(n){
        if(ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n)){
          const tag=n.tagName.getText(sf);
          if(['button','Button','a','Link','input','select','textarea','form'].includes(tag)){
            const attrs=n.attributes.properties.map(a=>a.getText(sf));
            controls.push({file:f,line:line(n),tag,attributes:attrs.join(' ').slice(0,600),runtime:'UNVERIFIED'});
          }
        }
        ts.forEachChild(n,visit);
      }
      visit(sf);
    }
  }
}
walk('app');walk('components');
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'route-inventory.json'),JSON.stringify({pages,apis},null,2));
fs.writeFileSync(path.join(out,'control-inventory.json'),JSON.stringify(controls,null,2));
fs.writeFileSync(path.join(out,'CONTROL_COVERAGE.md'),'# Static control inventory\n\nJSX inventory, not proof of rendered visibility or correct behavior. Dynamic controls and child components require runtime checking. Every listed control is UNVERIFIED unless separately identified in browser evidence.\n\n| Source | Element | Attributes / handler | Runtime |\n|---|---|---|---|\n'+controls.map(c=>`| ${c.file}:${c.line} | ${c.tag} | ${c.attributes.replace(/\|/g,'&#124;').replace(/\s+/g,' ').slice(0,200)} | UNVERIFIED |`).join('\n'));
console.log(JSON.stringify({pages:pages.length,apis:apis.length,controls:controls.length}));
