/* Cofre de chaves (12/11/2026). As chaves de serviços (Stripe, Resend, Gemini, Telegram, Capital.com) e as chaves
   privadas do site, guardadas na tabela config do D1, ficam cifradas com AES-GCM. A chave-mestra (COFRE_CHAVE, 32 bytes
   em base64) fica só nos segredos do worker na Cloudflare, criada pelo robô criar-cofre.yml sem ninguém ver o valor:
   quem lê o banco vê apenas "cofre1:...". O /admin continua igual (colar a chave e salvar).
   Valores antigos em texto puro continuam valendo e o agendador os cifra (cifrarPendentes, de hora em hora).
   Sem COFRE_CHAVE (testes locais) tudo segue em texto puro. Perder a COFRE_CHAVE = colar de novo as chaves em /admin. */
export const SENSIVEIS = ['stripe_key', 'stripe_whsec', 'mail_key', 'gemini_key', 'cap_key', 'cap_pw', 'tg_token', 'passe_jwk', 'vapid_jwk'];
const PREFIXO = 'cofre1:';
const txt = new TextEncoder();
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
let cache = { s: null, k: null };

async function chaveMestra(env) {
  const s = env && typeof env.COFRE_CHAVE === 'string' ? env.COFRE_CHAVE.trim() : '';
  if (!s) return null;
  if (cache.s !== s) {
    const raw = deB64(s);
    if (raw.length !== 32) throw new Error('COFRE_CHAVE precisa ter 32 bytes em base64');
    cache = { s, k: await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']) };
  }
  return cache.k;
}

export const sensivel = (k) => SENSIVEIS.includes(k);
export const cifrado = (v) => typeof v === 'string' && v.startsWith(PREFIXO);

// para gravar: cifra só as chaves sensíveis (o nome da chave entra como dado autenticado: não dá para trocar um valor de lugar)
export async function fechar(env, k, v) {
  if (v == null || !sensivel(k) || cifrado(v)) return v;
  const ch = await chaveMestra(env);
  if (!ch) return v;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: txt.encode(k) }, ch, txt.encode(String(v))));
  return PREFIXO + b64(iv) + ':' + b64(ct);
}

// para ler: texto puro passa direto; cifrado sem a chave-mestra (ou adulterado) vira null, como se estivesse desligado
export async function abrir(env, k, v) {
  if (!cifrado(v)) return v;
  try {
    const ch = await chaveMestra(env);
    if (!ch) { console.error('cofre: COFRE_CHAVE ausente; não dá para ler ' + k); return null; }
    const [iv, ct] = v.slice(PREFIXO.length).split(':');
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(iv), additionalData: txt.encode(k) }, ch, deB64(ct)));
  } catch (e) {
    console.error('cofre: não abriu ' + k + ': ' + e.message);
    return null;
  }
}

// cifra o que ainda está em texto puro; só troca se o valor não mudou no meio (não atropela um salvamento do /admin)
export async function cifrarPendentes(env) {
  if (!(await chaveMestra(env))) return 0;
  const r = await env.DB.prepare(`SELECT chave, valor FROM config WHERE chave IN (${SENSIVEIS.map(() => '?').join(', ')}) AND valor NOT LIKE '${PREFIXO}%'`).bind(...SENSIVEIS).all();
  for (const x of r.results) {
    await env.DB.prepare('UPDATE config SET valor = ? WHERE chave = ? AND valor = ?').bind(await fechar(env, x.chave, x.valor), x.chave, x.valor).run();
  }
  if (r.results.length) console.log('cofre: cifradas ' + r.results.map((x) => x.chave).join(', '));
  return r.results.length;
}
