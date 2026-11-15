// Jade no WhatsApp (worker "mercadomacro-whatsapp", API oficial da Meta / WhatsApp Cloud API).
// Publicado pelo .github/workflows/publicar-whatsapp.yml a cada mudança em terminal/whatsapp/.
// Até 14/11/2026 este código existia só na Cloudflare; a partir daqui o GitHub é a fonte.
// Mudanças de 14/11/2026 (pedido do Dante):
// - limite de mensagens por número (20 por hora): protege o custo da Meta e as consultas ao Yahoo;
// - pedido de atendimento humano (SIM QUERO) avisa a equipe no Telegram, e as mensagens durante a pausa também;
// - preços lidos do site (env.JADE.precos()), sem valores escritos à mão que ficam velhos;
// - o ticker da conversa ("e as notícias?") fica guardado no D1 (o Cache API não funciona em workers.dev).
// Mudanças de 15/11/2026 (pedido do Dante):
// - manchetes em português, do arquivo de notícias do site (env.JADE.noticias()), no lugar do serviço antigo em inglês;
// - botões tocáveis (Ver demo, Planos, Falar com a equipe...): toque no botão chega como o texto equivalente;
// - áudio, foto, vídeo, figurinha e documento recebem uma resposta (antes, silêncio);
// - mensagem que a Jade não entende: na 1ª, "não entendi" com botões; na 2ª seguida, oferece a equipe.
// Ligações: HANDOFF_DB (D1 mercadomacro-atendimento), JADE (station, entrypoint JadeWatchlist) e os segredos
// META_APP_SECRET, WEBHOOK_VERIFY_TOKEN, WHATSAPP_PRODUCTION_ACCESS_TOKEN, WHATSAPP_ACCESS_TOKEN (só no painel).

