// Robô da Jade no WhatsApp (terminal/whatsapp/worker.js): assinatura da Meta, limite por número,
// atendimento humano com aviso à equipe, preços vindos do site e memória do ticker da conversa.
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { LIMITE_HORA, reais, ehInsiders } from '../../whatsapp/worker.js';

function d1() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('CREATE TABLE jade_handoff (conversation_key TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)');
  const prep = (q) => {
    const st = sql.prepare(q);
    const b = (...a) => ({
      run: async () => ({ meta: { changes: st.run(...a).changes } }),
      first: async () => st.get(...a) ?? null,
      all: async () => ({ results: st.all(...a) }),
      _run: () => st.run(...a),
    });
    return { ...b(), bind: b };
  };
  return { sql, prepare: prep, batch: async (l) => l.map((x) => x._run()) };
}

const SEGREDO = 'segredo-teste';
async function assinar(corpo) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(SEGREDO), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(corpo)));
  return 'sha256=' + Array.from(s, (b) => b.toString(16).padStart(2, '0')).join('');
}
async function mensagem(env, texto, de = '5511999990001', msg = null) {
  const corpo = JSON.stringify({ entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: '1342951915577900' }, messages: [msg ? { from: de, ...msg } : { type: 'text', from: de, text: { body: texto } }] } }] }] });
  return worker.fetch(new Request('https://x.workers.dev/webhook', { method: 'POST', body: corpo, headers: { 'X-Hub-Signature-256': await assinar(corpo) } }), env);
}

function ambiente() {
  const enviadas = [], avisos = [], funis = [], botoes = [];
  globalThis.fetch = async (url, op = {}) => {
    const u = String(url);
    if (u.startsWith('https://graph.facebook.com/')) {
      const m = JSON.parse(op.body);
      enviadas.push(m.type === 'interactive' ? m.interactive.body.text : m.text.body);
      botoes.push(m.type === 'interactive' ? m.interactive.action.buttons.map((b) => b.reply.id) : []);
      return new Response('{}');
    }
    if (u.startsWith('https://news.cota-cotacao10.workers.dev')) return new Response(JSON.stringify([{ titulo: 'Petrobras anuncia dividendos', link: 'https://x.test/1', data: Date.now() - 60000, fonte: 'Valor' }]));
    if (u.includes('finance.yahoo.com')) return new Response(JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: 11, regularMarketTime: Math.floor(Date.now() / 1000), exchangeTimezoneName: 'America/Sao_Paulo' }, timestamp: [Math.floor(Date.now() / 1000) - 86400 * 2], indicators: { quote: [{ close: [10] }] } }] } }));
    throw new Error('fetch inesperado ' + u);
  };
  const env = {
    META_APP_SECRET: SEGREDO, WHATSAPP_PRODUCTION_ACCESS_TOKEN: 't', HANDOFF_DB: d1(),
    JADE: {
      precos: async () => ({ cartao: { mensal: 2190, semestral: 9990, anual: 17990 }, pix: { mensal: 2490, semestral: 13900 }, gratisHoras: 48 }),
      avisarEquipe: async (tipo, final, texto) => { avisos.push([tipo, final, texto]); return true; },
      watchlist: async () => null, link: async () => false,
      insiders: async (t) => 'INSIDERS:' + t,
      funil: async (o, e) => { funis.push([o, e]); return true; },
      noticias: async () => [
        { titulo: 'Ibovespa sobe com Petrobras e Vale', link: 'https://valor.test/1', fonte: 'Valor Econômico', data: Date.now() - 600000, nivel: 'ALTO' },
        { titulo: 'Petrobras anuncia dividendos', link: 'https://valor.test/2', fonte: 'InfoMoney', data: Date.now() - 60000, nivel: 'NORMAL' },
      ],
    },
  };
  return { env, enviadas, avisos, funis, botoes };
}

test('assinatura errada é recusada', async () => {
  const { env } = ambiente();
  const r = await worker.fetch(new Request('https://x.workers.dev/webhook', { method: 'POST', body: '{}', headers: { 'X-Hub-Signature-256': 'sha256=' + '0'.repeat(64) } }), env);
  assert.equal(r.status, 401);
});

