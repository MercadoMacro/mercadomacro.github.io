/* Smoke local no Linux do CI: exercita os bindings nativos sem chamar provedores. */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

if (process.platform === 'win32') throw new Error('Este smoke é executado no Linux do GitHub Actions. Use validar.mjs para os testes locais.');
const pasta=mkdtempSync(join(tmpdir(),'mm-rate-smoke-'));
const config=join(pasta,'wrangler.json');
writeFileSync(config,JSON.stringify({
  name:'mm-rate-smoke', main:fileURLToPath(new URL('../shrill-meadow-89c1.js',import.meta.url)),
  compatibility_date:'2025-06-01',
  ratelimits:['API_RATE_GENERAL','API_RATE_HISTORY','API_RATE_PREMIUM'].map((name,i)=>({name,namespace_id:String(2026101891+i),simple:{limit:2,period:60}}))
}));
const child=spawn('npx',['--yes','wrangler@4.149.0','dev','--local','--config',config,'--ip','127.0.0.1','--port','8798','--persist-to',join(pasta,'state')],{
  cwd:fileURLToPath(new URL('../',import.meta.url)), stdio:['ignore','pipe','pipe'], detached:true,
  env:{...process.env,WRANGLER_SEND_METRICS:'false',CI:'true'}
});
let saida='',erroSpawn=null,terminou=false;
child.on('error',e=>{erroSpawn=e;});child.on('exit',()=>{terminou=true;});
for(const stream of [child.stdout,child.stderr]) stream.on('data',b=>{saida=(saida+b.toString()).slice(-12000);});
const espera=ms=>new Promise(r=>setTimeout(r,ms));
try {
  const ate=Date.now()+60000;
  while(!saida.includes('Ready on')) {
    if(erroSpawn)throw erroSpawn;
    if(terminou||Date.now()>ate)throw new Error('Runtime não iniciou:\n'+saida);
    await espera(250);
  }
  let bloqueado=false;
  for(let i=0;i<10;i++) {
    // Sem symbols: a validação devolve 400 antes de qualquer busca no Yahoo.
    const r=await fetch('http://127.0.0.1:8798/quotes',{
      headers:{Origin:'https://mercadomacro.com.br','CF-Connecting-IP':'192.0.2.123'},signal:AbortSignal.timeout(5000)
    });
    if(i===0)assert.equal(r.status,400,'O binding deve aceitar a primeira consulta e chegar à validação de parâmetros.');
    if(r.status===429){assert.equal(r.headers.get('Retry-After'),'60');bloqueado=true;break;}
    assert.equal(r.status,400,'Resposta inesperada antes do limite.');
  }
  assert.ok(bloqueado,'O runtime nativo deve bloquear o excesso de consultas.');
  console.log('Smoke nativo: bindings ativos, consulta inicial aceita e excesso bloqueado com 429. Nenhum provedor foi consultado.');
} finally {
  try{process.kill(-child.pid,'SIGTERM');}catch(_){/* já encerrado */}
  await espera(500);
  rmSync(pasta,{recursive:true,force:true});
}
