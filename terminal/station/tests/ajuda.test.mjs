import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function base() {
  const contexto = { window: {} };
  vm.runInNewContext(readFileSync(new URL('../site/vitrine/ajuda-conteudo.js', import.meta.url), 'utf8'), contexto);
  return contexto.window.MMAjudaConteudo;
}

test('ajuda encontra dúvidas por código do ativo, sinônimo e acentos', () => {
  const b = base();
  for (const [consulta, id] of [['adicionar PETR4', 'watchlist'], ['inflação', 'ipca'], ['esqueci minha senha', 'conta'], ['juros compostos', 'juros-compostos'], ['aposentadoria', 'aposentadoria'], ['probabilidade Fed', 'fed']]) {
    assert.equal(b.buscar(consulta)[0]?.id, id, consulta);
  }
});

test('dúvida desconhecida ou vazia não recebe resposta inventada', () => {
  const b = base();
  for (const consulta of ['', 'como eu', 'receita de bolo chocolate', 'senha receita chocolate bolo', '<img src=x onerror=alert(1)>']) {
    assert.equal(b.buscar(consulta).length, 0, consulta);
  }
});

test('catálogo tem identificadores únicos, respostas e destinos locais conhecidos', () => {
  const b = base();
  assert.equal(new Set(b.perguntas.map(p => p.id)).size, b.perguntas.length);
  const paginas = new Set(['/', '/entrar', '/assinar', '/indicadores-hoje', '/calculadora-renda-fixa', '/calculadora-juros-compostos', '/calculadora-aposentadoria', 'mailto:contato@mercadomacro.com.br']);
  const html = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
  for (const p of b.perguntas) {
    assert.ok(p.resposta.length && p.resposta.every(t => typeof t === 'string' && t.length > 20), p.id);
    if (p.acao?.publico) assert.ok(paginas.has(p.acao.publico), p.id);
    if (p.acao?.aba) assert.ok(html.includes('data-tab="' + p.acao.aba + '"'), p.id);
  }
});

test('no terminal, a base pronta é usada pelo Assistente (sem um segundo botão de ajuda)', () => {
  const html = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('/vitrine/ajuda-conteudo.js?v=1') > -1 && html.indexOf('/vitrine/ajuda-conteudo.js?v=1') < html.indexOf('assistente.js'));
  assert.ok(!html.includes('/vitrine/ajuda.js'));
});

test('widget está integrado às ferramentas públicas sem chave de API', () => {
  for (const nome of ['vitrine/index.html', 'vitrine/calculadora.html', 'vitrine/juros-compostos.html', 'vitrine/aposentadoria.html', 'vitrine/indicadores.html']) {
    const html = readFileSync(new URL('../site/' + nome, import.meta.url), 'utf8');
    assert.ok(html.includes('/vitrine/ajuda.css?v=1'), nome);
    assert.ok(html.indexOf('/vitrine/ajuda-conteudo.js?v=1') < html.indexOf('/vitrine/ajuda.js?v=1'), nome);
  }
  const js = readFileSync(new URL('../site/vitrine/ajuda.js', import.meta.url), 'utf8');
  // Consultas e transcrição devem permanecer locais, sem endpoints ou HTML vindo do usuário.
  assert.doesNotMatch(js, /\b(fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|innerHTML|insertAdjacentHTML)\b/);
});
