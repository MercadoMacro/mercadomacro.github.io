/* Validação sem dependências e sem acesso ao banco ou à conta Cloudflare.
   Uso: node terminal/validar.mjs [site|worker|todos] */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const terminal = dirname(fileURLToPath(import.meta.url));
const alvo = process.argv[2] || 'site';
if (!['site', 'worker', 'todos'].includes(alvo) || process.argv.length > 3) {
  console.error('Uso: node terminal/validar.mjs [site|worker|todos]');
  process.exit(1);
}
function arquivos(pasta) {
  if (!existsSync(pasta)) throw new Error(`Pasta ausente: ${pasta}`);
  return readdirSync(pasta, { withFileTypes:true }).sort((a,b) => a.name.localeCompare(b.name)).flatMap(item => {
    if (['node_modules', '.wrangler', '.git'].includes(item.name)) return [];
    const caminho = join(pasta, item.name);
    return item.isDirectory() ? arquivos(caminho) : item.isFile() ? [caminho] : [];
  });
}
function executar(args, opts = {}) {
  const r = spawnSync(process.execPath, args, { stdio:'inherit', ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`Validação falhou: node ${args.join(' ')}`);
}
function scripts(lista, modulo = false) {
  const js = lista.filter(p => ['.js', '.mjs'].includes(extname(p)));
  for (const p of js) {
    if (modulo) executar(['--input-type=module', '--check'], { input:readFileSync(p), stdio:['pipe', 'inherit', 'inherit'] });
    else executar(['--check', p]);
  }
  return js.length;
}
function recursosHTML(site, paginas) {
  let n = 0;
  const attr = (tag, nome) => new RegExp(`\\b${nome}\\s*=\\s*(["'])(.*?)\\1`, 'i').exec(tag)?.[2];
  for (const p of paginas.filter(p => extname(p) === '.html')) {
    const html = readFileSync(p, 'utf8');
    if (!html.trim()) throw new Error(`Página vazia: ${p}`);
    for (const tag of html.match(/<(?:script|link)\b[^>]*>/gi) || []) {
      const script = /^<script\b/i.test(tag);
      if (!script && !/\b(?:stylesheet|icon|apple-touch-icon|manifest|preload)\b/i.test(attr(tag,'rel') || '')) continue;
      const ref = attr(tag, script ? 'src' : 'href');
      if (!ref || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref)) continue;
      const caminho = decodeURIComponent(ref.split(/[?#]/)[0]);
      if (!caminho) continue;
      const destino = caminho.startsWith('/') ? resolve(site, '.' + caminho) : resolve(dirname(p), caminho);
      if (!destino.startsWith(site + sep) || !existsSync(destino) || !statSync(destino).isFile()) {
        throw new Error(`Recurso local ausente em ${relative(site,p)}: ${ref}`);
      }
      n++;
    }
  }
  return n;
}
try {
  if (alvo !== 'worker') {
    const station = join(terminal, 'station');
    const site = join(station, 'site');
    const paginas = arquivos(site), servidor = arquivos(join(station, 'src')), testes = arquivos(join(station, 'tests'));
    for (const p of [join(site,'index.html'), join(station,'src','index.js'), join(station,'wrangler.jsonc')]) {
      if (!existsSync(p) || !statSync(p).isFile() || !readFileSync(p,'utf8').trim()) throw new Error(`Arquivo obrigatório ausente ou vazio: ${p}`);
    }
    const n = scripts(paginas) + scripts(servidor,true) + scripts(testes);
    let json = 0;
    for (const p of [...paginas, ...testes].filter(p => ['.json', '.webmanifest'].includes(extname(p)))) {
      try { JSON.parse(readFileSync(p,'utf8')); json++; } catch (_) { throw new Error(`JSON inválido: ${p}`); }
    }
    const refs = recursosHTML(site,paginas);
    const suites = testes.filter(p => /\.test\.mjs$/.test(p));
    if (!suites.length) throw new Error('Nenhuma suíte de testes foi encontrada.');
    console.log(`Site: ${n} scripts, ${json} JSON/manifestos e ${refs} referências locais conferidos.`);
    executar(['--test', ...suites]);
  }
  if (alvo !== 'site') {
    const worker = join(terminal, 'worker');
    for (const p of [join(worker,'shrill-meadow-89c1.js'),join(worker,'wrangler.jsonc')]) {
      if (!existsSync(p) || !readFileSync(p,'utf8').trim()) throw new Error(`Arquivo obrigatório ausente ou vazio: ${p}`);
    }
    console.log(`Worker de dados: ${scripts(arquivos(worker),true)} scripts conferidos.`);
  }
  console.log('Validação concluída. Nenhum arquivo foi publicado.');
} catch (e) {
  console.error(`ERRO: ${e.message}`);
  process.exitCode = 1;
}
