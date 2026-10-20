/* Cotações ao vivo da Capital.com para a Mesa.
   Um único Durable Object ("main") abre UMA conexão com a Capital usando a chave, o login e a senha da API
   guardados em /admin (tabela config do D1) e repassa os preços para quem está com a Mesa aberta.
   A chave e a sessão nunca vão para o navegador: com elas dá para operar a conta.
   Sem ninguém conectado por 1 minuto, a conexão com a Capital fecha. */

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
};
const MESES = 'FGHJKMNQUVXZ';
const vencimento = (epic, pre) => {
  const m = new RegExp('^' + pre + '([' + MESES + '])(20\\d\\d)$').exec(epic);
  return m ? +m[2] * 12 + MESES.indexOf(m[1]) : null;
};

export class CapitalRelay {
  constructor(state, env) {
    this.env = env;
    this.clientes = new Set();
    this.up = null;          // conexão com a Capital
    this.ses = null;         // { base, cst, sec }
    this.mapa = null;        // símbolo Yahoo -> [epics]
    this.ultimo = {};        // epic -> { b, o, t, st }
    this.timers = [];
    this.fechar = null;
    this.erro = '';
  }

  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Use WebSocket.', { status: 426 });
    const [cli, srv] = Object.values(new WebSocketPair());
    srv.accept();
    this.clientes.add(srv);
    clearTimeout(this.fechar); this.fechar = null;
    const sai = () => { this.clientes.delete(srv); if (!this.clientes.size) this.agendarFechar(); };
    srv.addEventListener('close', sai);
    srv.addEventListener('error', sai);
    // quem chega recebe o mapa e os últimos preços na hora
    if (this.mapa) this.manda(srv, { tipo: 'mapa', mapa: this.mapa, precos: this.ultimo });
    if (!this.up) this.ligar().catch((e) => { this.erro = String(e.message || e); this.avisa({ tipo: 'erro', erro: this.erro }); });
    return new Response(null, { status: 101, webSocket: cli });
  }

  manda(ws, o) { try { ws.send(JSON.stringify(o)); } catch (_) { this.clientes.delete(ws); } }
  avisa(o) { const s = JSON.stringify(o); for (const ws of this.clientes) { try { ws.send(s); } catch (_) { this.clientes.delete(ws); } } }

  agendarFechar() {
    clearTimeout(this.fechar);
    this.fechar = setTimeout(() => { if (!this.clientes.size) this.desligar(); }, 60000);
  }
  desligar() {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    if (this.up) { try { this.up.close(); } catch (_) {} }
    this.up = null; this.ses = null;
  }

  async config() {
    const r = await this.env.DB.prepare(`SELECT chave, valor FROM config WHERE chave IN ('cap_key','cap_id','cap_pw','cap_amb')`).all();
    return Object.fromEntries(r.results.map((x) => [x.chave, x.valor]));
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
  async rest(path) {
    const r = await fetch(this.ses.base + path, { headers: { CST: this.ses.cst, 'X-SECURITY-TOKEN': this.ses.sec } });
    if (r.status === 401) { await this.sessao(); return this.rest(path); }
    if (!r.ok) throw new Error('Capital.com HTTP ' + r.status);
    return r.json();
  }

  // acha os contratos de cada futuro (os 2 vencimentos mais próximos que não passaram)
  async montarMapa() {
    const agora = new Date(), hoje = agora.getUTCFullYear() * 12 + agora.getUTCMonth();
    const mapa = {};
    for (const [sym, a] of Object.entries(ATIVOS)) {
      if (a.fixo) { mapa[sym] = [a.fixo]; continue; }
      const j = await this.rest('/api/v1/markets?searchTerm=' + encodeURIComponent(a.busca)).catch(() => ({}));
      const eps = (j.markets || []).map((m) => m.epic).filter((e) => { const v = vencimento(e, a.futuro); return v != null && v >= hoje; });
      eps.sort((x, y) => vencimento(x, a.futuro) - vencimento(y, a.futuro));
      if (eps.length) mapa[sym] = eps.slice(0, 2);
      await new Promise((ok) => setTimeout(ok, 120)); // limite da Capital: 10 pedidos por segundo
    }
    return mapa;
  }

  // preço e situação (aberto/fechado) de todos os contratos, a cada 5 min; também mantém a sessão viva
  async foto() {
    const eps = [...new Set(Object.values(this.mapa).flat())];
    const j = await this.rest('/api/v1/markets?epics=' + eps.join(','));
    for (const m of j.marketDetails || []) {
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
    try {
      await this.sessao();
      this.mapa = await this.montarMapa();
      await this.foto().catch(() => {});
      this.avisa({ tipo: 'mapa', mapa: this.mapa, precos: this.ultimo });
      const ws = new WebSocket(STREAM);
      this.up = ws;
      ws.addEventListener('open', () => {
        const eps = [...new Set(Object.values(this.mapa).flat())].slice(0, 40);
        ws.send(JSON.stringify({ destination: 'marketData.subscribe', correlationId: '1', cst: this.ses.cst, securityToken: this.ses.sec, payload: { epics: eps } }));
      });
      ws.addEventListener('message', (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
        if (m.destination !== 'quote' || !m.payload?.epic) return;
        const p = m.payload, v = this.ultimo[p.epic] || {};
        const q = { b: p.bid, o: p.ofr ?? p.offer, t: p.timestamp || Date.now(), st: v.st };
        this.ultimo[p.epic] = q;
        this.avisa({ tipo: 'q', e: p.epic, ...q });
      });
      const caiu = () => { if (this.up !== ws) return; this.desligar(); if (this.clientes.size) setTimeout(() => this.ligar().catch(() => {}), 10000); };
      ws.addEventListener('close', caiu);
      ws.addEventListener('error', caiu);
      // a Capital pede um ping a cada menos de 10 min
      this.timers.push(setInterval(() => { try { ws.send(JSON.stringify({ destination: 'ping', correlationId: '2', cst: this.ses.cst, securityToken: this.ses.sec })); } catch (_) {} }, 5 * 60000));
      this.timers.push(setInterval(() => this.foto().catch(() => {}), 5 * 60000));
    } catch (e) {
      this.up = null;
      throw e;
    }
  }
}
