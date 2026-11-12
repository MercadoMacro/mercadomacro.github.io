// Gera aulas.json (uma aula por item) a partir de station/site/educacao-conteudo.js, para a busca da Jade.
// Roda no robô publicar-busca.yml antes de publicar; o arquivo gerado não fica no repositório.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const fonte = readFileSync(new URL('../station/site/educacao-conteudo.js', import.meta.url), 'utf8');
const ctx = { window: {} };
vm.runInNewContext(fonte, ctx, { timeout: 5000 });
const { trilhas } = ctx.window.MMEduConteudo || {};
if (!Array.isArray(trilhas) || !trilhas.length) throw new Error('educacao-conteudo.js sem trilhas');

const aulas = [];
for (const t of trilhas) for (const l of t.licoes || []) {
  const partes = [
    `# ${l.titulo}`,
    `Trilha: ${t.titulo} (${t.nivel || ''}). Aba Educação do Mercado Macro, lição "${l.id}".`,
    l.abertura || '',
    l.texto || '',
    (l.pontos || []).length ? '## Pontos principais\n' + l.pontos.map((p) => '- ' + p).join('\n') : '',
    (l.quiz || []).length ? '## Perguntas de revisão\n' + l.quiz.map((q) => `- ${q.p} Resposta: ${q.o[q.c]}. ${q.e || ''}`).join('\n') : '',
  ].filter(Boolean);
  const texto = partes.join('\n\n');
  aulas.push({ id: t.id + '--' + l.id, titulo: l.titulo, trilha: t.titulo, texto, hash: createHash('sha256').update(texto).digest('hex').slice(0, 12) });
}
writeFileSync(new URL('./aulas.json', import.meta.url), JSON.stringify(aulas));
console.log(aulas.length + ' aulas em aulas.json');
