import { readFileSync } from 'node:fs';
import ts from 'typescript';
const urls = new Map();
export function loadModuleUrl(file) {
  const key = file.href;
  if (urls.has(key)) return urls.get(key);
  let code = ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  code = code.replace(/from (['"])(\.[^'"]+)\1/g, (_,quote,path) => `from ${JSON.stringify(loadModuleUrl(new URL(path+'.ts',file)))}`);
  const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
  urls.set(key,url); return url;
}
