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
    const ag = d.agenda || [];
    $('card').innerHTML = `
      <div class="cab manha">
        <div class="cab-l"><img src="/logo-mercado-macro.png" alt="Mercado Macro" crossorigin="anonymous">
          <div class="cab-d"><span>${DIAS[dt.getUTCDay()]}</span><b>${dt.getUTCDate()} ${MESES[dt.getUTCMonth()].toUpperCase()}</b></div></div>
        <h1>Abertura <em>do mercado</em></h1>
        <small>O que mexe com a bolsa hoje · ${dt.getUTCFullYear()}</small>
      </div>
      <div class="sub">Brasil</div>
      <div class="grade">${cd('ibov', ib.dia ? 'Fechamento de ' + ddmm(ib.dia) : '')}${cd('dolar', 'Agora')}${cd('ewz', 'Último fechamento em NY')}${cd('dxy', 'Dólar contra moedas fortes')}</div>
      <div class="sub">Futuros em Nova York <small>agora</small></div>
      <div class="grade g3">${cd('spf')}${cd('nqf')}${cd('dowf')}</div>
      <div class="sub">Europa <small>agora</small></div>
      <div class="grade g3">${cd('stoxx')}${cd('dax')}${cd('ftse')}</div>
      <div class="sub">Ásia <small>fechamento</small></div>
      <div class="grade g3">${cd('nikkei')}${cd('hsi')}${cd('xangai')}</div>
      <div class="sub">Commodities, cripto e juros</div>
      <div class="grade">${cd('brent')}${cd('ouro')}${cd('btc')}${cd('tnx')}</div>
      <div class="bloco"><h2>Agenda de hoje (horário de Brasília)</h2>${ag.length
        ? `<table class="agenda">${ag.map((a) => `<tr><td class="h">${esc(a.hora)}</td><td class="p"><b class="${a.pais === 'EUA' ? 'eua' : ''}">${esc(a.pais)}</b></td><td class="t">${esc(a.titulo)}${a.proj || a.ant ? `<span>${a.proj ? 'Projeção ' + esc(a.proj) : ''}${a.proj && a.ant ? ' · ' : ''}${a.ant ? 'Anterior ' + esc(a.ant) : ''}</span>` : ''}</td></tr>`).join('')}</table>`
        : `<p class="vazio">${d.agendaOk ? 'Sem indicadores importantes do Brasil ou dos EUA hoje.' : '—'}</p>`}</div>
      <div class="bloco dest"><h2>Principais notícias</h2>${d.noticias && d.noticias.length
        ? `<ul class="nots">${d.noticias.map((n) => `<li><p>${esc(n.t)}</p>${n.f ? `<span>${esc(n.f)}</span>` : ''}</li>`).join('')}</ul>`
        : '<p class="vazio">Sem notícias disponíveis agora.</p>'}</div>
      <div class="rod"><b>mercadomacro.com.br</b><span>Futuros e Europa no momento da imagem; Ásia e Ibovespa no último fechamento.<br>Fontes: Yahoo Finance, Investing/TradingView (agenda) e os veículos citados.</span></div>`;
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
  async function imagem() {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const cv = await window.html2canvas($('card'), { scale: 2, backgroundColor: '#04070d', useCORS: true, logging: false });
    return new Promise((res) => cv.toBlob(res, 'image/png'));
  }
  const nome = () => 'abertura-' + (dados ? dados.data : 'mercado') + '.png';
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
      this.disabled = true; msg('Gerando a imagem…');
      try { const b = await imagem(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = nome(); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); msg('Imagem baixada.'); }
      catch (e) { msg('Não foi possível gerar a imagem.', true); } finally { this.disabled = false; }
    };
    if (navigator.canShare && navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] })) {
      $('f-compartilhar').hidden = false;
      $('f-compartilhar').onclick = async function () {
        if (!dados) return;
        this.disabled = true;
        try { const b = await imagem(); await navigator.share({ files: [new File([b], nome(), { type: 'image/png' })], text: 'Abertura do mercado | mercadomacro.com.br' }); msg(''); }
        catch (e) { if (e && e.name !== 'AbortError') msg('Não foi possível compartilhar.', true); } finally { this.disabled = false; }
      };
    }
    $('f-telegram').onclick = async function () {
      if (!dados) return;
      this.disabled = true; msg('Mandando no Telegram…');
      try {
        const fd = new FormData();
        fd.append('foto', await imagem(), nome());
        fd.append('legenda', dados.legenda || '');
        const r = await fetch('/api/admin/fechamento-foto', { method: 'POST', credentials: 'same-origin', body: fd });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.erro || 'O Telegram não recebeu.');
        msg('Enviado. Confira o Telegram.');
      } catch (e) { msg(e.message, true); } finally { this.disabled = false; }
    };
  }

  if (window.__ABERTURA) { dados = window.__ABERTURA; desenha(dados); document.body.classList.add('robo'); }
  else { liga(); carrega(); }
})();
