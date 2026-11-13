import test from 'node:test';
import assert from 'node:assert/strict';
import { resumoAtraso, arquivarNoticias, noticiasAntigas } from '../src/noticias-arquivo.js';

// banco falso: guarda o que entra por INSERT OR IGNORE e responde ao SELECT do arquivo
function banco() {
  const linhas = new Map();
  const st = (sql) => ({
    sql,
    bind: (...a) => ({ sql, a, run: async () => ({}), all: async () => sel(sql, a), first: async () => ({ n: linhas.size }) }),
    run: async () => ({}),
  });
  function sel(sql, a) {
    const [ate, de, ...resto] = a, lim = resto.pop();
    let l = [...linhas.values()].filter((x) => x.data < ate && x.data >= de);
    if (resto.length) l = l.filter((x) => resto.includes(x.fonte));
    return { results: l.sort((x, y) => y.data - x.data).slice(0, lim) };
  }
  return {
    linhas, prepare: st,
    batch: async (xs) => { for (const x of xs) { const [link, titulo, fonte, data, dia, resumo, visto, via, nivel, tags, veiculo] = x.a; if (!linhas.has(link)) linhas.set(link, { link, titulo, fonte, data, dia, resumo, visto, via, nivel, tags, veiculo }); } },
  };
}

test('arquivo: a primeira vez que o site viu fica guardada; velhas de mais de 7 dias não entram', async () => {
  const DB = banco(), agora = Date.UTC(2026, 10, 13, 12);
  const n = (i, h) => ({ link: 'https://x.com/' + i, titulo: 'Manchete ' + i, fonte: i % 2 ? 'Reuters' : 'Valor Econômico', data: agora - h * 3600000, nivel: 'ALTO', tags: ['EUA'] });
  await arquivarNoticias({ DB }, [n(1, 1), n(2, 30), n(3, 200)], 'ao_vivo', agora);
  await arquivarNoticias({ DB }, [n(1, 1)], 'lista', agora + 600000);
  assert.equal(DB.linhas.size, 2);
  assert.equal(DB.linhas.get('https://x.com/1').visto, agora);
  assert.equal(DB.linhas.get('https://x.com/1').via, 'ao_vivo');
  assert.equal(DB.linhas.get('https://x.com/1').tags, 'EUA');
  const r = await noticiasAntigas({ DB }, { antes: agora - 2 * 3600000, agora });
  assert.deepEqual(r.itens.map((x) => x.link), ['https://x.com/2']);
  assert.deepEqual(r.itens[0].tags, ['EUA']);
  assert.equal(r.mais, false);
  const s = await noticiasAntigas({ DB }, { agora, fontes: ['Valor Econômico'] });
  assert.deepEqual(s.itens.map((x) => x.link), ['https://x.com/2']);
  const q = await noticiasAntigas({ DB }, { agora, termo: 'manchete 1' });
  assert.equal(q.itens.length, 2); // "1" tem menos de 3 letras: só "manchete" filtra
});

test('atraso: mediana e 90% por fonte, ignora negativos e absurdos', () => {
  const l = [];
  for (let i = 1; i <= 10; i++) l.push({ fonte: 'Reuters', data: 0, visto: i * 60000 });
  l.push({ fonte: 'Reuters', data: 100, visto: 0 }, { fonte: 'Reuters', data: 0, visto: 13 * 3600000 }, { fonte: 'FJ', data: 0, visto: 5000 });
  const r = resumoAtraso(l);
  assert.deepEqual(r.map((x) => x.fonte), ['FJ', 'Reuters']);
  const re = r[1];
  assert.equal(re.n, 10);
  assert.equal(re.mediana, 6 * 60000);
  assert.equal(re.p90, 10 * 60000);
  assert.equal(re.ate2min, 0.2);
});