test('preços vêm do site (não ficam escritos no robô)', async () => {
  const { env, enviadas } = ambiente();
  await mensagem(env, 'Quanto custa?');
  assert.match(enviadas[0], /Mensal: R\$ 21,90 por mês/);
  assert.match(enviadas[0], /1 mês: R\$ 24,90/);
  assert.equal(reais(17990), 'R$ 179,90');
  // se o site não responder, a Jade manda para a página de planos em vez de inventar valor
  env.JADE.precos = async () => { throw new Error('fora'); };
  const { env: env2, enviadas: e2 } = ambiente();
  env2.JADE.precos = async () => { throw new Error('fora'); };
  await mensagem(env2, 'pix');
  assert.match(e2[0], /valores atualizados estão em https:\/\/mercadomacro\.com\.br\/planos/);
  assert.doesNotMatch(e2[0], /R\$ \d/);
});

test('SIM QUERO avisa a equipe; mensagens na pausa vão para a equipe e a Jade fica quieta', async () => {
  const { env, enviadas, avisos } = ambiente();
  await mensagem(env, 'SIM QUERO');
  assert.equal(enviadas.length, 1);
  assert.deepEqual(avisos[0], ['pedido', '0001', 'SIM QUERO']);
  await mensagem(env, 'Quero saber do plano anual para minha equipe');
  assert.equal(enviadas.length, 1);
  assert.deepEqual(avisos[1], ['mensagem', '0001', 'Quero saber do plano anual para minha equipe']);
  await mensagem(env, 'Volte pra Jade');
  assert.equal(enviadas.length, 2);
  assert.match(enviadas[1], /Voltei/);
});

test('limite por número: aviso na primeira mensagem acima do limite e depois silêncio', async () => {
  const { env, enviadas } = ambiente();
  for (let i = 0; i < LIMITE_HORA + 3; i++) await mensagem(env, 'obrigado', '5511999990002');
  assert.equal(enviadas.length, LIMITE_HORA + 1);
  assert.match(enviadas.at(-1), /muitas mensagens/);
  // outro número não é afetado
  await mensagem(env, 'obrigado', '5511999990003');
  assert.equal(enviadas.length, LIMITE_HORA + 2);
});

test('ticker da conversa fica guardado para "e as notícias?"', async () => {
  const { env, enviadas } = ambiente();
  await mensagem(env, 'PETR4', '5511999990004');
  assert.match(enviadas[0], /PETR4 \| Jade/);
  assert.match(enviadas[0], /\+10,00%/);
  await mensagem(env, 'e as notícias?', '5511999990004');
  assert.match(enviadas[1], /Petrobras anuncia dividendos/);
});

test('perguntas sobre insiders vão para o radar da CVM (antes da consulta de cotação)', async () => {
  assert.equal(ehInsiders('os diretores da vale compraram acoes esse ano?'), true);
  assert.equal(ehInsiders('insiders petr4'), true);
  assert.equal(ehInsiders('quanto custa?'), false);
  assert.equal(ehInsiders('petr4'), false);
  const { env, enviadas } = ambiente();
  await mensagem(env, 'Os diretores da VALE3 compraram ações esse ano?', '5511999990005');
  assert.equal(enviadas[0], 'INSIDERS:Os diretores da VALE3 compraram ações esse ano?');
  env.JADE.insiders = async () => { throw new Error('fora'); };
  await mensagem(env, 'insiders petr4', '5511999990005');
  assert.match(enviadas[1], /Não consegui consultar o radar de insiders/);
});

