// Jornal Mercado Macro (22/11/2026): a IA escreve, a matéria espera o Aprovar do administrador e só então vai ao ar
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ligarJornal, gerarMateria, apiAdminJornal, paginaJornal, lerMateria, slugify, slotDoJornal, rodadaJornal, corpoComLinks, quadroHtml, quadroDosDados, INSTRUCOES_JORNAL } from '../src/jornal.js';
import { ligarAssistente } from '../src/assistente.js';

function d1() {
  const db = new DatabaseSync(':memory:');
  const prep = (sql) => { let a = []; const o = {
    bind: (...x) => { a = x; return o; },
    first: async () => db.prepare(sql).get(...a) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...a) }),
    run: async () => { const r = db.prepare(sql).run(...a); return { meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; },
  }; return o; };
  return { db, DB: { prepare: prep } };
}
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
const { db, DB } = d1();
db.exec(`CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT); INSERT INTO config VALUES ('gemini_key', 'k');`);
const env = { DB };
const config = async () => Object.fromEntries(db.prepare('SELECT chave, valor FROM config').all().map((x) => [x.chave, x.valor]));
ligarAssistente({ json, mesmaOrigem: () => true, config, salvarConfig: async () => {}, dentroDoLimite: async () => true });
const avisos = [];
const agora = Date.parse('2026-11-23T15:30:00Z');
const manchetes = Array.from({ length: 12 }, (_, i) => ({ titulo: `Manchete ${i + 1} sobre juros e dólar no Brasil`, fonte: i % 2 ? 'Valor Econômico' : 'Reuters', data: agora - (i + 1) * 600000, link: `https://exemplo.com/n${i + 1}` }));
ligarJornal({ listaNoticias: async () => manchetes, dadosAbertura: async () => ({ cards: {} }), dadosFechamento: async () => ({ semDados: true }), avisar: async (e, t, m) => avisos.push(t + ' | ' + m) });

const paragrafo = 'O dólar recuou frente ao real nesta segunda-feira, segundo a Reuters, enquanto investidores acompanham a agenda de juros e os dados de atividade no Brasil e nos Estados Unidos, que podem mexer com as apostas.';
const resposta = (extra = {}) => JSON.stringify({ secao: 'Câmbio', titulo: 'Dólar recua e mercado acompanha agenda de juros no Brasil', linha_fina: 'Moeda americana perde força no meio da tarde com investidores atentos aos dados de atividade e ao Copom.', paragrafos: [paragrafo, paragrafo, paragrafo, paragrafo, paragrafo], fontes: [1, 3, 99], ...extra });
function gemini(texto) {
  globalThis.fetch = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: texto }] } }] }), { status: 200 });
}

test('lerMateria aceita só o formato certo e liga as fontes aos links', () => {
  const m = lerMateria('```json\n' + resposta() + '\n```', manchetes);
  assert.equal(m.secao, 'Câmbio');
  assert.equal(m.paragrafos.length, 5);
  assert.deepEqual(m.fontes.map((f) => f.link), ['https://exemplo.com/n1', 'https://exemplo.com/n3']); // o 99 não existe e sai
  assert.equal(lerMateria('texto solto', manchetes), null);
  assert.equal(lerMateria(resposta({ paragrafos: ['curto'] }), manchetes), null);
  assert.equal(lerMateria(resposta({ secao: 'Fofoca' }), manchetes).secao, 'Mercados');
});

test('slug sem acento e horários do jornal só em dia útil', () => {
  assert.equal(slugify('Dólar recua: Ibovespa sobe 1,2% e Copom à vista!'), 'dolar-recua-ibovespa-sobe-1-2-e-copom-a-vista');
  assert.equal(slotDoJornal(new Date('2026-11-23T11:15:00Z'), true), 'abertura');
  assert.equal(slotDoJornal(new Date('2026-11-23T15:30:00Z'), true), 'tema');
  assert.equal(slotDoJornal(new Date('2026-11-23T21:45:00Z'), true), 'fechamento');
  assert.equal(slotDoJornal(new Date('2026-11-23T15:30:00Z'), false), null);
  assert.equal(slotDoJornal(new Date('2026-11-23T15:45:00Z'), true), null);
});

test('com o jornal desligado o horário não gera nada', async () => {
  gemini(resposta());
  assert.equal(await rodadaJornal(env, new Date(agora), true), null);
});

test('matéria nasce rascunho, avisa no Telegram e só aparece no jornal depois do Aprovar', async () => {
  db.exec("INSERT INTO config VALUES ('jornal_ligado', '1')");
  gemini(resposta());
  const r = await rodadaJornal(env, new Date(agora), true);
  assert.ok(r.ok, JSON.stringify(r));
  assert.ok(avisos.some((a) => a.includes('Dólar recua') && a.includes('/admin#jornal')));
  // o mesmo horário não gera duas
  assert.ok((await rodadaJornal(env, new Date(agora), true)).ja);
  const capa = async () => (await paginaJornal(new Request('https://x/jornal'), env, '/jornal')).text();
  assert.ok(!(await capa()).includes('Dólar recua'));
  assert.equal((await paginaJornal(new Request('https://x/jornal/' + r.slug), env, '/jornal/' + r.slug)).status, 404);
  // prévia para o administrador
  const pv = await apiAdminJornal(new Request('https://x/api/admin/jornal?previa=' + r.id), env, json);
  assert.match(await pv.text(), /Prévia: esta matéria ainda não foi publicada/);
  const post = (b) => apiAdminJornal(new Request('https://x/api/admin/jornal', { method: 'POST', body: JSON.stringify(b) }), env, json);
  assert.equal((await post({ acao: 'aprovar', id: r.id })).status, 200);
  const pg = await (await paginaJornal(new Request('https://x/jornal/' + r.slug), env, '/jornal/' + r.slug)).text();
  assert.match(pg, /Dólar recua e mercado acompanha agenda de juros no Brasil/);
  assert.match(pg, /"@type":"NewsArticle"/);
  assert.match(pg, /https:\/\/exemplo.com\/n3/);
  assert.match(pg, /não é recomendação|sem recomendação/);
  assert.ok((await capa()).includes('Dólar recua'));
  const rss = await (await paginaJornal(new Request('https://x/jornal/rss.xml'), env, '/jornal/rss.xml')).text();
  assert.match(rss, /<item><title>Dólar recua/);
});

