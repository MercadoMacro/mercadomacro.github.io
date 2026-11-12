/* Cotações ao vivo da Capital.com para a Mesa.
   Um único Durable Object ("main") abre UMA conexão com a Capital usando a chave, o login e a senha da API
   guardados em /admin (tabela config do D1) e repassa os preços para quem está com a Mesa aberta.
   A chave e a sessão nunca vão para o navegador: com elas dá para operar a conta.
   Sem ninguém conectado por 1 minuto, a conexão com a Capital fecha.
   Cada navegador conectado fica ligado à sua sessão do site: a cada 5 min a sessão é conferida no D1 e,
   se saiu, expirou ou a conta foi bloqueada, a conexão é fechada. Falha ao abrir a Capital tenta de novo com espera crescente.
   /admin chama POST /reiniciar ao trocar ou apagar a chave: a sessão com a Capital é descartada na hora. */

import { abrir } from './cofre.js';
const STREAM = 'wss://api-streaming-capital.backend-capital.com/connect';
// símbolo do Yahoo na Mesa -> como achar na Capital.
// fixo: código exato. futuro: prefixo do contrato (GCZ2026 = ouro, dezembro de 2026); vão os 2 vencimentos mais próximos
// e o navegador fica com o que tem o preço mais perto do Yahoo (o mesmo contrato que o Yahoo mostra).
const ATIVOS = {
  'BRL=X': { fixo: 'USDBRL' },
  '^VIX': { fixo: 'VIX' },
  'GC=F': { futuro: 'GC', busca: 'Gold' },
  'SI=F': { futuro: 'SI', busca: 'Silver' },
  'HG=F': { futuro: 'HG', busca: 'Copper' },
  'BZ=F': { futuro: 'LCO', busca: 'Brent' },
  'CL=F': { futuro: 'CL', busca: 'Crude' },
  'NG=F': { futuro: 'NG', busca: 'Natural Gas' },
  'KC=F': { futuro: 'KC', busca: 'Coffee' },
  'ES=F': { futuro: 'ES', busca: 'US 500' },
  'NQ=F': { futuro: 'NQ', busca: 'US Tech 100' },
  'YM=F': { futuro: 'YM', busca: 'Wall Street' },
  'RTY=F': { futuro: 'RTY', busca: 'US 2000' },
  // índices à vista em CFD (04/11/2026, Severino): negociam quase 24 h; o navegador só usa se ficar a até 3% do Yahoo
  '^N225': { indice: ['J225', 'JP225'], busca: 'Japan 225' },
  '^HSI': { indice: ['HK50', 'HK33'], busca: 'Hong Kong 50' },
  '^AXJO': { indice: ['AU200', 'AUS200'], busca: 'Australia 200' },
  '^GDAXI': { indice: ['DE40', 'DE30', 'GER40'], busca: 'Germany 40' },
  '^FTSE': { indice: ['UK100'], busca: 'UK 100' },
  '^FCHI': { indice: ['FR40'], busca: 'France 40' },
  '^STOXX50E': { indice: ['EU50', 'EU Stocks 50'], busca: 'EU Stocks 50' },
  '^GSPC': { indice: ['US500'], busca: 'US 500' },
  '^DJI': { indice: ['US30'], busca: 'US 30' },
};
// ETFs das listas prontas da Watchlist (ETFs dos EUA e ETFs globais) (10/11/2026, Severino); a mesma lista está em site/watchlists-core.js.
// A Capital dá as ações e ETFs americanos pelo próprio código (SPY, QQQ...). Os que ela não tiver ficam com o Yahoo.
export const ETFS_EUA = ['SPY', 'VOO', 'QQQ', 'DIA', 'IWM', 'VTI', 'EEM', 'EFA', 'EWZ', 'FXI', 'SHY', 'IEF', 'TLT', 'LQD', 'HYG', 'GLD', 'SLV', 'USO', 'DBC',
  'SMH', 'XLK', 'XLF', 'XLE', 'XLV', 'VNQ', 'ONEQ', 'VGK', 'EWG', 'EWU', 'EWJ', 'EWA', 'EPP', 'EWY', 'EWT', 'INDA', 'BKF'];