const PRODUCAO = '1342951915577900';
const TESTE = '1350465961493820';
export const LIMITE_HORA = 20;
// botões (no máximo 3 por mensagem, título de até 20 letras): o toque chega com o id e vira o texto equivalente
export const BOTOES = {
  demo: { titulo: 'Ver demo', texto: 'demo' },
  planos: { titulo: 'Planos e preços', texto: 'quanto custa' },
  humano: { titulo: 'Falar com a equipe', texto: 'sim quero' },
  noticias: { titulo: 'Notícias', texto: 'demo noticias' },
  agenda: { titulo: 'Agenda', texto: 'demo agenda' },
  ativo: { titulo: 'Um ativo', texto: 'demo ativos' },
  teste: { titulo: 'Testar grátis', texto: 'teste gratis' },
  pix: { titulo: 'Pagar no Pix', texto: 'pix' },
  anual: { titulo: 'Menor custo mensal', texto: 'menor custo mensal' },
};
const MIDIAS = new Set(['audio', 'image', 'video', 'sticker', 'document']);
const NOME_MIDIA = { audio: 'áudio', image: 'foto', video: 'vídeo', sticker: 'figurinha', document: 'documento' };
const BOAS_VINDAS = 'Olá! Sou a Jade, assistente virtual do Mercado Macro. 😊\n\nPosso mostrar como funciona o terminal, consultar ativos e ajudar você a escolher um plano.\n\nPor onde quer começar?';
const textoDe = (r) => (r && typeof r === 'object' ? r.texto : r) || '';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname !== "/webhook") {
      return new Response("Not found", { status: 404 });
    }

    if (request.method === "GET") {
      const params = url.searchParams;
      const challenge = params.get("hub.challenge");

      if (
        env.WEBHOOK_VERIFY_TOKEN &&
        params.get("hub.mode") === "subscribe" &&
        params.get("hub.verify_token") === env.WEBHOOK_VERIFY_TOKEN &&
        challenge !== null
      ) {
        return new Response(challenge);
      }

      return new Response("Forbidden", { status: 403 });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    if (!env.META_APP_SECRET) {
      return new Response("Missing app secret", { status: 503 });
    }

    const signature = request.headers.get("X-Hub-Signature-256") ?? "";
    const hex = /^sha256=([a-f0-9]{64})$/i.exec(signature)?.[1];

    if (!hex) {
      return new Response("Invalid signature", { status: 401 });
    }

    const body = await request.arrayBuffer();
    const signatureBytes = Uint8Array.from(
      hex.match(/../g),
      pair => parseInt(pair, 16)
    );
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(env.META_APP_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    if (!(await crypto.subtle.verify("HMAC", key, signatureBytes, body))) {
      return new Response("Invalid signature", { status: 401 });
    }

    let event;
    try {
      event = JSON.parse(new TextDecoder().decode(body));
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    for (const entry of event?.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const status of change.value?.statuses ?? []) {
          console.log(JSON.stringify({
            id: status.id,
            status: status.status,
            errors: (status.errors ?? []).map(error => ({
              code: error.code,
              title: error.title
            }))
          }));
        }
      }
    }

    for (const entry of event?.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        const phoneId = value?.metadata?.phone_number_id;
        if (change.field !== 'messages') continue;
        const accessToken = phoneId === PRODUCAO
          ? env.WHATSAPP_PRODUCTION_ACCESS_TOKEN
          : phoneId === TESTE ? env.WHATSAPP_ACCESS_TOKEN : undefined;
        if (!accessToken) continue;

        for (const message of value.messages ?? []) {
          if (!/^\d{8,15}$/.test(message.from ?? '')) continue;
          // toque num botão ou numa lista: vira o texto que a pessoa teria escrito
          const toque = message.type === 'interactive' ? (message.interactive?.button_reply?.id || message.interactive?.list_reply?.id || '') : message.type === 'button' ? (message.button?.payload || message.button?.text || '') : '';
          const midia = MIDIAS.has(message.type);
          if (message.type !== 'text' && !toque && !midia) continue; // reação, aviso do sistema etc.
          const original = midia ? '' : (BOTOES[toque]?.texto ?? (message.text?.body ?? toque)).trim();
          const text = original.normalize('NFD')
            .replace(/[̀-ͯ]/g, '').toLowerCase();
          if ((!text && !midia) || text === 'sair') continue;

          const key = await hashHex(phoneId + ':' + message.from);
          const db = env.HANDOFF_DB;

          // limite por número: a 21ª mensagem da hora recebe um aviso; dali em diante, silêncio até a próxima hora
          const limite = await contarMensagem(db, key).catch(error => { console.warn('Jade: limite indisponível', error.name, error.message); return 1; });
          if (limite > LIMITE_HORA + 1) continue;
          if (limite === LIMITE_HORA + 1) {
            await enviar(phoneId, accessToken, message.from, 'Você enviou muitas mensagens em pouco tempo. Aguarde um pouco e tente de novo. Para falar com a equipe, escreva para contato@mercadomacro.com.br.');
            continue;
          }

          if (midia) {
            // durante o atendimento humano, a equipe fica sabendo; fora dele, a Jade explica que lê só texto
            let pausada = false;
            try { pausada = !!(await db.prepare('SELECT 1 AS p FROM jade_handoff WHERE conversation_key = ? AND expires_at > ?').bind(key, Date.now()).first()); } catch (error) { /* segue */ }
            if (pausada) { await avisarEquipe(env, 'mensagem', phoneId, message.from, '[' + (NOME_MIDIA[message.type] || 'arquivo') + ']'); continue; }
            await enviar(phoneId, accessToken, message.from, { texto: 'Ainda não consigo ' + (message.type === 'audio' ? 'ouvir áudios' : 'abrir ' + (NOME_MIDIA[message.type] || 'arquivos') + 's') + ' 🙂 Me escreva, por exemplo: *PETR4*, *notícias* ou *planos*. Ou toque numa opção:', botoes: ['demo', 'planos', 'humano'] });
            continue;
          }

          // quem veio do canal Radar (link do post abre o WhatsApp com "Vim do Radar")
          const vimDoRadar = /\b(vim|venho|cheguei|vindo)\b.{0,12}\bradar\b/.test(text);
          let origem = null;
          try {
            await prepararTabelas(db);
            if (vimDoRadar) {
              await db.prepare('INSERT INTO jade_origem (conversation_key, origem, expires_at) VALUES (?, ?, ?) ON CONFLICT(conversation_key) DO UPDATE SET origem = excluded.origem, expires_at = excluded.expires_at').bind(key, 'radar', Date.now() + 30 * 86400000).run();
              origem = 'radar';
            } else {
              origem = (await db.prepare('SELECT origem FROM jade_origem WHERE conversation_key = ? AND expires_at > ?').bind(key, Date.now()).first())?.origem || null;
            }
          } catch (error) { console.warn('Jade: origem indisponível', error.name); }

          const help = 'Para atendimento comercial nesta conversa, digite *SIM QUERO*. Para suporte técnico ou cobrança, escreva para contato@mercadomacro.com.br.';
          const wantsHuman = /^(?:sim[ ,]+quero)[.!?\s]*$/.test(text) || /\b(?:atendimento comercial|falar com (?:um consultor|uma pessoa|alguem|o atendente))\b/.test(text);
          // aceita "voltar", "volte" ou "volta" (sozinhos ou com "para a Jade"/"pra Jade"), "jade" ou "menu" (14/11/2026)
          const wantsJade = /^(?:(?:voltar|volte|volta)(?:\s+(?:para|pra)\s+(?:a\s+)?jade)?|jade|menu)[.!?\s]*$/.test(text);
          let reply = null, naoEntendeu = false;
          try {
            const now = Date.now();
            if (vimDoRadar && !wantsHuman) {
              // "Vim do Radar" é um começo de conversa: tira a pausa do atendimento e a Jade dá as boas-vindas
              await db.prepare('DELETE FROM jade_handoff WHERE conversation_key = ?').bind(key).run();
            } else if (wantsJade) {
              await db.prepare('DELETE FROM jade_handoff WHERE conversation_key = ?').bind(key).run();
              reply = { texto: 'Voltei! Sou a Jade. Posso ajudar com ativos, notícias, agenda econômica ou planos.', botoes: ['demo', 'noticias', 'planos'] };
            } else if (wantsHuman) {
              const result = await db.prepare('INSERT INTO jade_handoff (conversation_key, expires_at) VALUES (?, ?) ON CONFLICT(conversation_key) DO UPDATE SET expires_at = excluded.expires_at WHERE jade_handoff.expires_at <= ?').bind(key, now + 86400000, now).run();
              if (!result.meta.changes) {
                // já estava com a equipe: repassa a mensagem e não responde
                await avisarEquipe(env, 'mensagem', phoneId, message.from, original);
                continue;
              }
              await avisarEquipe(env, 'pedido', phoneId, message.from, original + (origem === 'radar' ? ' (veio do Radar)' : ''));
              if (origem) await funil(env, phoneId, origem, 'atendimento');
              reply = 'Claro! Nossa equipe comercial pode continuar por aqui. Me diga em uma frase o que você quer saber sobre o terminal ou os planos. Se quiser voltar ao atendimento automático, digite *VOLTAR PARA A JADE*.';
            } else {
              const paused = await db.prepare('SELECT 1 AS paused FROM jade_handoff WHERE conversation_key = ? AND expires_at > ?').bind(key, now).first();
              if (paused) {
                // a Jade fica quieta, mas a equipe fica sabendo do que a pessoa escreveu
                await avisarEquipe(env, 'mensagem', phoneId, message.from, original);
                continue;
              }
            }
          } catch (error) {
            console.warn('Jade: estado do atendimento indisponível', error.name);
            if (wantsHuman || wantsJade) reply = 'Não consegui mudar o modo de atendimento agora. Para falar com a equipe, escreva para contato@mercadomacro.com.br.';
          }
          if (reply === null && vimDoRadar && !wantsHuman) {
            await funil(env, phoneId, 'radar', 'inicio');
            reply = { texto: 'Que bom que você veio do *Radar*! 👋 Sou a Jade, assistente do Mercado Macro.\n\nPor onde quer começar?\n• *Ver demo*: notícias, agenda ou um ativo, como BBAS3\n• *Planos*: valores e o teste de 48 horas grátis\n• *Falar com a equipe*: um consultor responde por aqui', botoes: ['demo', 'planos', 'humano'] };
          }
          if (reply === null && phoneId === PRODUCAO) {
            reply = await jadeWatchlistCommand(text, message.from, env);
          }
          // insiders (CVM 44): "os diretores da Vale compraram ações esse ano?", "insiders PETR4"
          if (reply === null && ehInsiders(text)) {
            reply = await jadeInsiders(env, original);
          }
          if (reply === null) {
            if (/\b(humano|atendente|suporte|cobranca|problema|erro|nao consigo)\b/.test(text)) {
              reply = help;
          } else if (/\b(senha|login|acesso|cadastro|entrar|conta)\b/.test(text)) {
            reply = 'Para acessar o terminal, abra https://mercadomacro.com.br/ e entre com seu e-mail cadastrado. Se esqueceu a senha, use a opção Esqueci minha senha na tela de login. Se precisar de ajuda com sua conta, ' + help.charAt(0).toLowerCase() + help.slice(1);
          } else if ((reply = await jadeSalesReply(text, env, origem)) !== null) {
            // Commercial questions are handled before general market queries.
            // primeira vez que quem veio do Radar recebe o link dos planos ou da assinatura
            if (origem && /mercadomacro\.com\.br\/(planos|assinar)/.test(textoDe(reply))) {
              const r = await db.prepare('UPDATE jade_origem SET planos = 1 WHERE conversation_key = ? AND planos = 0').bind(key).run().catch(() => null);
              if (r?.meta?.changes) await funil(env, phoneId, origem, 'planos');
            }
          } else if ((reply = await jadeAssetCommand(text, key, db, env)) !== null) {
            // A specific asset takes precedence over general market queries.
          } else if (jadeAsset(text)) {
            reply = await jadeMarketReply(jadeAsset(text), env);
          } else if (/\b(radar|noticias?|manchetes?|resumo)\b/.test(text)) {
            reply = 'O feed está demorando para responder. Você pode acompanhar as manchetes em https://mercadomacro.com.br/';
            const items = await noticiasPt(env);
            // as de maior impacto das últimas 6 horas; sem elas, as mais recentes
            const peso = { CRITICO: 3, ALTO: 2, MEDIO: 1 };
            const seis = Date.now() - 6 * 3600000;
            const ordem = items.slice().sort((a, b) => ((b.data >= seis ? peso[b.nivel] || 0 : 0) - (a.data >= seis ? peso[a.nivel] || 0 : 0)) || b.data - a.data);
            const seen = new Set();
            const headlines = [];
            for (const item of ordem) {
              const title = typeof item?.titulo === 'string' ? item.titulo.trim() : '';
              const link = typeof item?.link === 'string' ? item.link.trim() : '';
              const chave = title.toLowerCase().slice(0, 50);
              if (!title || !/^https?:\/\//i.test(link) || link.length > 350 || seen.has(link) || seen.has(chave)) continue;
              seen.add(link); seen.add(chave);
              const source = typeof item.fonte === 'string' ? item.fonte.trim().slice(0, 80) : '';
              headlines.push('• ' + title.slice(0, 250) + (source ? ' (' + source + ')' : '') + '\n' + link);
              if (headlines.length === 3) break;
            }
            if (headlines.length) {
              reply = 'Principais manchetes | Mercado Macro\n\n' + headlines.join('\n\n') + '\n\nMais notícias, ao vivo e traduzidas, no terminal: https://mercadomacro.com.br/';
              if (/^(?:demo noticias|noticias|quero (?:ver|entender) (?:as )?noticias)[?.!]*$/.test(text)) {
                const sample = headlines.join(' ').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
                const focus = /\b(fed|copom|banco central|selic|juros)\b/.test(sample)
                  ? 'Se o tema for juros, vale acompanhar a próxima decisão e como as expectativas mudam.'
                  : /\b(inflacao|ipca|cpi|ppi)\b/.test(sample)
                    ? 'Em dados de inflação, compare o número divulgado com a expectativa do mercado.'
                    : 'Confira a fonte e o horário de cada manchete. Se uma notícia citar um ativo da sua lista, envie o ticker para consultar sua variação.';
                reply = { texto: reply + '\n\n*O que acompanhar*\n' + focus + '\n\nSe ainda não assinou, você pode experimentar a aba Notícias por 48 horas grátis.', botoes: ['teste', 'planos', 'demo'] };
              }
            }
          } else if (/\b(terminal|site|plataforma|o que (e|tem))\b/.test(text)) {
            reply = 'No terminal do Mercado Macro você pode acompanhar notícias, cotações e indicadores econômicos. Acesse https://mercadomacro.com.br/. Também posso ajudar com acesso, planos ou manchetes por aqui.';
          } else if (/^(oi|ola|opa|bom dia|boa tarde|boa noite|menu)[!.\s]*$/.test(text)) {
            reply = { texto: BOAS_VINDAS, botoes: ['demo', 'planos', 'humano'] };
          } else if (/^(obrigad[oa]|valeu)[!.\s]*$/.test(text)) {
            reply = 'Por nada! Se precisar, estou por aqui.';
          } else {
            naoEntendeu = true;
            const n = await duvida(db, key, true).catch(() => 1);
            reply = limite === 1 && n === 1
              ? { texto: BOAS_VINDAS, botoes: ['demo', 'planos', 'humano'] } // primeira mensagem da hora: apresenta a Jade
              : n >= 2
                ? { texto: 'Ainda não entendi 😅 Quer que alguém da nossa equipe continue a conversa com você por aqui?', botoes: ['humano', 'demo', 'planos'] }
                : { texto: 'Não entendi essa 🤔 Posso consultar um ativo (ex.: *PETR4*), mostrar as *notícias*, a *agenda* ou os *planos*. Toque numa opção:', botoes: ['demo', 'noticias', 'planos'] };
          }
          }

          if (!naoEntendeu) await duvida(db, key, false).catch(() => {});
          await enviar(phoneId, accessToken, message.from, reply);
        }
      }
    }

    return new Response("OK");
  }
};