test('edição do administrador é escapada na página e "tirar do ar" some do jornal', async () => {
  const id = db.prepare("SELECT id, slug FROM jornal WHERE status = 'publicada'").get();
  const post = (b) => apiAdminJornal(new Request('https://x/api/admin/jornal', { method: 'POST', body: JSON.stringify(b) }), env, json);
  await post({ acao: 'editar', id: id.id, titulo: 'Título <script>alert(1)</script> editado', linha_fina: 'Linha fina nova', corpo: 'Primeiro parágrafo.\n\nSegundo parágrafo.', secao: 'Juros' });
  const pg = await (await paginaJornal(new Request('https://x/jornal/' + id.slug), env, '/jornal/' + id.slug)).text();
  assert.ok(!pg.includes('<script>alert(1)'));
  assert.match(pg, /&lt;script&gt;/);
  assert.match(pg, /<p>Segundo parágrafo.<\/p>/);
  await post({ acao: 'despublicar', id: id.id });
  assert.equal((await paginaJornal(new Request('https://x/jornal/' + id.slug), env, '/jornal/' + id.slug)).status, 404);
});

test('resposta fora do formato não vira matéria', async () => {
  gemini('Desculpe, não posso ajudar.');
  const r = await gerarMateria(env, 'tema', { agora: agora + 3600000, avisar: false });
  assert.match(r.erro, /fora do formato/);
});

test('rodada que falha tenta de novo 15 minutos depois e fica registrada', async () => {
  db.exec("INSERT OR REPLACE INTO config VALUES ('jornal_ligado', '1')");
  const t = Date.parse('2026-11-23T18:30:00Z');
  gemini('texto solto');
  const r1 = await rodadaJornal(env, new Date(t), true);
  assert.ok(r1.erro);
  gemini(resposta({ titulo: 'Ibovespa sobe com alívio nos juros futuros e dólar estável' }));
  const r2 = await rodadaJornal(env, new Date(t + 15 * 60000), true);
  assert.ok(r2.ok, JSON.stringify(r2));
  assert.ok((await rodadaJornal(env, new Date(t + 30 * 60000), true)).ja);
  assert.ok((await rodadaJornal(env, new Date(t + 60 * 60000), true)).ja);
  assert.equal(await rodadaJornal(env, new Date(t + 75 * 60000), true), null);
  const log = JSON.parse(db.prepare("SELECT valor FROM config WHERE chave = 'jornal_rodadas'").get().valor);
  assert.ok(log[0].ok && !log[1].ok && log[1].erro);
});

test('links internos só na primeira vez e no máximo 3; quadro com os números do terminal', () => {
  const h = corpoComLinks(['O dólar caiu e o Ibovespa subiu; o dólar fechou em R$ 5,40.', 'CDB e Tesouro Direto seguem atrativos, diz a balança comercial.', 'Juros compostos.']);
  assert.equal((h.match(/href="\/indicadores-hoje"/g) || []).length, 1);
  assert.equal((h.match(/class="int"/g) || []).length, 3);
  assert.ok(!h.includes('/balanca-comercial'));
  const q = quadroDosDados({ cards: { ibov: { nome: 'Ibovespa', v: 128500.5, ch: 1.234 }, dolar: { nome: 'Dólar', v: 5.4123, ch: -0.5 }, x: { nome: 'Sem dado', v: null } }, altas: [{ t: 'PETR4', ch: 3.1 }], baixas: [] }, 'Fechamento de 23/11');
  assert.equal(q.itens.length, 2);
  const t = quadroHtml(q);
  assert.ok(t.includes('128.501') && t.includes('5,412') && t.includes('+1,23%') && t.includes('-0,50%') && t.includes('PETR4'));
  assert.equal(quadroHtml(null), '');
  assert.ok(INSTRUCOES_JORNAL.includes('Ibovespa hoje:'));
});

test('Gemini sobrecarregado: a matéria sai pela IA de reserva da Cloudflare', async () => {
  db.exec("DELETE FROM jornal");
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'This model is currently experiencing high demand.' } }), { status: 503 });
  const pedidos = [];
  env.AI = { run: async (m, o) => { pedidos.push(m); return { response: resposta({ titulo: 'Copom e dólar dominam a tarde no mercado brasileiro hoje' }) }; } };
  const r = await gerarMateria(env, 'tema', { agora, chave: 'reserva-teste' });
  delete env.AI;
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(pedidos.length, 1);
  assert.match(db.prepare('SELECT modelo FROM jornal WHERE id = ?').get(r.id).modelo, /reserva/);
});