for (const t of ETFS_EUA) ATIVOS[t] = { acao: t };
const POR_CONEXAO = 40; // a Capital aceita até 40 mercados por conexão de streaming; acima disso abre outra
const MESES = 'FGHJKMNQUVXZ';
const vencimento = (epic, pre) => {
  const m = new RegExp('^' + pre + '([' + MESES + '])(20\\d\\d)$').exec(epic);
  return m ? +m[2] * 12 + MESES.indexOf(m[1]) : null;
};

export class CapitalRelay {
  constructor(state, env) {
    this.env = env;
    this.clientes = new Set();
    this.up = null;          // conexão com a Capital (a primeira; as outras, acima de 40 mercados, ficam em extras)
    this.extras = [];
    this.ses = null;         // { base, cst, sec }
    this.mapa = null;        // símbolo Yahoo -> [epics]
    this.ultimo = {};        // epic -> { b, o, t, st }
    this.timers = [];
    this.fechar = null;
    this.erro = '';
    this.sessaoDe = new Map(); // socket do navegador -> hash da sessão do site
    this.vigia = null;         // conferência periódica das sessões
    this.tentativa = 0; this.novaTentativa = null;
    this.geracao = 0;          // muda a cada desligar: uma abertura antiga em andamento desiste
  }

  async fetch(req) {
    // só o worker do site chega aqui (o Durable Object não tem endereço público)
    if (new URL(req.url).pathname === '/reiniciar' && req.method === 'POST') { await this.reiniciar(); return new Response(null, { status: 204 }); }
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Use WebSocket.', { status: 426 });
    const sessao = req.headers.get('X-MM-Sessao') || '';
    if (!/^[a-f0-9]{64}$/.test(sessao)) return new Response('Sem sessão.', { status: 401 });
    const [cli, srv] = Object.values(new WebSocketPair());
    srv.accept();
    this.clientes.add(srv);
    this.sessaoDe.set(srv, sessao);
    clearTimeout(this.fechar); this.fechar = null;
    const sai = () => { this.clientes.delete(srv); this.sessaoDe.delete(srv); if (!this.clientes.size) this.agendarFechar(); };
    srv.addEventListener('close', sai);
    srv.addEventListener('error', sai);
    if (!this.vigia) this.vigia = setInterval(() => this.conferirSessoes().catch(() => {}), 5 * 60000);
    // quem chega recebe o mapa e os últimos preços na hora
    if (this.mapa) this.manda(srv, { tipo: 'mapa', mapa: this.mapa, precos: this.ultimo });
    else if (this.erro) this.manda(srv, { tipo: 'erro', erro: this.erro });
    if (!this.up && !this.novaTentativa) this.tentarLigar();
    return new Response(null, { status: 101, webSocket: cli });
  }

  // fecha quem saiu do site, teve a sessão expirada ou a conta bloqueada
  async conferirSessoes() {
    if (!this.clientes.size) { clearInterval(this.vigia); this.vigia = null; return; }
    const hashes = [...new Set(this.sessaoDe.values())];
    const ok = new Set();
    for (let i = 0; i < hashes.length; i += 50) {
      const lote = hashes.slice(i, i + 50);
      const r = await this.env.DB.prepare(`SELECT s.token FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
        WHERE s.token IN (${lote.map(() => '?').join(',')}) AND s.expira > ? AND u.status = 'ativo'
        AND (u.admin = 1 OR u.expira IS NULL OR u.expira > ?)`).bind(...lote, Date.now(), new Date().toISOString()).all();
      for (const x of r.results) ok.add(x.token);
    }
    for (const [ws, h] of this.sessaoDe) {
      if (ok.has(h)) continue;
      this.clientes.delete(ws); this.sessaoDe.delete(ws);
      try { ws.close(4001, 'Sessão encerrada'); } catch (_) {}
    }
    if (!this.clientes.size) this.agendarFechar();
  }

  // abre a Capital; se falhar, tenta de novo (10 s, 20 s, 40 s... até 5 min) enquanto houver alguém olhando
  tentarLigar() {
    clearTimeout(this.novaTentativa); this.novaTentativa = null;
    this.ligar().then(() => { this.erro = ''; }).catch((e) => {
      this.erro = String(e.message || e);
      this.avisa({ tipo: 'erro', erro: this.erro });
      if (/desligada/.test(this.erro) || !this.clientes.size) return; // sem chave salva não adianta insistir
      const espera = Math.min(5 * 60000, 10000 * 2 ** Math.min(this.tentativa++, 5));
      this.novaTentativa = setTimeout(() => { this.novaTentativa = null; if (this.clientes.size && !this.up) this.tentarLigar(); }, espera);
    });
  }