test('resumo de insiders: empresa, período e texto do WhatsApp', async () => {
  const { acharEmpresa, periodoDoTexto, resumoInsiders, textoInsiders } = await import('../src/insiders-resumo.js');
  const d = {
    meses: ['2025-11', '2025-12', '2026-01', '2026-02'], parciais: ['2026-02'], setores: ['Mineração'],
    emp: [{ n: 'VALE', t: ['VALE3'], s: 0, m: { 1: [0, 5000, 100, 0], 2: [0, 0, 300, 50] } }, { n: 'WEG SA', t: ['WEGE3'], s: 0, m: { 3: [0, 0, 0, 900] } }],
    ops: [[0, 'Diretoria', 'C', '2026-01-15', 1000, 60.5, 1200, 'ON']],
  };
  assert.deepEqual(acharEmpresa(d, 'os diretores da Vale compraram?').map((e) => e.n), ['VALE']);
  assert.deepEqual(acharEmpresa(d, 'insiders weg').map((e) => e.n), ['WEG SA']);
  assert.deepEqual(acharEmpresa(d, 'quem os insiders estão comprando?'), []);
  const p = periodoDoTexto('esse ano', new Date('2026-11-14T12:00:00Z'));
  assert.deepEqual(p, { desde: '2026-01' });
  const r = resumoInsiders(d, { empresa: d.emp[0], periodo: p });
  assert.equal(r.periodo, 'jan/2026 a fev/2026');
  assert.deepEqual(r.administracao, { compras: 300000, vendas: 50000, saldo: 250000 });
  assert.deepEqual(r.controladores, { compras: 0, vendas: 0, saldo: 0 });
  const t = textoInsiders(r);
  assert.match(t, /Controladores: sem compras nem vendas/);
  assert.match(t, /saldo \*\+R\$ 250 mil\*/);
  assert.match(t, /15\/01 · Diretoria · compra de 1\.000 ON a R\$ 60,50/);
  assert.match(t, /fev\/2026 ainda chegando/);
  const m = resumoInsiders(d, { periodo: { meses: 12 } });
  assert.equal(m.maiores_vendas[0].ticker, 'VALE3');
  assert.match(textoInsiders(m), /Mais venderam/);
});

test('Vim do Radar: boas-vindas, origem marcada nos links e caminho contado', async () => {
  const { env, enviadas, avisos, funis } = ambiente();
  const de = '5511999990006';
  await mensagem(env, 'Vim do Radar', de);
  assert.match(enviadas[0], /veio do \*Radar\*/);
  await mensagem(env, 'Planos', de);
  assert.match(enviadas[1], /planos\?origem=radar-wa/);
  await mensagem(env, 'quanto custa?', de);
  await mensagem(env, 'SIM QUERO', de);
  assert.match(avisos[0][2], /veio do Radar/);
  assert.deepEqual(funis, [['radar', 'inicio'], ['radar', 'planos'], ['radar', 'atendimento']]); // planos conta uma vez
  // quem não veio do Radar continua com os links de sempre e não entra na conta
  await mensagem(env, 'planos', '5511999990007');
  assert.doesNotMatch(enviadas.at(-1), /radar-wa/);
  assert.equal(funis.length, 3);
});

test('Radar: texto do Telegram vira post do WhatsApp com convite para a Jade', async () => {
  const { paraWhatsApp, postRadar, linkJade } = await import('../src/radar-whatsapp.js');
  assert.equal(paraWhatsApp('☀️ <b>Abertura</b> &amp; <i>mais</i>\n\n\n• Dólar: R$ 5,40'), '☀️ *Abertura* & _mais_\n\n• Dólar: R$ 5,40');
  assert.equal(paraWhatsApp('<a href="https://mercadomacro.com.br">mercadomacro.com.br</a>'), 'https://mercadomacro.com.br');
  const p = postRadar('<b>Fechamento</b>\n• Ibov: 171.000\n\nPainel completo: <a href="https://mercadomacro.com.br">mercadomacro.com.br</a>');
  assert.doesNotMatch(p, /Painel completo/);
  assert.match(p, /\*Conheça o terminal com a Jade:\* https:\/\/wa\.me\/5511971787986\?text=Vim%20do%20Radar/);
  assert.match(p, /\?origem=radar-wa/);
  assert.equal(linkJade(), 'https://wa.me/5511971787986?text=Vim%20do%20Radar');
});

test('Radar: rascunho vai uma vez por dia para o administrador, em duas mensagens', async () => {
  const { rascunhoRadar } = await import('../src/radar-whatsapp.js');
  const msgs = [];
  const telegram = async (tok, m, corpo) => { msgs.push(corpo); return { ok: true }; };
  const config = { tg_token: 't', tg_chat: '1' };
  const k = await rascunhoRadar({}, { tipo: 'abertura', html: '<b>Abertura</b>', config, telegram });
  assert.match(k, /^abertura-\d{4}-\d{2}-\d{2}$/);
  assert.equal(msgs.length, 2);
  assert.match(msgs[0].text, /pronto para o Radar/);
  assert.match(msgs[1].text, /^\*Abertura\*/);
  assert.equal(msgs[1].parse_mode, undefined);
  assert.equal(await rascunhoRadar({}, { tipo: 'abertura', html: 'x', config: { ...config, radar_ult_abertura: k }, telegram }), false);
  assert.equal(await rascunhoRadar({}, { tipo: 'abertura', html: 'x', config: { ...config, radar_wa: 'nao' }, telegram }), false);
});

