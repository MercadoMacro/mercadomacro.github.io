/* Abertura do mercado em imagem (página /abertura, só administrador).
   Os números vêm de /api/admin/abertura (worker). Mesmo funcionamento do /fechamento:
   baixar, compartilhar, mandar no Telegram (rotas fechamento-foto e fechamento-texto) ou copiar o texto.
   Regra do painel: nada inventado; o que faltar aparece como "—". */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const ok = (v) => typeof v === 'number' && isFinite(v);
  const br = (v, c) => v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tom = (x) => (!ok(x) ? '' : x > 0.005 ? 'up' : x < -0.005 ? 'dn' : 'zero');
  const pct = (x) => (!ok(x) ? '—' : (x > 0.005 ? '+' : x < -0.005 ? '−' : '') + br(Math.abs(x), 2) + '%');
  const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const ddmm = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
  let dados = null;

  const n0 = (v) => br(v, 0), n2 = (v) => br(v, 2);
  const FMT = {
    ibov: n0, ewz: (v) => 'US$ ' + n2(v), dolar: (v) => 'R$ ' + br(v, 4), dxy: n2,
    spf: n0, nqf: n0, dowf: n0, stoxx: n0, dax: n0, ftse: n0, nikkei: n0, hsi: n0, xangai: n0,
    brent: (v) => 'US$ ' + n2(v), ouro: (v) => 'US$ ' + n0(v), btc: (v) => 'US$ ' + n0(v), tnx: (v) => n2(v) + '%',
  };
  const NOME = { spf: 'S&P 500', nqf: 'Nasdaq', dowf: 'Dow Jones', stoxx: 'Euro Stoxx 50', dax: 'DAX', ftse: 'FTSE 100', nikkei: 'Nikkei', hsi: 'Hang Seng', xangai: 'Xangai' };

  function desenha(d) {
    const dt = new Date(d.data + 'T12:00:00Z');
    const c = d.cards;
    const cd = (k, nota) => {
      const x = c[k] || {};
      const semVar = k === 'tnx';
      return `<div class="cd ${semVar ? '' : tom(x.ch)}"><span>${esc(NOME[k] || x.nome || k)}</span><div><b>${ok(x.v) ? FMT[k](x.v) : '—'}</b>${semVar ? '' : `<i>${pct(x.ch)}</i>`}</div>${nota ? `<em>${esc(nota)}</em>` : ''}</div>`;
    };
    const ib = c.ibov || {};
    // na imagem cabem até 6 itens da agenda; com agenda cheia, 3 notícias (o texto leva tudo)
    const ag = (d.agenda || []).slice(0, 6);
    const nots = (d.noticias || []).slice(0, ag.length > 3 ? 3 : 4);
    const sol = `<svg class="sol" viewBox="0 0 200 110" aria-hidden="true">
          <defs><radialGradient id="sg" cx="50%" cy="100%" r="60%"><stop offset="0" stop-color="#ffd76a"/><stop offset=".55" stop-color="#ffb627"/><stop offset="1" stop-color="#ff8a1f"/></radialGradient>
          <radialGradient id="hg" cx="50%" cy="100%" r="70%"><stop offset="0" stop-color="#ffcf6b" stop-opacity=".55"/><stop offset="1" stop-color="#ffcf6b" stop-opacity="0"/></radialGradient></defs>
          <circle cx="100" cy="110" r="100" fill="url(#hg)"/>
          <g stroke="#f5a524" stroke-width="5" stroke-linecap="round" opacity=".85">${[-80, -60, -40, -20, 0, 20, 40, 60, 80].map((a) => { const r = (a - 90) * Math.PI / 180; return `<line x1="${(100 + Math.cos(r) * 58).toFixed(1)}" y1="${(110 + Math.sin(r) * 58).toFixed(1)}" x2="${(100 + Math.cos(r) * 80).toFixed(1)}" y2="${(110 + Math.sin(r) * 80).toFixed(1)}"/>`; }).join('')}</g>
          <circle cx="100" cy="110" r="46" fill="url(#sg)"/>
        </svg>`;
    // cabeçalho das duas páginas; n = número da página (1 de 2, 2 de 2)
    const cab = (n) => `
      <div class="cab manha">${sol}
        <div class="cab-l"><img src="/logo-mercado-macro-claro.png" alt="Mercado Macro" crossorigin="anonymous">
          <div class="cab-d"><span>${DIAS[dt.getUTCDay()]}</span><b>${dt.getUTCDate()} ${MESES[dt.getUTCMonth()].toUpperCase()}</b></div></div>
        <h1>Abertura <em>do mercado</em></h1>
        <small>${n === 1 ? 'O que mexe com a bolsa hoje' : 'Agenda e notícias do dia'} · ${n} de 2</small>
      </div>`;
    const rod = (txt) => `<div class="rod"><b>mercadomacro.com.br</b><span>${txt}</span></div>`;
    // as duas páginas têm o formato do status do WhatsApp (9:16): 540 x 960, viram 1080 x 1920 na imagem
    $('card').innerHTML = `
      <div class="card claro pg" id="pg1">${cab(1)}
        <div class="corpo">
          <section><div class="sub">Brasil</div>
          <div class="grade">${cd('ibov', ib.dia ? 'Fechamento de ' + ddmm(ib.dia) : '')}${cd('dolar', 'Agora')}${cd('ewz', 'Último fechamento em NY')}${cd('dxy', 'Dólar contra moedas fortes')}</div></section>
          <section><div class="sub">Futuros em Nova York <small>agora</small></div>
          <div class="grade g3">${cd('spf')}${cd('nqf')}${cd('dowf')}</div></section>
          <section><div class="sub">Europa <small>agora</small></div>
          <div class="grade g3">${cd('stoxx')}${cd('dax')}${cd('ftse')}</div></section>
          <section><div class="sub">Ásia <small>fechamento</small></div>
          <div class="grade g3">${cd('nikkei')}${cd('hsi')}${cd('xangai')}</div></section>
        </div>
        ${rod('Futuros e Europa no momento da imagem;<br>Ásia e Ibovespa no último fechamento. Fonte: Yahoo Finance.')}
      </div>
      <div class="card claro pg${ag.length > 4 ? ' cheio' : ''}" id="pg2">${cab(2)}
        <div class="corpo">
          <section><div class="sub">Commodities, cripto e juros</div>
          <div class="grade">${cd('brent')}${cd('ouro')}${cd('btc')}${cd('tnx')}</div></section>
          <div class="bloco"><h2>Agenda de hoje (horário de Brasília)</h2>${ag.length
            ? `<table class="agenda">${ag.map((a) => `<tr><td class="h">${esc(a.hora)}</td><td class="p"><b class="${a.pais === 'EUA' ? 'eua' : ''}">${esc(a.pais)}</b></td><td class="t">${esc(a.titulo)}${a.proj || a.ant ? `<span>${a.proj ? 'Projeção ' + esc(a.proj) : ''}${a.proj && a.ant ? ' · ' : ''}${a.ant ? 'Anterior ' + esc(a.ant) : ''}</span>` : ''}</td></tr>`).join('')}</table>`
            : `<p class="vazio">${d.agendaOk ? 'Sem indicadores importantes do Brasil ou dos EUA hoje.' : '—'}</p>`}</div>
          <div class="bloco dest"><h2>Principais notícias</h2>${nots.length
            ? `<ul class="nots">${nots.map((n) => `<li><p>${esc(n.t)}</p>${n.f ? `<span>${esc(n.f)}</span>` : ''}</li>`).join('')}</ul>`
            : '<p class="vazio">Sem notícias disponíveis agora.</p>'}</div>
        </div>
        ${rod('Fontes: Yahoo Finance, Investing/TradingView (agenda)<br>e os veículos citados.')}
      </div>`;
  }

  function msg(t, erro) { const m = $('f-msg'); m.textContent = t || ''; m.className = erro ? 'erro' : ''; }
  async function carrega() {
    msg('Buscando os números…');
    $('f-atualizar').disabled = true;
    try {
      const r = await fetch('/api/admin/abertura', { credentials: 'same-origin', cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erro || 'Não foi possível buscar os números.');
      dados = j; desenha(j); $('texto').textContent = j.texto || ''; msg('');
    } catch (e) { msg(e.message, true); }
    finally { $('f-atualizar').disabled = false; }
  }
  async function imagem(id) {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const cv = await window.html2canvas($(id), { scale: 2, backgroundColor: '#fffaf2', useCORS: true, logging: false });
    return new Promise((res) => cv.toBlob(res, 'image/png'));
  }
  const imagens = async () => [await imagem('pg1'), await imagem('pg2')];
  const nome = (n) => 'abertura-' + (dados ? dados.data : 'mercado') + '-' + n + '.png';
  function ver(qual) {
    document.querySelectorAll('.abas button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.ver === qual)));
    $('texto').hidden = qual !== 'texto';
    document.querySelector('.palco').hidden = qual === 'texto';
  }
  function liga() {
    document.querySelectorAll('.abas button').forEach((b) => { b.onclick = () => ver(b.dataset.ver); });
    $('f-atualizar').onclick = carrega;
    $('f-telegram-txt').onclick = async function () {
      if (!dados) return;
      this.disabled = true; msg('Mandando no Telegram…');
      try {
        const r = await fetch('/api/admin/fechamento-texto', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: dados.texto }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.erro || 'O Telegram não recebeu.');
        msg('Texto enviado. Confira o Telegram.');
      } catch (e) { msg(e.message, true); } finally { this.disabled = false; }
    };
    $('f-copiar').onclick = async function () {
      if (!dados) return;
      try { await navigator.clipboard.writeText(dados.texto || ''); msg('Texto copiado. É só colar no WhatsApp ou onde quiser.'); }
      catch (e) { ver('texto'); msg('Não deu para copiar sozinho: o texto está aberto abaixo para você selecionar.', true); }
    };
    $('f-baixar').onclick = async function () {
      if (!dados) return;
      this.disabled = true; msg('Gerando as duas imagens…');
      try {
        const bs = await imagens();
        bs.forEach((b, i) => setTimeout(() => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = nome(i + 1); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }, i * 600));
        msg('Duas imagens baixadas (página 1 e página 2).');
      } catch (e) { msg('Não foi possível gerar as imagens.', true); } finally { this.disabled = false; }
    };
    if (navigator.canShare && navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] })) {
      $('f-compartilhar').hidden = false;
      $('f-compartilhar').onclick = async function () {
        if (!dados) return;
        this.disabled = true;
        try { const bs = await imagens(); await navigator.share({ files: bs.map((b, i) => new File([b], nome(i + 1), { type: 'image/png' })), text: 'Abertura do mercado | mercadomacro.com.br' }); msg(''); }
        catch (e) { if (e && e.name !== 'AbortError') msg('Não foi possível compartilhar.', true); } finally { this.disabled = false; }
      };
    }
    // as duas páginas vão juntas numa postagem só (álbum), com a legenda na primeira
    async function mandar(bt, destino) {
      if (!dados) return;
      bt.disabled = true; msg(destino === 'canal' ? 'Postando no canal…' : 'Mandando no Telegram…');
      try {
        const bs = await imagens();
        const fd = new FormData();
        bs.forEach((b, i) => fd.append('foto', b, nome(i + 1)));
        fd.append('legenda', dados.legenda || '');
        if (destino) fd.append('destino', destino);
        const r = await fetch('/api/admin/fechamento-foto', { method: 'POST', credentials: 'same-origin', body: fd });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.erro || 'O Telegram não recebeu.');
        msg(destino === 'canal' ? 'Postado no canal público.' : 'As duas imagens foram enviadas. Confira o Telegram.');
      } catch (e) { msg(e.message, true); } finally { bt.disabled = false; }
    }
    $('f-telegram').onclick = function () { mandar(this, ''); };
    $('f-canal').onclick = function () { if (confirm('Postar a abertura no canal público agora?')) mandar(this, 'canal'); };
  }

  if (window.__ABERTURA) { dados = window.__ABERTURA; desenha(dados); document.body.classList.add('robo'); }
  else { liga(); carrega(); }
})();
