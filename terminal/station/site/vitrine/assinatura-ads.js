// Medição opcional dos acessos vindos da campanha de assinatura.
// 22/11/2026 (pedido do Dante): a tag do Google carrega em toda visita em "modo de consentimento" restrito, SEM cookies
// (ad_storage e ad_user_data negados), para o Google Ads enxergar a tag no site (o erro "Seu site não tem uma tag do
// Google" deixava a campanha como "configuração incorreta"). Cookies e a conversão da assinatura continuam só depois do
// "Permitir" de quem chega pelo anúncio, como antes.
(function () {
  if (location.origin !== 'https://mercadomacro.com.br') return;
  const tag = 'AW-18587395504';
  const destino = tag + '/AyIBCNvuwrwdELDLlJ9F';
  const chave = 'mm-ads-assinatura-v1';
  const agora = Date.now();
  const dias30 = 30 * 86400000;
  let estado;
  try { estado = JSON.parse(localStorage.getItem(chave)) || {}; } catch { return; }
  function salvar() {
    try { localStorage.setItem(chave, JSON.stringify(estado)); } catch {}
  }
  const url = new URL(location.href);
  const volta = url.searchParams.get('volta');
  // O login preserva o endereço de destino dentro de ?volta=.
  const chegada = url.pathname === '/entrar' && volta?.split('?')[0] === '/assinar'
    ? new URL(volta, url.origin) : url;
  const parametros = new URLSearchParams();
  if (chegada.pathname === '/assinar') {
    for (const nome of ['gclid', 'gbraid', 'wbraid']) {
      const valor = chegada.searchParams.get(nome);
      if (valor && /^[A-Za-z0-9_-]{1,512}$/.test(valor)) parametros.set(nome, valor);
    }
  }
  if (!(estado.ate > agora)) estado = {};

  // base da tag, sempre: consentimento negado (sem cookies) e endereço sem parâmetros
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' });
  gtag('js', new Date());
  gtag('config', tag, { page_location: location.origin + location.pathname, page_referrer: '', allow_ad_personalization_signals: false });
  const script = document.createElement('script');
  script.async = true;
  script.referrerPolicy = 'origin';
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + tag;
  let aoCarregar = null;
  script.onload = () => aoCarregar && aoCarregar();
  document.head.append(script);

  if (estado.recusado) return;
  if (!parametros.size && !estado.ate) return;

  function iniciar() {
    const pagina = new URL(location.pathname, location.origin);
    // A tag lê o clique também na página de entrada antes de o cadastro redirecionar.
    for (const [nome, valor] of parametros) {
      pagina.searchParams.set(nome, valor);
      url.searchParams.set(nome, valor);
    }
    if (parametros.size) history.replaceState(history.state, '', url);
    // com o "Permitir": libera os cookies de anúncio (personalização segue negada) e registra a página com o clique
    gtag('consent', 'update', { ad_storage: 'granted', ad_user_data: 'granted' });
    gtag('config', tag, { page_location: pagina.href, page_referrer: '', allow_ad_personalization_signals: false });
    window.mmAdsCheckout = function (sessao) {
      if (!/^cs_live_[A-Za-z0-9]+$/.test(sessao)) return;
      estado.sessao = sessao;
      salvar();
    };
    async function conferir(tentativa) {
      if (!estado.sessao || location.pathname !== '/assinar') return;
      const sessao = estado.sessao;
      function concluir() {
        try {
          const atual = JSON.parse(localStorage.getItem(chave));
          if (atual?.sessao === sessao) {
            delete atual.sessao;
            localStorage.setItem(chave, JSON.stringify(atual));
          }
        } catch {}
      }
      try {
        const res = await fetch('/api/assinatura/recibo-ads', {
          method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessao })
        });
        if (res.ok) {
          const dados = await res.json();
          if (dados.recibo) {
            gtag('event', 'conversion', { ...dados.recibo, send_to: destino, event_callback: concluir });
            return;
          }
          if (!dados.pendente) { concluir(); return; }
        }
      } catch {}
      if (tentativa < 4) setTimeout(() => conferir(tentativa + 1), 2500 * (tentativa + 1));
    }
    aoCarregar = () => conferir(0);
    if (window.google_tag_manager) conferir(0);
  }
  if (estado.ate) { iniciar(); return; }
  const aviso = document.createElement('aside');
  aviso.setAttribute('aria-label', 'Medição de anúncios');
  aviso.textContent = 'Permite usar cookies do Google Ads para associar este anúncio à sua primeira assinatura paga? O Google receberá o valor e o identificador da fatura. ';
  for (const [texto, permitir] of [['Permitir', true], ['Agora não', false]]) {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.textContent = texto;
    botao.onclick = () => {
      estado = { ate: agora + dias30, recusado: !permitir };
      salvar();
      aviso.remove();
      if (permitir) iniciar();
    };
    aviso.append(botao);
  }
  document.body.prepend(aviso);
})();
