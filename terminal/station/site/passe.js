/* =========================================================
   PASSE DO SERVIDOR DE DADOS (26/10/2026)
   Quem está logado recebe do servidor do site um passe assinado que vale 10 minutos (/api/passe).
   Todo pedido do site ao servidor de dados (shrill-meadow-89c1) leva esse passe no parâmetro mmp;
   o passe se renova sozinho 2 minutos antes de vencer. Carregado antes do app.js.
   Sem passe (falha no servidor do site), o pedido sai assim mesmo: o servidor de dados decide.
   ========================================================= */
(() => {
  if (window.MMPasse) return;
  const DADOS = 'https://shrill-meadow-89c1.danilo-nillo.workers.dev';
  let passe = null, exp = 0, pedindo = null, timer = null;
  const valido = () => passe && Date.now() < exp * 1000 - 60000;
  async function buscar() {
    try {
      const r = await fetch('/api/passe', { credentials: 'same-origin', cache: 'no-store' });
      if (!r.ok) { caiu(r); return null; }
      const j = await r.json();
      if (!j || typeof j.passe !== 'string' || !j.exp) return null;
      passe = j.passe; exp = j.exp;
      clearTimeout(timer);
      timer = setTimeout(() => { garantir(true); }, Math.max(30000, exp * 1000 - Date.now() - 120000));
      return passe;
    } catch (e) {
      return null;
    }
  }
  function garantir(forcar) {
    if (!forcar && valido()) return Promise.resolve(passe);
    return (pedindo ||= buscar().finally(() => { pedindo = null; }));
  }
  // o primeiro pedido espera o passe no máximo 3 s
  const esperar = () => Promise.race([garantir(), new Promise((r) => setTimeout(r, 3000))]).catch(() => null);
  const urlDe = (input) => (typeof input === 'string' ? input : input instanceof URL ? input.href : input && input.url) || '';
  const original = window.fetch.bind(window);
  // a conta entrou em um 3º aparelho e esta sessão foi encerrada (30/10/2026): vai para o login com o aviso
  function caiu(r) {
    if (r && r.status === 401 && r.headers.get('X-MM-Sessao') === 'aparelho' && !caiu.foi) { caiu.foi = true; location.replace('/entrar?aparelho=1'); }
    return r;
  }
  window.fetch = function (input, init) {
    const url = urlDe(input);
    if (!url.startsWith(DADOS)) return original(input, init).then(caiu);
    const comPasse = () => {
      if (!valido()) return original(input, init);
      const u = new URL(url);
      u.searchParams.set('mmp', passe);
      return original(typeof input === 'string' || input instanceof URL ? u.href : new Request(u.href, input), init);
    };
    // recusado por falta de passe (aba parada, passe demorou): renova e tenta de novo uma vez
    return esperar().then(comPasse).then((r) => (r.status === 401 ? garantir(true).then(() => (valido() ? comPasse() : r)) : r));
  };
  // aba de volta depois de muito tempo parada: renova antes do próximo pedido
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !valido()) garantir(true); });
  window.MMPasse = { garantir };
  garantir();
})();
