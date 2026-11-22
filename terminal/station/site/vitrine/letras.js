// Letras e ícones das páginas públicas carregam sem travar a página (22/11/2026): os <link media="print" data-mm-letra>
// passam a valer na tela quando chegam. Antes era um onload="this.media='all'" no próprio link, que a regra de
// scripts (CSP) bloqueia. Sem este arquivo, a página continua funcionando com a letra do sistema.
document.querySelectorAll('link[data-mm-letra]').forEach((l) => {
  const liga = () => { l.media = 'all'; };
  if (l.sheet) liga(); else l.addEventListener('load', liga);
});
