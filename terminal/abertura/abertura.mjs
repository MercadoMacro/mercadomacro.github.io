// Abertura do mercado no canal público do Telegram (robô .github/workflows/abertura.yml, 9h15 em dia útil).
// Os números vêm do site (/api/robo/abertura, o mesmo de /abertura), autorizados pelo token OIDC que o
// GitHub assina para este robô. No canal vai só o texto (textoCanalAbertura no site).
// Sem canal ligado em /admin, não manda nada.

const SITE = 'https://mercadomacro.com.br';

async function tokenOIDC() {
  const u = process.env.ACTIONS_ID_TOKEN_REQUEST_URL, t = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!u || !t) throw new Error('sem token OIDC (o robô precisa de id-token: write)');
  const r = await fetch(u + '&audience=mercadomacro-vigia', { headers: { Authorization: 'bearer ' + t } });
  return (await r.json()).value;
}
const TOK = await tokenOIDC();

const r = await fetch(SITE + '/api/robo/abertura', { headers: { Authorization: 'Bearer ' + TOK }, signal: AbortSignal.timeout(60000) });
if (!r.ok) throw new Error('abertura: HTTP ' + r.status + ' ' + (await r.text()));
const dados = await r.json();
console.log(dados.textoCanal || dados.texto);
if (!dados.canal) { console.log('\nCanal público não está ligado em /admin. Nada enviado.'); process.exit(0); }

// no canal vai só o texto, no modelo escolhido pelo Severino (as imagens ficam para /abertura)
const envio = await fetch(SITE + '/api/vigia', {
  method: 'POST', headers: { Authorization: 'Bearer ' + TOK, 'Content-Type': 'application/json' },
  body: JSON.stringify(dados.textoCanal ? { texto: dados.textoCanal, html: true, canal: true } : { texto: dados.texto, canal: true }),
});
const resp = await envio.text();
console.log(resp);
if (!envio.ok || !resp.includes('"ok":true')) process.exit(1);
