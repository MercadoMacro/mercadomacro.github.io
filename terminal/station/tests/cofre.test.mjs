import test from 'node:test';
import assert from 'node:assert/strict';
import { fechar, abrir, cifrado, cifrarPendentes, SENSIVEIS } from '../src/cofre.js';

// chave-mestra de teste (32 bytes fixos), nunca usada fora daqui
const env = { COFRE_CHAVE: btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i * 7 + 1))) };
const outra = { COFRE_CHAVE: btoa(String.fromCharCode(...new Uint8Array(32).fill(9))) };

test('chave sensível sai cifrada e volta igual', async () => {
  const v = await fechar(env, 'stripe_key', 'rk_teste_123');
  assert.ok(cifrado(v));
  assert.ok(!v.includes('rk_teste_123'));
  assert.equal(await abrir(env, 'stripe_key', v), 'rk_teste_123');
  assert.notEqual(await fechar(env, 'stripe_key', 'rk_teste_123'), v); // cada gravação tem um iv novo
});

test('o que não é chave fica como está', async () => {
  assert.equal(await fechar(env, 'tg_canal', '-100123'), '-100123');
  assert.equal(await fechar(env, 'stripe_key', null), null);
  assert.equal(await abrir(env, 'tg_canal', '-100123'), '-100123');
});

test('texto puro antigo continua valendo', async () => {
  assert.equal(await abrir(env, 'mail_key', 're_antiga'), 're_antiga');
});

test('sem chave-mestra: grava em texto puro e não abre o que está cifrado', async () => {
  assert.equal(await fechar({}, 'gemini_key', 'abc'), 'abc');
  const v = await fechar(env, 'gemini_key', 'abc');
  assert.equal(await abrir({}, 'gemini_key', v), null);
});

test('chave-mestra errada, valor trocado de lugar ou adulterado: não abre', async () => {
  const v = await fechar(env, 'cap_pw', 'senha');
  assert.equal(await abrir(outra, 'cap_pw', v), null);
  assert.equal(await abrir(env, 'cap_key', v), null);
  assert.equal(await abrir(env, 'cap_pw', v.slice(0, -4) + 'AAA='), null);
});

test('cifrarPendentes cifra só as chaves em texto puro', async () => {
  const banco = new Map([['stripe_key', 'rk_puro'], ['tg_canal', '-100'], ['mail_key', await fechar(env, 'mail_key', 're_x')]]);
  const DB = {
    prepare(sql) {
      return {
        bind(...a) {
          return {
            all: async () => ({ results: [...banco].filter(([k, v]) => a.includes(k) && !v.startsWith('cofre1:')).map(([chave, valor]) => ({ chave, valor })) }),
            run: async () => { const [novo, k, velho] = a; if (banco.get(k) === velho) banco.set(k, novo); },
          };
        },
      };
    },
  };
  assert.equal(await cifrarPendentes({ ...env, DB }), 1);
  assert.ok(cifrado(banco.get('stripe_key')));
  assert.equal(await abrir(env, 'stripe_key', banco.get('stripe_key')), 'rk_puro');
  assert.equal(banco.get('tg_canal'), '-100');
  assert.equal(await cifrarPendentes({ ...env, DB }), 0);
  assert.equal(await cifrarPendentes({ DB }), 0); // sem chave-mestra não mexe em nada
  assert.ok(SENSIVEIS.includes('tg_token') && SENSIVEIS.includes('passe_jwk'));
});