async function hashHex(texto) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

async function enviar(phoneId, accessToken, to, reply) {
  const body = textoDe(reply);
  const botoes = (reply && typeof reply === 'object' ? reply.botoes || [] : []).filter((b) => BOTOES[b]).slice(0, 3);
  // botões só cabem em mensagens de até 1.024 letras; acima disso vai texto puro
  const msg = botoes.length && body.length <= 1024
    ? { type: 'interactive', interactive: { type: 'button', body: { text: body }, action: { buttons: botoes.map((b) => ({ type: 'reply', reply: { id: b, title: BOTOES[b].titulo } })) } } }
    : { type: 'text', text: { body, preview_url: false } };
  try {
    const response = await fetch('https://graph.facebook.com/v25.0/' + phoneId + '/messages', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        ...msg
      }),
      signal: AbortSignal.timeout(3500)
    });
    const result = await response.json();
    console.log(JSON.stringify({ radarAccepted: response.ok, httpStatus: response.status, code: result.error?.code, subcode: result.error?.error_subcode }));
  } catch (error) {
    console.warn('RADAR: falha na chamada à Meta', error.name);
  }
}

// tabelas do limite e do contexto (no mesmo D1 do atendimento); criadas uma vez por instância
const tabelasProntas = new WeakSet();
async function prepararTabelas(db) {
  if (tabelasProntas.has(db)) return;
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS jade_limite (conversation_key TEXT NOT NULL, hora INTEGER NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (conversation_key, hora))'),
    db.prepare('CREATE TABLE IF NOT EXISTS jade_contexto (conversation_key TEXT PRIMARY KEY, tickers TEXT NOT NULL, expires_at INTEGER NOT NULL)'),
    // de onde veio a conversa (Radar), por 30 dias, para contar o caminho até o atendimento e os planos
    db.prepare('CREATE TABLE IF NOT EXISTS jade_origem (conversation_key TEXT PRIMARY KEY, origem TEXT NOT NULL, expires_at INTEGER NOT NULL, planos INTEGER NOT NULL DEFAULT 0)'),
  ]);
  tabelasProntas.add(db);
}

