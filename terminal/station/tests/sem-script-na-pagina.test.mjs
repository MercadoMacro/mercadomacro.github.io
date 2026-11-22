// Regra de scripts (CSP), etapa 2 (22/11/2026): nenhuma página leva script escrito dentro do HTML nem ação em
// atributo (onclick, onload...). A regra vai bloquear isso; script novo vai em arquivo próprio.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const raiz = new URL('../', import.meta.url);
const ler = (p) => readFileSync(new URL(p, raiz), 'utf8');
const arquivos = [
  ...readdirSync(new URL('site/', raiz)).filter((f) => f.endsWith('.html')).map((f) => 'site/' + f),
  ...readdirSync(new URL('site/vitrine/', raiz)).filter((f) => f.endsWith('.html')).map((f) => 'site/vitrine/' + f),
  ...readdirSync(new URL('src/', raiz)).filter((f) => f.endsWith('.js')).map((f) => 'src/' + f),
  'site/app.js', 'site/noticias.js',
];
const FORA = new Set(); // exceções, se um dia precisar

test('nenhum <script> com código dentro da página', () => {
  for (const f of arquivos) {
    if (FORA.has(f)) continue;
    const s = ler(f);
    const achados = [...s.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*application\/(ld\+)?json)[^>]*>(?!<\/script>)/g)];
    assert.equal(achados.length, 0, f + ': ' + achados.map((m) => m[0]).join(' '));
  }
});
test('nenhuma ação em atributo (onclick=, onload=, onerror=...) no HTML', () => {
  for (const f of arquivos) {
    if (FORA.has(f)) continue;
    const s = ler(f);
    const achados = s.match(/<[a-z][^>]*\son[a-z]+\s*=\s*["']/gi) || [];
    assert.equal(achados.length, 0, f + ': ' + achados.join(' ').slice(0, 300));
  }
});