  // chave trocada ou apagada em /admin: descarta a sessão com a Capital e os preços, e abre de novo se ainda tiver chave
  async reiniciar() {
    clearTimeout(this.novaTentativa); this.novaTentativa = null;
    this.desligar();
    this.mapa = null; this.ultimo = {}; this.erro = ''; this.tentativa = 0;
    this.avisa({ tipo: 'mapa', mapa: {}, precos: {} });
    if (this.clientes.size) this.tentarLigar();
  }

  manda(ws, o) { try { ws.send(JSON.stringify(o)); } catch (_) { this.clientes.delete(ws); } }
  avisa(o) { const s = JSON.stringify(o); for (const ws of this.clientes) { try { ws.send(s); } catch (_) { this.clientes.delete(ws); } } }

  agendarFechar() {
    clearTimeout(this.fechar);
    this.fechar = setTimeout(() => {
      if (!this.clientes.size) { this.desligar(); clearTimeout(this.novaTentativa); this.novaTentativa = null; clearInterval(this.vigia); this.vigia = null; }
    }, 60000);
  }
  desligar() {
    this.geracao++;
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    for (const sk of [this.up, ...(this.extras || [])]) { if (sk && sk !== 'abrindo') { try { sk.close(); } catch (_) {} } }
    this.up = null; this.extras = []; this.ses = null;
  }

