// Prévia isolada para validar watchlist e logout. Nunca executa deploy ou D1 remoto.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const station = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.some(a => a !== '--prepare-only')) throw new Error('Use sem argumentos ou com --prepare-only.');
const stateDir = join(station, '.wrangler', 'revisao-local');
mkdirSync(stateDir, { recursive: true });
const password = 'TesteLocal2026!'; // Somente para as duas contas fictícias do banco local.
const hash = () => {
  const salt = randomBytes(16);
  return `pbkdf2$30000$${salt.toString('base64')}$${pbkdf2Sync(password, salt, 30000, 32, 'sha256').toString('base64')}`;
};
const sql = `
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  senha TEXT NOT NULL, status TEXT NOT NULL, admin INTEGER NOT NULL DEFAULT 0,
  criado TEXT NOT NULL, decidido TEXT, ultimo_acesso TEXT
);
CREATE TABLE IF NOT EXISTS sessoes (token TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL, expira INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS tentativas (chave TEXT PRIMARY KEY, n INTEGER NOT NULL, janela INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS dados_usuario (usuario_id INTEGER NOT NULL, chave TEXT NOT NULL, valor TEXT NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY (usuario_id, chave));
CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS visitas (dia TEXT NOT NULL, tipo TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (dia, tipo));
CREATE TABLE IF NOT EXISTS links_email (token TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL, tipo TEXT NOT NULL, expira INTEGER NOT NULL);
INSERT INTO usuarios (id,nome,email,senha,status,admin,criado) VALUES
 (900001,'Conta A de teste','teste-a@example.test','${hash()}','ativo',0,datetime('now')),
 (900002,'Conta B de teste','teste-b@example.test','${hash()}','ativo',0,datetime('now'))
ON CONFLICT(id) DO UPDATE SET senha=excluded.senha, status='ativo';
DELETE FROM sessoes WHERE usuario_id IN (900001,900002);
DELETE FROM tentativas;
`;
writeFileSync(join(stateDir, 'seed.sql'), sql);
console.log('\nContas fictícias da prévia local:');
console.log('A: teste-a@example.test');
console.log('B: teste-b@example.test');
console.log('Senha das duas: ' + password);
if (args.includes('--prepare-only')) process.exit(0);

function wrangler(cmd) {
  // Todos os argumentos são constantes; shell no Windows serve apenas para chamar npx.cmd.
  const r = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['--yes', 'wrangler@4.149.0', ...cmd],
    { cwd: station, stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
  if (r.error) { console.error(r.error.message); process.exit(1); }
  if (r.status !== 0) process.exit(r.status || 1);
}
const shared = ['--config', 'tests/wrangler.local.json', '--persist-to', '.wrangler/revisao-local/state'];
console.log('\nPreparando o banco local (o primeiro uso baixa o Wrangler)...');
wrangler(['d1', 'execute', 'mm-revisao-local', '--local', ...shared, '--file', '.wrangler/revisao-local/seed.sql']);
console.log('\nQuando aparecer Ready, abra http://localhost:8787 no navegador.');
console.log('Mantenha este terminal aberto. Para encerrar: Ctrl+C.');
console.log('Use só as contas fictícias acima. Não é a versão publicada do site.\n');
wrangler(['dev', '--local', ...shared, '--ip', '127.0.0.1', '--port', '8787']);