// soma 1 na hora atual do número e devolve quantas já foram; limpa horas velhas de vez em quando
export async function contarMensagem(db, key, agora = Date.now()) {
  await prepararTabelas(db);
  const hora = Math.floor(agora / 3600000);
  const r = await db.prepare('INSERT INTO jade_limite (conversation_key, hora, n) VALUES (?, ?, 1) ON CONFLICT(conversation_key, hora) DO UPDATE SET n = n + 1 RETURNING n').bind(key, hora).first();
  if (Math.random() < 0.02) {
    await db.batch([
      db.prepare('DELETE FROM jade_limite WHERE hora < ?').bind(hora - 24),
      db.prepare('DELETE FROM jade_contexto WHERE expires_at < ?').bind(agora),
      db.prepare('DELETE FROM jade_handoff WHERE expires_at < ?').bind(agora),
      db.prepare('DELETE FROM jade_origem WHERE expires_at < ?').bind(agora),
    ]).catch(() => {});
  }
  return Number(r?.n) || 1;
}

// aviso no Telegram da equipe (pelo site, que guarda o token): só os 4 últimos dígitos do número
async function funil(env, phoneId, origem, evento) {
  if (phoneId !== PRODUCAO || !env.JADE) return;
  try { await env.JADE.funil(origem, evento); } catch (error) { console.warn('Jade: funil indisponível', error.name); }
}

async function avisarEquipe(env, tipo, phoneId, from, texto) {
  if (phoneId !== PRODUCAO) return;
  try {
    if (!env.JADE) return;
    await env.JADE.avisarEquipe(tipo, String(from).slice(-4), String(texto || '').slice(0, 500));
  } catch (error) {
    console.warn('Jade: aviso à equipe falhou', error.name);
  }
}

export function ehInsiders(text) {
  return /\binsiders?\b/.test(text) ||
    (/\b(diretor\w*|controlador\w*|conselheir\w*|administrador\w*|executivos?)\b/.test(text) && /\b(compr\w*|vend\w*|negoci\w*)\b/.test(text));
}
async function jadeInsiders(env, original) {
  try {
    const r = await env.JADE.insiders(original);
    if (typeof r === 'string' && r) return r;
    throw new Error('vazio');
  } catch (error) {
    console.warn('Jade: insiders indisponível', error.name);
    return 'Não consegui consultar o radar de insiders agora. Veja no terminal: https://mercadomacro.com.br/ (Macro e Fluxo › Insiders)';
  }
}

function jadeAsset(text) {
  /** @type {[RegExp, string, string | null, RegExp][]} */
  const assets = [
    [/\b(ibov|ibovespa)\b/, 'Ibovespa', '^BVSP', /ibovespa|b3|bolsa brasileira/],
    [/\b(dolar|usd\s?brl|usd)\b/, 'Dólar comercial', 'BRL=X', /d[oó]lar|c[aâ]mbio|dxy|real brasileiro/],
    [/\b(s\s*&\s*p\s*500|sp\s*500|spx)\b/, 'S&P 500', '^GSPC', /s\s*&\s*p|wall street|bolsas? american/],
    [/\b(juros? futuros?|curva de juros|di1\w*|di futuro)\b/, 'Juros futuros', null, /juros futuros|curva de juros|\bDI1\b/i]
  ];
  return assets.find(([pattern]) => pattern.test(text));
}

async function jadeJson(url, timeout) {
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.json();
}

