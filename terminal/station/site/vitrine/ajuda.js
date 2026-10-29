/* Ajuda local: sem API, mensagens remotas ou persistência de conversas. */
(() => {
  'use strict';
  const base = window.MMAjudaConteudo;
  if (!base || document.getElementById('mm-ajuda')) return;
  // Requer dialog nativo para foco contido, Escape e retorno seguro à página.
  if (typeof HTMLDialogElement === 'undefined' || !HTMLDialogElement.prototype.showModal) return;
  const criar = (tag, classe, texto) => {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto) el.textContent = texto;
    return el;
  };
  const botao = (texto, classe) => { const b = criar('button', classe, texto); b.type = 'button'; return b; };
  const gatilho = botao('?  Ajuda', 'mmh-launch');
  gatilho.id = 'mm-ajuda-abrir';
  gatilho.setAttribute('aria-haspopup', 'dialog');
  gatilho.setAttribute('aria-controls', 'mm-ajuda');
  gatilho.setAttribute('aria-expanded', 'false');
  const painel = criar('dialog', 'mmh-panel');
  if (document.getElementById('tabs')) {
    gatilho.classList.add('mmh-terminal');
    painel.classList.add('mmh-terminal');
  }
  painel.id = 'mm-ajuda';
  painel.setAttribute('aria-labelledby', 'mm-ajuda-titulo');
  painel.setAttribute('aria-describedby', 'mm-ajuda-descricao');
  const topo = criar('header', 'mmh-head');
  const nome = criar('div');
  const titulo = criar('h2', '', 'Ajuda Mercado Macro'); titulo.id = 'mm-ajuda-titulo';
  const descricao = criar('p', '', 'Respostas prontas · sem inteligência artificial'); descricao.id = 'mm-ajuda-descricao';
  nome.append(titulo, descricao);
  const fechar = botao('×', 'mmh-close'); fechar.setAttribute('aria-label', 'Fechar ajuda');
  topo.append(nome, fechar);
  const conteudo = criar('div', 'mmh-content');
  const conversa = criar('div', 'mmh-log');
  conversa.setAttribute('role', 'log');
  conversa.setAttribute('aria-live', 'polite');
  conversa.setAttribute('aria-label', 'Perguntas e respostas desta visita');
  conversa.setAttribute('aria-relevant', 'additions');
  const grupos = criar('div', 'mmh-groups');
  grupos.setAttribute('role', 'group'); grupos.setAttribute('aria-label', 'Assuntos da ajuda');
  const perguntas = criar('div', 'mmh-questions');
  const status = criar('p', 'mmh-status'); status.setAttribute('role', 'status');
  const form = criar('form', 'mmh-form');
  const label = criar('label', 'mmh-sr', 'Busque uma dúvida'); label.htmlFor = 'mm-ajuda-busca';
  const entrada = criar('input');
  entrada.id = 'mm-ajuda-busca'; entrada.type = 'search'; entrada.maxLength = 200;
  entrada.placeholder = 'Ex.: CDI, adicionar ativo, senha…'; entrada.autocomplete = 'off';
  const enviar = criar('button', '', 'Buscar'); enviar.type = 'submit';
  form.append(label, entrada, enviar);
  const rodape = criar('footer', 'mmh-foot');
  const voltar = botao('Voltar às perguntas', 'mmh-reset');
  const aviso = criar('p', '', 'Não envie senhas. Esta ajuda não envia suas perguntas ao suporte.');
  rodape.append(voltar, aviso);
  conteudo.append(conversa, grupos, perguntas, status);
  painel.append(topo, conteudo, form, rodape);
  document.body.append(gatilho, painel);
  let focoAnterior = null, timer = null;
  let categoria = 'Começar';
  const botoesGrupo = new Map();
  function opcoes(lista) {
    perguntas.replaceChildren();
    for (const item of lista) {
      const b = botao(item.pergunta, 'mmh-question');
      b.addEventListener('click', () => responder(item));
      perguntas.append(b);
    }
  }
  function atualizarGrupos() {
    for (const [nomeGrupo, b] of botoesGrupo) b.setAttribute('aria-pressed', String(nomeGrupo === categoria));
  }
  function inicio() {
    clearTimeout(timer); entrada.value = ''; categoria = 'Começar';
    conversa.replaceChildren();
    conversa.append(criar('p', 'mmh-bubble', 'Olá! Escolha uma pergunta ou busque um assunto. Posso explicar as ferramentas e ajudar você a encontrar o que precisa.'));
    atualizarGrupos(); opcoes(base.perguntas.filter(p => p.grupo === categoria)); status.textContent = '';
  }
  function linkAcao(acao) {
    if (!acao) return null;
    // Navegação usa as abas originais; fora do terminal, leva à página pública ou à entrada.
    const aba = acao.aba && document.querySelector('.tab-btn[data-tab="' + acao.aba + '"]');
    if (aba) {
      const b = botao(acao.texto, 'mmh-action');
      b.addEventListener('click', () => { painel.close(); aba.click(); });
      return b;
    }
    const destino = acao.publico;
    if (!destino || !/^\/(?!\/)|^mailto:contato@mercadomacro\.com\.br$/.test(destino)) return null;
    const link = criar('a', 'mmh-action', acao.texto);
    link.href = destino;
    return link;
  }
  function responder(item) {
    clearTimeout(timer); entrada.value = ''; status.textContent = '';
    conversa.append(criar('p', 'mmh-bubble mmh-user', item.pergunta));
    const resposta = criar('article', 'mmh-bubble');
    for (const texto of item.resposta) resposta.append(criar('p', '', texto));
    const acao = linkAcao(item.acao); if (acao) resposta.append(acao);
    conversa.append(resposta);
    // Mantém no máximo oito pares, sem guardar a conversa no aparelho.
    while (conversa.childElementCount > 16) conversa.firstElementChild.remove();
    opcoes([]);
    conteudo.scrollTop = conteudo.scrollHeight;
    // O botão de pergunta deixa de existir após a resposta; mantém um foco útil.
    entrada.focus({ preventScroll: true });
  }
  function busca(submeter) {
    clearTimeout(timer);
    const texto = entrada.value.trim();
    if (!texto) { opcoes(base.perguntas.filter(p => p.grupo === categoria)); status.textContent = ''; return; }
    const lista = base.buscar(texto);
    if (submeter && lista.length === 1) { responder(lista[0]); return; }
    opcoes(lista);
    status.textContent = lista.length ? 'Selecione a pergunta que corresponde à sua dúvida.' : 'Não encontrei uma resposta pronta. Tente outro termo ou fale com o suporte.';
    if (!lista.length) {
      const suporte = base.perguntas.find(p => p.id === 'ajuda');
      if (suporte) opcoes([suporte]);
    }
  }
  for (const grupo of [...new Set(base.perguntas.map(p => p.grupo))]) {
    const b = botao(grupo, 'mmh-group');
    botoesGrupo.set(grupo, b);
    b.addEventListener('click', () => {
      clearTimeout(timer); categoria = grupo; entrada.value = '';
      atualizarGrupos(); opcoes(base.perguntas.filter(p => p.grupo === grupo)); status.textContent = '';
    });
    grupos.append(b);
  }
  gatilho.addEventListener('click', () => {
    if (painel.open) return;
    focoAnterior = document.activeElement;
    painel.showModal(); gatilho.setAttribute('aria-expanded', 'true');
    entrada.focus();
  });
  fechar.addEventListener('click', () => painel.close());
  painel.addEventListener('close', () => {
    clearTimeout(timer); gatilho.setAttribute('aria-expanded', 'false');
    if (focoAnterior && focoAnterior.isConnected) focoAnterior.focus({ preventScroll: true });
  });
  painel.addEventListener('click', e => {
    if (e.target !== painel) return;
    const r = painel.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) painel.close();
  });
  form.addEventListener('submit', e => { e.preventDefault(); busca(true); });
  entrada.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => busca(false), 120); });
  voltar.addEventListener('click', () => { inicio(); entrada.focus(); });
  inicio();
})();
