/* Limites nativos da Cloudflare: contadores por IP e por região de borda.
   Não são autenticação, medição financeira nem teto global de consumo. */
const HISTORICOS = new Set(['/history', '/ind/bundle']);
const PREMIUM = new Set(['/finnhub/earnings', '/finnhub/fund', '/finnhub/search', '/td']);
export function grupoConsumo(url) {
  if (PREMIUM.has(url.pathname)) return 'premium';
  if (HISTORICOS.has(url.pathname) || url.searchParams.has('url')) return 'historicos';
  return 'geral';
}
function erro(status, mensagem, cors) {
  return new Response(JSON.stringify({error:mensagem, ...(status === 429 ? {retryAfter:60} : {})}), {
    status, headers:{...cors,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
      ...(status === 429 ? {'Retry-After':'60'} : {})}
  });
}
export async function limitarConsumo(request, env, cors = {}) {
  if (request.method === 'OPTIONS') return null;
  // A Cloudflare injeta o IP. Não confiar em X-Forwarded-For nem em parâmetros do cliente.
  // Chamadas internas/locais sem esse cabeçalho usam um grupo separado.
  const ip = request.headers.get('CF-Connecting-IP') || 'interno-ou-local';
  const key = 'mm-api-v1:' + ip;
  const grupo = grupoConsumo(new URL(request.url));
  const bindings = ['API_RATE_GENERAL'];
  if (grupo === 'historicos') bindings.push('API_RATE_HISTORY');
  if (grupo === 'premium') bindings.push('API_RATE_PREMIUM');
  try {
    for (const name of bindings) {
      const limiter = env[name];
      if (!limiter || typeof limiter.limit !== 'function') throw new Error('Limitador ausente');
      const r = await limiter.limit({key});
      if (!r || typeof r.success !== 'boolean') throw new Error('Resposta inválida do limitador');
      if (!r.success) return erro(429,'Muitas consultas em pouco tempo. Aguarde 60 segundos e tente novamente.',cors);
    }
    return null;
  } catch (_) {
    // Falha fechada: não chamar provedores sem a proteção de consumo configurada.
    // Não registrar IPs, chaves nem outros dados do visitante.
    console.error('Limitador da API indisponível. Consultas às fontes suspensas.');
    return erro(503,'Serviço de dados temporariamente indisponível. Tente novamente em instantes.',cors);
  }
}