  async config() {
    const r = await this.env.DB.prepare(`SELECT chave, valor FROM config WHERE chave IN ('cap_key','cap_id','cap_pw','cap_amb')`).all();
    return Object.fromEntries(await Promise.all(r.results.map(async (x) => [x.chave, await abrir(this.env, x.chave, x.valor)])));
  }
  async sessao() {
    const c = await this.config();
    if (!c.cap_key) throw new Error('Capital.com desligada em /admin');
    const base = c.cap_amb === 'real' ? 'https://api-capital.backend-capital.com' : 'https://demo-api-capital.backend-capital.com';
    const r = await fetch(base + '/api/v1/session', {
      method: 'POST', headers: { 'X-CAP-API-KEY': c.cap_key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: c.cap_id, password: c.cap_pw, encryptedPassword: false }),
    });
    if (!r.ok) throw new Error('Capital.com recusou a sessão (HTTP ' + r.status + ')');
    this.ses = { base, cst: r.headers.get('CST'), sec: r.headers.get('X-SECURITY-TOKEN') };
    return this.ses;
  }
  async rest(path, tentou) {
    const r = await fetch(this.ses.base + path, { headers: { CST: this.ses.cst, 'X-SECURITY-TOKEN': this.ses.sec } });
    if (r.status === 401 && !tentou) { await this.sessao(); return this.rest(path, true); }
    if (!r.ok) throw new Error('Capital.com HTTP ' + r.status);
    return r.json();
  }

  // acha os contratos de cada futuro (os 2 vencimentos mais próximos que não passaram)
  async montarMapa() {
    const agora = new Date(), hoje = agora.getUTCFullYear() * 12 + agora.getUTCMonth();
    const mapa = {};
    for (const [sym, a] of Object.entries(ATIVOS)) {
      if (a.fixo) { mapa[sym] = [a.fixo]; continue; }
      if (a.acao) {
        // ETF: só o código exato (outra coisa com nome parecido não serve)
        const j = await this.rest('/api/v1/markets?searchTerm=' + encodeURIComponent(a.acao)).catch(() => ({}));
        const m = (j.markets || []).find((x) => String(x.epic || '').toUpperCase() === a.acao);
        if (m) mapa[sym] = [m.epic];
        await new Promise((ok) => setTimeout(ok, 120));
        continue;
      }
      const j = await this.rest('/api/v1/markets?searchTerm=' + encodeURIComponent(a.busca)).catch(() => ({}));
      if (a.indice) {
        // índice: o código conhecido; se a Capital trocar o código, o mercado de índice com o mesmo nome
        const ms = j.markets || [];
        const m = ms.find((x) => a.indice.includes(x.epic)) || ms.find((x) => x.instrumentType === 'INDICES' && String(x.instrumentName || '').toLowerCase() === a.busca.toLowerCase());
        if (m) mapa[sym] = [m.epic];
        await new Promise((ok) => setTimeout(ok, 120));
        continue;
      }
      const eps = (j.markets || []).map((m) => m.epic).filter((e) => { const v = vencimento(e, a.futuro); return v != null && v >= hoje; });
      eps.sort((x, y) => vencimento(x, a.futuro) - vencimento(y, a.futuro));
      if (eps.length) mapa[sym] = eps.slice(0, 2);
      await new Promise((ok) => setTimeout(ok, 120)); // limite da Capital: 10 pedidos por segundo
    }
    return mapa;
  }

  // preço e situação (aberto/fechado) de todos os contratos, a cada 5 min; também mantém a sessão viva
  async foto() {
    const eps = [...new Set(Object.values(this.mapa).flat())], det = [];
    // a Capital aceita até 50 mercados por pedido
    for (let i = 0; i < eps.length; i += 50) {
      const j = await this.rest('/api/v1/markets?epics=' + eps.slice(i, i + 50).join(','));
      det.push(...(j.marketDetails || []));
    }
    for (const m of det) {
      const s = m.snapshot || {}, e = m.instrument?.epic || m.epic;
      if (!e) continue;
      const v = this.ultimo[e] || {};
      this.ultimo[e] = { b: s.bid ?? v.b, o: s.offer ?? v.o, t: v.t || Date.parse(s.updateTimeUTC ? s.updateTimeUTC + 'Z' : '') || Date.now(), st: s.marketStatus || v.st };
    }
    this.avisa({ tipo: 'precos', precos: this.ultimo });
  }

  async ligar() {
    if (this.up) return;
    this.up = 'abrindo';
    const g = this.geracao;
    try {
      await this.sessao();
      const mapa = await this.montarMapa();
      if (g !== this.geracao) return; // desligaram no meio do caminho
      this.mapa = mapa;
      await this.foto().catch(() => {});
      if (g !== this.geracao) return;
      this.avisa({ tipo: 'mapa', mapa: this.mapa, precos: this.ultimo });
      // uma conexão a cada 40 mercados (os da Mesa vêm primeiro, os ETFs depois); se uma cair, todas fecham e reabrem juntas
      const todos = [...new Set(Object.values(this.mapa).flat())], grupos = [];
      for (let i = 0; i < todos.length; i += POR_CONEXAO) grupos.push(todos.slice(i, i + POR_CONEXAO));
      const socks = grupos.map(() => new WebSocket(STREAM));
      this.up = socks[0];
      this.extras = socks.slice(1);
      const ws = socks[0];
      const caiu = () => {
        if (this.up !== ws) return;
        this.desligar();
        if (this.clientes.size && !this.novaTentativa) this.novaTentativa = setTimeout(() => { this.novaTentativa = null; if (this.clientes.size && !this.up) this.tentarLigar(); }, 10000);
      };
      socks.forEach((sk, i) => {
        sk.addEventListener('open', () => {
          if (i === 0) this.tentativa = 0;
          sk.send(JSON.stringify({ destination: 'marketData.subscribe', correlationId: '1', cst: this.ses.cst, securityToken: this.ses.sec, payload: { epics: grupos[i] } }));
        });
        sk.addEventListener('message', (ev) => {
          let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
          if (m.destination !== 'quote' || !m.payload?.epic) return;
          const p = m.payload, v = this.ultimo[p.epic] || {};
          const q = { b: p.bid, o: p.ofr ?? p.offer, t: p.timestamp || Date.now(), st: v.st };
          this.ultimo[p.epic] = q;
          this.avisa({ tipo: 'q', e: p.epic, ...q });
        });
        sk.addEventListener('close', caiu);
        sk.addEventListener('error', caiu);
      });
      // a Capital pede um ping a cada menos de 10 min, em cada conexão
      this.timers.push(setInterval(() => { for (const sk of socks) { try { sk.send(JSON.stringify({ destination: 'ping', correlationId: '2', cst: this.ses.cst, securityToken: this.ses.sec })); } catch (_) {} } }, 5 * 60000));
      this.timers.push(setInterval(() => this.foto().catch(() => {}), 5 * 60000));
    } catch (e) {
      if (g === this.geracao) this.up = null;
      throw e;
    }
  }
}