test('Vim do Radar tira a pausa do atendimento', async () => {
  const { env, enviadas } = ambiente();
  const de = '5511999990008';
  await mensagem(env, 'SIM QUERO', de);
  await mensagem(env, 'oi', de);
  assert.equal(enviadas.length, 1);
  await mensagem(env, 'Vim do Radar', de);
  assert.equal(enviadas.length, 2);
  assert.match(enviadas[1], /veio do \*Radar\*/);
  await mensagem(env, 'oi', de);
  assert.equal(enviadas.length, 3); // a Jade voltou a responder
});

test('"Voltar" sozinho também tira a pausa', async () => {
  const { env, enviadas } = ambiente();
  await mensagem(env, 'SIM QUERO', '5511999990009');
  await mensagem(env, 'Voltar', '5511999990009');
  assert.match(enviadas[1], /Voltei/);
});

test('notícias vêm do site, em português, com as de maior impacto primeiro', async () => {
  const { env, enviadas } = ambiente();
  await mensagem(env, 'noticias');
  assert.match(enviadas[0], /Principais manchetes/);
  assert.ok(enviadas[0].indexOf('Ibovespa sobe') < enviadas[0].indexOf('Petrobras anuncia'));
  assert.match(enviadas[0], /\(Valor Econômico\)/);
});

test('botões: boas-vindas com botões e o toque vira o texto equivalente', async () => {
  const { env, enviadas, botoes } = ambiente();
  await mensagem(env, 'oi');
  assert.deepEqual(botoes[0], ['demo', 'planos', 'humano']);
  await mensagem(env, '', '5511999990001', { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'planos', title: 'Planos e preços' } } });
  assert.match(enviadas[1], /Planos do Mercado Macro/);
  assert.match(enviadas[1], /R\$ 21,90/);
  assert.deepEqual(botoes[1], ['teste', 'pix', 'anual']);
  await mensagem(env, '', '5511999990001', { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'demo', title: 'Ver demo' } } });
  assert.deepEqual(botoes[2], ['noticias', 'agenda', 'ativo']);
});

test('botão Falar com a equipe pede atendimento como o SIM QUERO', async () => {
  const { env, avisos } = ambiente();
  await mensagem(env, '', '5511999990002', { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'humano', title: 'Falar com a equipe' } } });
  assert.equal(avisos[0][0], 'pedido');
});

test('áudio recebe resposta; durante o atendimento vai para a equipe', async () => {
  const { env, enviadas, avisos } = ambiente();
  await mensagem(env, '', '5511999990003', { type: 'audio', audio: { id: 'x' } });
  assert.match(enviadas[0], /ouvir áudios/);
  await mensagem(env, 'SIM QUERO', '5511999990003');
  const antes = enviadas.length;
  await mensagem(env, '', '5511999990003', { type: 'image', image: { id: 'y' } });
  assert.equal(enviadas.length, antes);
  assert.equal(avisos.at(-1)[2], '[foto]');
});

test('reação e mensagens do sistema são ignoradas', async () => {
  const { env, enviadas } = ambiente();
  await mensagem(env, '', '5511999990004', { type: 'reaction', reaction: { emoji: '👍' } });
  assert.equal(enviadas.length, 0);
});

test('não entendi: apresentação na 1ª, ajuda na 2ª e oferta da equipe na 3ª', async () => {
  const { env, enviadas, botoes } = ambiente();
  await mensagem(env, 'xpto qwerty', '5511999990005');
  assert.match(enviadas[0], /Sou a Jade/);
  await mensagem(env, 'abobrinha zzz', '5511999990005');
  assert.match(enviadas[1], /Ainda não entendi|Não entendi/);
  await mensagem(env, 'abobrinha de novo', '5511999990005');
  assert.match(enviadas[2], /equipe/);
  assert.equal(botoes[2][0], 'humano');
  // quando entende, zera
  await mensagem(env, 'noticias', '5511999990005');
  await mensagem(env, 'blablabla', '5511999990005');
  assert.match(enviadas[4], /Não entendi essa/);
});
