#!/usr/bin/env python3
"""Probabilidades do Copom: grava terminal/copom/copom.json.

Fonte: opções de Copom da B3 (as mesmas do painel público
https://www.b3.com.br/pt_br/produtos-e-servicos/negociacao/juros/dashboard-publico-opcoes-de-copom/).
Cada opção paga se o Copom decidir exatamente aquele cenário (manter, cortar 0,25, subir 0,50...),
então o preço dela (de 0 a 100) é a chance que o mercado dá para o cenário.
A B3 serve os dados em https://arquivos.b3.com.br/charts/chart/...:
  meetings/<dia>         reuniões com opções
  selic/<dia>            Selic meta
  copom/<dia>/<reunião>?qt=20  preço de referência de cada opção nos últimos pregões
  intraday/<dia>/<reunião>     negócios do dia (vazio fora do pregão)
Só biblioteca padrão. Nada inventado: o que a B3 não traz fica de fora."""
import datetime as dt, json, os, sys, time, urllib.request

B = 'https://arquivos.b3.com.br/charts/chart'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36'
HEAD = {'User-Agent': UA, 'Accept': 'application/json', 'Referer': 'https://arquivos.b3.com.br/charts/copom?lang=pt'}


def baixa(path, tent=3):
    erro = None
    for i in range(tent):
        try:
            req = urllib.request.Request(f'{B}/{path}', headers=HEAD)
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception as e:
            erro = e
            time.sleep(3 * (i + 1))
    raise erro


def mov(tick):
    """movimento em bp a partir do preço de exercício do ticker (CPMX26C099750 -> 99,750 -> -25)"""
    try:
        return round((int(tick[-6:]) / 1000 - 100) * 100)
    except ValueError:
        return None


def main(pasta):
    hoje = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date().isoformat()
    reun = baixa(f'meetings/{hoje}')
    if not reun:
        sys.exit('B3 não listou reuniões do Copom')
    selic = baixa(f'selic/{hoje}')
    out_r = []
    for r in reun:
        data = r['dateRef']
        linhas = baixa(f'copom/{hoje}/{data}?qt=20') or []
        hist, cen = {}, {}
        for x in linhas:
            m = mov(x.get('tckrSymb', ''))
            d = (x.get('rptDt') or '')[:10]
            if m is None or not d or x.get('refPric') is None:
                continue
            cen[m] = {'nome': x.get('scnroNm'), 'tick': x['tckrSymb']}
            h = hist.setdefault(d, {'d': d, 'p': {}, 'oi': {}, 'n': {}})
            h['p'][m] = float(x['refPric'])
            h['oi'][m] = int(x.get('opnIntrst') or 0)
            h['n'][m] = int(x.get('rglrTraddCtrcts') or 0)
        try:
            intra = baixa(f'intraday/{hoje}/{data}') or {}
        except Exception:
            intra = {}
        vivo = {}
        for x in intra.get('intradayValues') or []:
            m = mov(x.get('tckrSymb', ''))
            if m is None or x.get('price') is None:
                continue
            hora = f"{(x.get('dateRef') or hoje)[:10]}T{x.get('entryTime') or ''}"
            if m not in vivo or hora >= vivo[m]['t']:
                vivo[m] = {'p': float(x['price']), 't': hora}
        out_r.append({'data': data, 'nome': r.get('meetingDt'), 'cenarios': {str(k): v for k, v in sorted(cen.items())},
                      'hist': [{'d': h['d'], 'p': {str(k): v for k, v in sorted(h['p'].items())},
                                'oi': {str(k): v for k, v in sorted(h['oi'].items())},
                                'n': {str(k): v for k, v in sorted(h['n'].items())}} for h in sorted(hist.values(), key=lambda h: h['d'])],
                      'vivo': {str(k): v for k, v in sorted(vivo.items())},
                      'vivo_atualiz': intra.get('updateDate')})
    if not any(r['hist'] for r in out_r):
        sys.exit('B3 não trouxe preços das opções de Copom')
    out = {'gerado': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
           'fonte': 'B3, opções de Copom (painel público)', 'selic': selic, 'reunioes': out_r}
    os.makedirs(pasta, exist_ok=True)
    with open(os.path.join(pasta, 'copom.json'), 'w') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    for r in out_r:
        u = r['hist'][-1] if r['hist'] else {}
        p = {k: v for k, v in (u.get('p') or {}).items() if v >= 1}
        print(r['data'], u.get('d'), len(r['hist']), 'pregões', p, 'soma', round(sum((u.get('p') or {}).values()), 2), 'vivo', r['vivo'])


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'terminal/copom')