/** @returns {Promise<any>} */
async function jadeQuote(symbol, forWatchlist = false) {
  if (!symbol) return null;
  const chart = '/v8/finance/chart/' + encodeURIComponent(symbol);
  const headers = { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' };
  async function loadChart(host, query) {
    const response = await fetch('https://' + host + '.finance.yahoo.com' + chart + query, {
      headers, signal: AbortSignal.timeout(4000)
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
  }
  let data;
  let intraday = false;
  try {
    data = await loadChart('query1', '?interval=1d&range=5d');
    if (!data.chart?.result?.[0]?.meta) throw new Error('Série diária vazia');
  } catch (error) {
    intraday = true;
    try {
      data = await loadChart('query2', '?interval=5m&range=1d');
    } catch (fallback) {
      console.warn('Jade: cotação indisponível', error.message, fallback.message);
      return null;
    }
  }
  const series = data.chart?.result?.[0];
  const meta = series?.meta;
  if (!Number.isFinite(meta?.regularMarketPrice) || !Number.isFinite(meta.regularMarketTime) || meta.regularMarketTime <= 0) return null;
  const closes = series.indicators?.quote?.[0]?.close ?? [];
  const days = series.timestamp ?? [];
  const timezone = meta.exchangeTimezoneName || 'America/Sao_Paulo';
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, dateStyle: 'short' });
  const session = day.format(meta.regularMarketTime * 1000);
  const priorIndex = days.findLastIndex((timestamp, index) => day.format(timestamp * 1000) !== session && timestamp < meta.regularMarketTime && Number.isFinite(closes[index]) && closes[index] > 0);
  const previousClose = priorIndex >= 0 ? closes[priorIndex] :
    intraday ? (meta.previousClose ?? meta.chartPreviousClose) : null;
  const percent = Number.isFinite(previousClose) && previousClose > 0
    ? (meta.regularMarketPrice / previousClose - 1) * 100 : null;
  const price = Intl.NumberFormat('pt-BR', { maximumFractionDigits: symbol === 'BRL=X' ? 4 : 2 }).format(meta.regularMarketPrice);
  const date = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(meta.regularMarketTime * 1000);
  const change = percent === null ? '' : ' (' + Intl.NumberFormat('pt-BR', { signDisplay: 'exceptZero', maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(percent) + '% ante o fechamento anterior)';
  if (forWatchlist) return percent !== null && Number.isFinite(percent) ? { change: percent, time: meta.regularMarketTime } : null;
  return (symbol === 'BRL=X' ? 'R$ ' : '') + price + change + '\nÚltima cotação em ' + date + ' (Brasília). Fonte: Yahoo Finance. Os dados podem ter atraso.\nhttps://finance.yahoo.com/quote/' + encodeURIComponent(symbol) + '/';
}

// preços do site (src/assinatura.js, PLANOS), lidos pelo JADE e guardados por 10 minutos nesta instância
const precosCache = new WeakMap();
async function precosDoSite(env) {
  const c = env.JADE && precosCache.get(env.JADE);
  if (c && c.ate > Date.now()) return c.v;
  try {
    const v = await env.JADE.precos();
    if (!v || !v.cartao || !v.pix) throw new Error('formato');
    precosCache.set(env.JADE, { v, ate: Date.now() + 600000 });
    return v;
  } catch (error) {
    console.warn('Jade: preços indisponíveis', error.name);
    return null;
  }
}
export const reais = (centavos) => 'R$ ' + (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function jadeSalesReply(text, env, origem = null) {
  // quem veio do Radar recebe links com a origem marcada (aparecem em "De onde vêm os visitantes" no /admin)
  const checkout = origem === 'radar' ? 'https://mercadomacro.com.br/assinar?origem=radar-wa' : 'https://mercadomacro.com.br/assinar?utm_source=whatsapp&utm_medium=chat&utm_campaign=jade';
  const plans = origem === 'radar' ? 'https://mercadomacro.com.br/planos?origem=radar-wa' : 'https://mercadomacro.com.br/planos';
  const semPreco = 'Os valores atualizados estão em ' + plans;
  // só busca os preços quando a mensagem é sobre planos
  const P = /\b(orcamento|pix|renovacao|pagamento unico|cartao|anual|12 meses|custo mensal|valor por mes|por mes|quanto|precos?|valores?|planos?|teste gratis|testar gratis|experimentar|48 horas|quero testar|como testar)\b/.test(text) ? await precosDoSite(env) : null;
  const horas = P?.gratisHoras || 48;
  const trial = 'Se você ainda não assinou, pode experimentar por *' + horas + ' horas grátis*, uma vez por pessoa. O teste inclui Mesa, Notícias e Educação. Veja como funciona em ' + plans;
  if (/\b(?:cancelar|cancelamento|reembolso|estorno)\b/.test(text)) {
    return 'Para gerenciar a renovação no cartão, use “Trocar cartão ou cancelar” na página de assinatura. Para falar sobre reembolso, escreva para contato@mercadomacro.com.br.\n' + checkout;
  }
  if (/^(?:demo )?(?:agenda(?: economica)?|calendario(?: economico)?)[?.!]*$/.test(text)) {
    return '*Agenda econômica | Mercado Macro*\nNo terminal, abra *Calendário*, escolha o dia e filtre por país e impacto. Use os horários de Brasília para se planejar.\n\n*O que acompanhar*\n• Copom e Fed — decisões e comunicados ajudam a entender a perspectiva para os juros.\n• IPCA e CPI — compare a inflação divulgada com a expectativa.\n• Payroll — o emprego americano ajuda a acompanhar o cenário do Fed.\n\nConsulte os próximos eventos e horários no calendário do terminal: https://mercadomacro.com.br/\nO calendário faz parte dos planos pagos. Para comparar, escreva “Quanto custa?”.';
  }
  if (/^(?:demo )?(?:ativos|acoes)[?.!]*$/.test(text)) {
    return 'Qual ativo você acompanha? Envie “Demo BBAS3” ou troque BBAS3 pelo ticker. Eu mostro a variação e procuro manchetes relacionadas.';
  }
  if (/^(?:meu )?orcamento[?.!]*$|\bacima do meu orcamento\b/.test(text)) {
    return trial + '\n\n' + (P ? 'Se quiser acesso completo por um mês, são ' + reais(P.cartao.mensal) + ' no cartão com renovação automática ou ' + reais(P.pix.mensal) + ' no Pix em pagamento único. ' : semPreco + '. ') + checkout;
  }
  if (/^(?:eu )?quero ver na pratica[?.!]*$|^demo[?.!]*$/.test(text)) {
    return { texto: 'Escolha uma amostra: *notícias*, *agenda* ou um *ativo* (como BBAS3). Você também pode enviar o ticker de outro ativo que acompanha.', botoes: ['noticias', 'agenda', 'ativo'] };
  }
  if (/\b(?:pix|sem renovacao|pagamento unico)\b/.test(text)) {
    return 'Se você prefere pagar uma vez e decidir depois se quer continuar, o *Pix* é a opção.\n\n' + (P ? '• *1 mês: ' + reais(P.pix.mensal) + '*\n• *6 meses: ' + reais(P.pix.semestral) + '*\n\n' : semPreco + '.\n\n') + 'Inclui o terminal completo, a watchlist e a IA. O acesso é liberado após a conferência do comprovante. Escolha o período em ' + checkout;
  }
  if (/\b(?:economizar no cartao|menor custo mensal|menor valor por mes|pagar menos por mes|plano anual|anual|12 meses)\b/.test(text)) {
    if (!P) return 'Se você pretende usar o terminal ao longo do ano, o *anual* no cartão tem o menor custo mensal equivalente. ' + semPreco + '.\n\nCompare na assinatura: ' + checkout;
    return 'Se você pretende usar o terminal ao longo do ano, o *anual* tem o menor custo mensal equivalente. São *' + reais(P.cartao.anual) + ' cobrados de uma vez no cartão*, cerca de ' + reais(Math.floor(P.cartao.anual / 12)) + ' por mês. Renova automaticamente a cada ano até você cancelar. Se prefere começar com um compromisso menor, o mensal custa ' + reais(P.cartao.mensal) + ' por mês no cartão.\n\nCompare na assinatura: ' + checkout;
  }
  if (/\b(?:achei caro|esta caro|ta caro|muito caro|fora do meu orcamento|vale a pena)\b/.test(text)) {
    return 'Entendo. O valor ficou acima do que você queria gastar ou você ainda quer ver se usaria o terminal no dia a dia?\n\nResponda *Orçamento* para começar com menos compromisso ou *Quero ver na prática* para escolher uma demonstração.';
  }
  if (/\b(?:teste gratis|testar gratis|experimentar|48 horas|quero testar|como testar)\b/.test(text)) return trial;
  if (/\b(?:quero assinar|como assinar|como faco para assinar|link (?:para|de) assinar|link (?:da|de) assinatura|assinar|assinatura)\b/.test(text)) {
    return 'Abra a página de assinatura, informe seu e-mail e escolha o plano. No cartão, o acesso é liberado após a aprovação. No Pix, após a conferência do comprovante.\n\n' + checkout;
  }
  if (/\b(?:quanto (?:custa|vou pagar)|precos?|valores? dos planos|planos?|cartao)\b/.test(text) && !/\b[A-Z]{4}(?:11|3|4|5|6|7|8|9|10)F?\b/i.test(text)) {
    if (!P) return { texto: '*Planos do Mercado Macro*\nTodos os planos pagos incluem terminal completo, watchlist e assistente de IA, no cartão (com renovação automática) ou no Pix (sem renovação). ' + semPreco + '.\n\nQual caminho combina com você?', botoes: ['teste', 'pix', 'anual'] };
    const planos = '*Planos do Mercado Macro*\nTodos os planos pagos incluem terminal completo, watchlist e assistente de IA.\n\n*Cartão com renovação automática*\n• Mensal: ' + reais(P.cartao.mensal) + ' por mês\n• Semestral: ' + reais(P.cartao.semestral) + ' a cada 6 meses\n• Anual: ' + reais(P.cartao.anual) + ' por ano\n\n*Pix sem renovação automática*\n• 1 mês: ' + reais(P.pix.mensal) + '\n• 6 meses: ' + reais(P.pix.semestral) + '\n\nQual caminho combina com você?\nTermos: ' + plans;
    return { texto: planos, botoes: ['teste', 'pix', 'anual'] };
  }
  if (/\b(?:como funciona|o que e (?:o )?mercado macro|o que tem (?:no painel|no terminal)|conhecer (?:o )?mercado macro)\b/.test(text)) {
    return 'O Mercado Macro reúne agenda econômica, notícias e cotações dos ativos que você acompanha.\n\nO que você quer resolver primeiro: *acompanhar sua watchlist, entender as notícias ou se preparar para os eventos da semana*? Para ver uma resposta na prática, envie “Demo BBAS3” ou outro ticker. Para comparar os planos, escreva “Quanto custa?”.';
  }
  return null;
}

// ticker da conversa, para "e as notícias?" (15 minutos)
async function lembrarTickers(db, key, tickers) {
  await prepararTabelas(db);
  await db.prepare('INSERT INTO jade_contexto (conversation_key, tickers, expires_at) VALUES (?, ?, ?) ON CONFLICT(conversation_key) DO UPDATE SET tickers = excluded.tickers, expires_at = excluded.expires_at')
    .bind(key, JSON.stringify(tickers), Date.now() + 900000).run();
}
async function tickersDaConversa(db, key) {
  await prepararTabelas(db);
  const r = await db.prepare('SELECT tickers FROM jade_contexto WHERE conversation_key = ? AND expires_at > ?').bind(key, Date.now()).first();
  const l = r ? JSON.parse(r.tickers) : [];
  return Array.isArray(l) ? l.filter(t => typeof t === 'string' && /^[A-Z]{4}\d{1,2}F?$/.test(t)).slice(0, 5) : [];
}

async function jadeAssetCommand(text, key, db, env) {
  const tickers = [...new Set(text.toUpperCase().match(/\b[A-Z]{4}(?:11|3|4|5|6|7|8|9|10)F?\b/g) || [])];
  if (tickers.length > 5) return 'Envie até cinco tickers por comparação.';
  let ticker = tickers[0];
  if (!ticker) {
    const name = text.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
    const matches = [
      /\bBANCO DO BRASIL\b/.test(name) && ['BBAS3'],
      /\bPETROBRAS\b/.test(name) && ['PETR3', 'PETR4'],
      /\bVALE\b(?!\s+(?:A PENA|MAIS|MENOS|QUANTO|ISSO|ESTE|ESS[EA]|UM[ A]?\b))/.test(name) &&
        /\b(COTACAO|ACOES?|PRECO|SUBIU|CAIU|VARIOU|VARIACAO|PREGAO|NOTICIAS?)\b/.test(name.replace(/\bVALE\b/g, '')) && ['VALE3']
    ].filter(Boolean);
    if (matches.length) {
      if (matches.length > 1) return 'Qual ativo você quer consultar? ' + matches.flat().join(', ') + '.';
      const [options] = matches;
      if (options.length > 1) return 'Você quer consultar PETR3 ou PETR4? Responda com o ticker.';
      [ticker] = options;
    }
  }
  if (!tickers.length && ticker) tickers.push(ticker);
  const followUp = /not[ií]cias?/.test(text.toLowerCase()) && /^(?:e\b|quais\b)/i.test(text.trim());
  if (!tickers.length && !followUp) return null;
  try {
    if (tickers.length) await lembrarTickers(db, key, tickers);
    else tickers.push(...await tickersDaConversa(db, key));
  } catch (error) {
    console.warn('Jade: contexto indisponível', error.name);
  }
  if (!tickers.length) {
    return 'Qual ativo você quer consultar? Exemplo: notícias de BBAS3.';
  }
  const [newsResult, ...quotes] = await Promise.allSettled([
    noticiasPt(env),
    ...(!followUp ? tickers.map(code => jadeQuote(code.replace(/F$/, '') + '.SA', true)) : [])
  ]);
  const rows = tickers.map((code, index) => ({
    code, quote: quotes[index]?.status === 'fulfilled' ? quotes[index].value : null
  }));
  if (!followUp) rows.sort((a, b) =>
    (b.quote ? Math.abs(b.quote.change) : -1) - (a.quote ? Math.abs(a.quote.change) : -1));
  const title = rows.length === 1 ? rows[0].code : 'Comparação de ativos';
  const parts = ['*' + title + ' | Jade*'];
  if (!followUp) {
    const percent = new Intl.NumberFormat('pt-BR', {
      signDisplay: 'exceptZero', minimumFractionDigits: 2, maximumFractionDigits: 2
    });
    const clock = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short'
    });
    parts.push('*Variações ante o fechamento anterior*\n' + rows.map(({code, quote}) =>
      '• ' + code + ': ' + (quote ? percent.format(quote.change) + '% · ' + clock.format(quote.time * 1000) :
        'indisponível nesta consulta')).join('\n') + '\nHorários de Brasília. Fonte: Yahoo Finance.');
  }
  if (newsResult.status !== 'fulfilled' || !Array.isArray(newsResult.value)) {
    parts.push('Não consegui consultar as notícias agora.');
    return parts.join('\n\n');
  }
  const now = Date.now();
  const items = newsResult.value.filter(item => {
    const age = now - Number(item?.data);
    return typeof item?.titulo === 'string' && typeof item.link === 'string' &&
      /^https?:\/\//i.test(item.link) && age >= 0 && age <= 36 * 3600000;
  });
  parts.push('*Manchetes relacionadas*');
  for (const {code} of rows) {
    const base = code.replace(/F$/, '');
    const tickerInTitle = new RegExp('\\b' + base + '\\b', 'i');
    const company = { BBAS3: /\bBanco do Brasil\b/i, PETR3: /\bPetrobras\b/i,
      PETR4: /\bPetrobras\b/i, VALE3: /\bVale\b(?! a pena)/ }[base];
    const seen = new Set();
    const headlines = [];
    for (const {titulo, link, fonte} of items) {
      if (seen.has(link) || !(tickerInTitle.test(titulo) || company?.test(titulo))) continue;
      seen.add(link);
      headlines.push('• ' + titulo.slice(0, 250) + (fonte ? ' (' + fonte + ')' : '') + '\n' + link);
      if (headlines.length >= (rows.length === 1 ? 2 : 1)) break;
    }
    parts.push((rows.length > 1 ? '*' + code + '*\n' : '') +
      (headlines.join('\n\n') || 'Nenhuma manchete recente encontrada para ' + code + '.'));
  }
  if (!followUp && rows.some(row => row.quote) && /^demo\b/.test(text)) {
    parts.push('Quer acompanhar seus ativos em uma watchlist no terminal? Escreva “Quanto custa?” para ver os planos.');
  }
  return parts.join('\n\n');
}


async function jadeMarketReply([, name, symbol, matcher], env) {
  const [quote, news] = await Promise.allSettled([
    jadeQuote(symbol),
    noticiasPt(env)
  ]);
  const parts = ['*' + name + ' | Jade*'];
  parts.push((quote.status === 'fulfilled' ? quote.value : null) || (symbol ? 'Cotação indisponível nesta consulta.' : 'Nesta versão, consigo localizar notícias sobre juros futuros. A curva está na aba Mesa do terminal.'));
  const items = news.status === 'fulfilled' && Array.isArray(news.value) ? news.value : [];
  const seen = new Set();
  const headlines = [];
  const now = Date.now();
  for (const item of items) {
    const title = typeof item?.titulo === 'string' ? item.titulo.trim() : '';
    const link = typeof item?.link === 'string' ? item.link.trim() : '';
    const time = Number(item?.data);
    if (!title || !matcher.test(title.toLowerCase()) || !Number.isFinite(time) || time > now + 300000 || now - time > 36 * 3600000) continue;
    if (!/^https?:\/\//i.test(link) || link.length > 350 || seen.has(link)) continue;
    seen.add(link);
    const source = typeof item.fonte === 'string' ? item.fonte.trim().slice(0, 80) : '';
    headlines.push('• ' + title.slice(0, 230) + (source ? ' (' + source + ')' : '') + '\n' + link);
    if (headlines.length >= 2) break;
  }
  parts.push(headlines.length ? '*Notícias relacionadas*\n' + headlines.join('\n\n') + '\n\nEssas manchetes dão contexto. A causa do movimento segue em aberto.' : 'Sem manchetes recentes para explicar o movimento com segurança.');
  return parts.join('\n\n') + '\n\nTerminal: https://mercadomacro.com.br/';
}

async function jadeWatchlistCommand(text, phone, env) {
  const command = /^vincular\b/.test(text);
  if (!command && !/\b(watchlists?|minha lista|meus ativos)\b/.test(text)) return null;
  const account = 'https://mercadomacro.com.br/conta';
  try {
    if (command) {
      const code = /^vincular ([a-f0-9]{32})$/.exec(text);
      if (!code) return 'Gere um código de vínculo em ' + account;
      if (await env.JADE.link(phone, code[1])) return 'WhatsApp vinculado. Pergunte: o que mexeu com minha watchlist?';
      return 'O código está inválido ou expirou. Gere outro em ' + account + '. Se o número estiver vinculado a outra conta, desvincule por lá primeiro.';
    }
    const assets = await env.JADE.watchlist(phone);
    if (assets === null) return 'Vincule seu WhatsApp na área Minha conta: ' + account;
    if (!assets.length) return 'Sua conta está vinculada. Adicione ativos à watchlist do terminal para começar.';
    const sample = assets.slice(0, 5);
    const [quotes, news] = await Promise.all([
      Promise.allSettled(sample.map(({ s }) => jadeQuote(s, true))),
      Promise.allSettled([noticiasPt(env)]).then(([result]) => result)
    ]);
    const items = news.status === 'fulfilled' ? news.value : [];
    const now = Date.now();
    const normalize = value => ' ' + value.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim() + ' ';
    const filters = assets.map(({ s, n }) => ({
      ticker: normalize(s.replace(/\.SA$/i, '')),
      name: normalize(n),
      symbol: s
    }));
    const seen = new Set();
    const headlines = [];
    for (const item of Array.isArray(items) ? items : []) {
      const title = typeof item?.titulo === 'string' ? item.titulo.trim() : '';
      const link = typeof item?.link === 'string' ? item.link.trim() : '';
      const time = Number(item?.data);
      if (!title || !/^https?:\/\//i.test(link) || link.length > 350 || seen.has(link) || !Number.isFinite(time) || time > now + 300000 || now - time > 36 * 3600000) continue;
      const normalized = normalize(title);
      const matches = filters.filter(({ ticker, name }) => (/^ [A-Z0-9]{3,12} $/.test(ticker) && normalized.includes(ticker)) || (name.length >= 7 && normalized.includes(name)));
      if (!matches.length) continue;
      seen.add(link);
      const source = typeof item.fonte === 'string' && item.fonte.trim() ? ' (' + item.fonte.trim().slice(0, 70) + ')' : '';
      headlines.push('• ' + matches.slice(0, 4).map(({symbol}) => symbol).join(', ') + ' · ' + title.slice(0, 230) + source + '\n' + link);
      if (headlines.length === 3) break;
    }
    const parts = ['*Sua watchlist | Jade*'];
    const ranked = quotes.flatMap((result, index) => result.status === 'fulfilled' && result.value ? [{ symbol: sample[index].s, ...result.value }] : [])
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 3);
    const percentage = new Intl.NumberFormat('pt-BR', { signDisplay: 'exceptZero', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const clock = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
    parts.push(ranked.length ? '*Maiores variações entre os primeiros ' + sample.length + ' ativos consultados*\n' + ranked.map(({ symbol, change, time }) => '• ' + symbol + ' ' + percentage.format(change) + '% · ' + clock.format(time * 1000)).join('\n') + '\nAnte o fechamento anterior. Horários de Brasília. Fonte: Yahoo Finance. Os dados podem ter atraso.' : 'Variações indisponíveis nesta consulta.');
    parts.push(headlines.length ? '*Manchetes relacionadas*\n' + headlines.join('\n\n') : news.status === 'fulfilled' ? 'Nenhuma manchete recente encontrada para seus ativos.' : 'Feed de notícias temporariamente indisponível.');
    return parts.join('\n\n');
  } catch {
    return 'Não consegui consultar o serviço da watchlist agora. Tente novamente em alguns minutos.';
  }
}

// manchetes em português do site (arquivo de notícias); se o site não responder, o serviço antigo, só com fontes brasileiras
const FONTES_PT = new Set(['Valor Econômico', 'InfoMoney', 'Investing.com BR', 'ADVFN BR', 'Notícia Brasil', 'BeInCrypto BR', 'Cointelegraph BR', 'Google News', 'Money Times', 'InvestNews', 'Valor Investe', 'Bloomberg Línea', 'Suno', 'BMC News', 'Invezz', 'Notícias Agrícolas', 'Folha']);
export async function noticiasPt(env) {
  try {
    if (env?.JADE?.noticias) {
      const l = await env.JADE.noticias();
      if (Array.isArray(l) && l.length) return l;
    }
  } catch (error) { console.warn('Jade: notícias do site indisponíveis', error.name); }
  try {
    const l = await jadeJson('https://news.cota-cotacao10.workers.dev/', 10000);
    return (Array.isArray(l) ? l : []).filter((n) => FONTES_PT.has(n?.fonte));
  } catch (error) { return []; }
}

// mensagens seguidas que a Jade não entendeu (30 minutos); zera quando ela entende
async function duvida(db, key, somar) {
  await db.prepare('CREATE TABLE IF NOT EXISTS jade_duvida (conversation_key TEXT PRIMARY KEY, n INTEGER NOT NULL, expires_at INTEGER NOT NULL)').run();
  if (!somar) { await db.prepare('DELETE FROM jade_duvida WHERE conversation_key = ?').bind(key).run(); return 0; }
  const agora = Date.now();
  const r = await db.prepare('INSERT INTO jade_duvida (conversation_key, n, expires_at) VALUES (?, 1, ?) ON CONFLICT(conversation_key) DO UPDATE SET n = CASE WHEN jade_duvida.expires_at > ? THEN jade_duvida.n + 1 ELSE 1 END, expires_at = excluded.expires_at RETURNING n').bind(key, agora + 1800000, agora).first();
  return Number(r?.n) || 1;
}
