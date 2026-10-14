/* Fechamento do mercado em imagem (página /fechamento, só administrador).
   Os números vêm de /api/admin/fechamento (worker). O robô resumo.yml abre esta mesma página
   com window.__FECHAMENTO já preenchido e fotografa o cartão para o Telegram das 18h.
   Regra do painel: nada inventado; o que faltar aparece como "—". */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const ok = (v) => typeof v === 'number' && isFinite(v);
  const br = (v, c) => v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tom = (x) => (!ok(x) ? '' : x > 0.005 ? 'up' : x < -0.005 ? 'dn' : 'zero');
  const pct = (x) => (!ok(x) ? '—' : (x > 0.005 ? '+' : x < -0.005 ? '−' : '') + br(Math.abs(x), 2) + '%');
  const bi = (mil) => (!ok(mil) ? '—' : (mil > 0 ? '+' : mil < 0 ? '−' : '') + 'R$ ' + br(Math.abs(mil) / 1e6, 2) + ' bi');
  const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const ddmm = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
  let dados = null;

  const FMT = {
    ibov: (v) => br(v, 0), dolar: (v) => 'R$ ' + br(v, 4), sp: (v) => br(v, 0), nasdaq: (v) => br(v, 0), dow: (v) => br(v, 0),
    brent: (v) => 'US$ ' + br(v, 2), ouro: (v) => 'US$ ' + br(v, 0), btc: (v) => 'US$ ' + br(v, 0),
  };

  function desenha(d) {
    const dt = new Date(d.data + 'T12:00:00Z');
    const c = d.cards;
    const cards = Object.keys(FMT).map((k) => {
      const x = c[k] || {};
      return `<div class="cd ${tom(x.ch)}"><span>${esc(x.nome || k)}</span><div><b>${ok(x.v) ? FMT[k](x.v) : '—'}</b><i>${pct(x.ch)}</i></div></div>`;
    }).join('');
    const lista = (arr, cl) => (arr && arr.length
      ? `<ul class="lista">${arr.slice(0, 5).map((a) => `<li><span>${esc(a.t)}</span><i class="${cl}">${pct(a.ch)}</i></li>`).join('')}</ul>`
      : '<p class="vazio">—</p>');
    const j = d.juros || {};
    const f = d.fluxo;
    $('card').innerHTML = `
      <div class="cab">
        <div class="cab-l"><img src="/logo-mercado-macro.png" alt="Mercado Macro" crossorigin="anonymous">
          <div class="cab-d"><span>${DIAS[dt.getUTCDay()]}</span><b>${dt.getUTCDate()} ${MESES[dt.getUTCMonth()].toUpperCase()}</b></div></div>
        <h1>Fechamento <em>do mercado</em></h1>
        <small>Brasil e mundo · ${dt.getUTCFullYear()}</small>
      </div>
      ${!d.pregao ? `<div class="aviso">Sem pregão na B3 hoje. Números do último pregão${d.pregaoDia ? ' (' + ddmm(d.pregaoDia) + ')' : ''}.</div>` : ''}
      <div class="grade">${cards}</div>
      <div class="bloco dest"><h2>Destaques do dia</h2><p>${esc(d.destaques || '—')}</p></div>
      <div class="duas">
        <div class="bloco"><h2 class="h-up">Maiores altas</h2>${lista(d.altas, 'up')}</div>
        <div class="bloco"><h2 class="h-dn">Maiores baixas</h2>${lista(d.baixas, 'dn')}</div>
      </div>
      <div class="duas">
        <div class="bloco"><h2>Juros</h2><table class="tab">
          <tr><td>Selic</td><td>${ok(j.selic) ? br(j.selic, 2) + '%' : '—'}</td></tr>
          <tr><td>${esc(j.pre ? j.pre.nome.replace(/^Tesouro /, '') : 'Prefixado')}</td><td>${j.pre ? br(j.pre.taxa, 2) + '%' : '—'}</td></tr>
          <tr><td>${esc(j.ipca ? j.ipca.nome.replace(/^Tesouro /, '') : 'IPCA+')}</td><td>${j.ipca ? 'IPCA+' + br(j.ipca.taxa, 2) + '%' : '—'}</td></tr>
          <tr><td>Treasury 10 anos</td><td>${ok(c.tnx && c.tnx.v) ? br(c.tnx.v, 2) + '%' : '—'}</td></tr></table></div>
        <div class="bloco"><h2>Estrangeiro na B3</h2><table class="tab">
          <tr><td>${f ? 'Dia ' + ddmm(f.data) : 'No dia'}</td><td class="${f && ok(f.dia) ? (f.dia >= 0 ? 'h-up' : 'h-dn') : ''}">${f ? bi(f.dia) : '—'}</td></tr>
          <tr><td>No mês</td><td>${f ? bi(f.mes) : '—'}</td></tr>
          <tr><td>No ano</td><td>${f ? bi(f.ano) : '—'}</td></tr>
          <tr><td colspan="2" style="text-align:left;font:400 10px Inter,sans-serif;color:#8591a8">A B3 divulga com cerca de 2 pregões de atraso</td></tr></table></div>
      </div>
      <div class="rod"><b>mercadomacro.com.br</b><span>Altas e baixas entre as 45 maiores ações do Ibovespa.<br>Fontes: Yahoo Finance, Banco Central, Tesouro Direto e B3.</span></div>`;
  }

  async function carrega() {
    msg('Buscando os números…');
    $('f-atualizar').disabled = true;
    try {
      const r = await fetch('/api/admin/fechamento', { credentials: 'same-origin', cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erro || 'Não foi possível buscar os números.');
      dados = j; desenha(j); msg('');
    } catch (e) { msg(e.message, true); }
    finally { $('f-atualizar').disabled = false; }
  }
  function msg(t, erro) { const m = $('f-msg'); m.textContent = t || ''; m.className = erro ? 'erro' : ''; }

  async function imagem() {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const cv = await window.html2canvas($('card'), { scale: 2, backgroundColor: '#04070d', useCORS: true, logging: false });
    return new Promise((res) => cv.toBlob(res, 'image/png'));
  }
  const nome = () => 'fechamento-' + (dados ? dados.data : 'mercado') + '.png';

  function liga() {
    $('f-atualizar').onclick = carrega;
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
        try { const b = await imagem(); await navigator.share({ files: [new File([b], nome(), { type: 'image/png' })], text: 'Fechamento do mercado | mercadomacro.com.br' }); msg(''); }
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

  if (window.__FECHAMENTO) { dados = window.__FECHAMENTO; desenha(dados); document.body.classList.add('robo'); }
  else { liga(); carrega(); }
})();
