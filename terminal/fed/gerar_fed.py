#!/usr/bin/env python3
"""Probabilidades do Fed (estilo FedWatch): grava terminal/fed/fed.json com
- as reuniões do FOMC (site do Federal Reserve, só as programadas),
- a faixa da taxa básica e a Fed Funds efetiva (FRED),
- o preço dos futuros de Fed Funds de 30 dias (CBOT, código ZQ), um contrato por mês,
  com os fechamentos dos últimos pregões (para comparar com ontem e com 1 semana atrás).
A conta das probabilidades é feita no navegador (fed.js), com o preço ao vivo.
Só biblioteca padrão. Nada inventado: o que não vier fica de fora."""
import json, re, sys, os, datetime as dt, urllib.request, html

UA = 'Mozilla/5.0 (MercadoMacro contato@mercadomacro.com.br)'
MESES = {m: i + 1 for i, m in enumerate(['january', 'february', 'march', 'april', 'may', 'june', 'july',
                                          'august', 'september', 'october', 'november', 'december'])}
COD = 'FGHJKMNQUVXZ'


def baixa(url, t=30):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': '*/*'})
    with urllib.request.urlopen(req, timeout=t) as r:
        return r.read().decode('utf-8', 'replace')


def reunioes():
    s = baixa('https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm')
    out = []
    partes = re.split(r'(\d{4}) FOMC Meetings', s)
    for i in range(1, len(partes) - 1, 2):
        ano = int(partes[i])
        bloco = partes[i + 1]
        for mes, dia in re.findall(r'fomc-meeting__month[^>]*>\s*<strong>([^<]+)</strong>.*?fomc-meeting__date[^>]*>([^<]+)<', bloco, re.S):
            dia = html.unescape(dia).strip()
            if re.search(r'unscheduled|notation|cancel', dia, re.I):
                continue
            m = re.match(r'(\d{1,2})(?:\s*-\s*(\d{1,2}))?(\*)?', dia)
            if not m:
                continue
            nomes = [x.strip().lower() for x in mes.split('/')]
            nome = nomes[-1] if m.group(2) else nomes[0]
            mm = next((v for k, v in MESES.items() if k.startswith(nome[:3])), None)
            if not mm:
                continue
            ultimo = int(m.group(2) or m.group(1))
            try:
                d = dt.date(ano, mm, ultimo)
            except ValueError:
                continue
            out.append({'data': d.isoformat(), 'sep': bool(m.group(3))})
    out = sorted({r['data']: r for r in out}.values(), key=lambda r: r['data'])
    return out


def fred_serie(serie):
    linhas = baixa(f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={serie}').strip().splitlines()[1:]
    out = []
    for ln in linhas:
        d, _, v = ln.partition(',')
        try:
            out.append([d, float(v)])
        except ValueError:
            continue
    return out


def fred(serie):
    s = fred_serie(serie)
    return {'v': s[-1][1], 'data': s[-1][0]} if s else None


def contrato(sym):
    s = json.loads(baixa(f'https://query1.finance.yahoo.com/v8/finance/chart/{sym}?range=3mo&interval=1d'))
    res = s['chart']['result'][0]
    meta = res['meta']
    ts = res.get('timestamp') or []
    cl = (res.get('indicators', {}).get('quote') or [{}])[0].get('close') or []
    fech = []
    for t, c in zip(ts, cl):
        if c is not None:
            d = (dt.datetime.utcfromtimestamp(t + (meta.get('gmtoffset') or 0))).date().isoformat()
            fech.append([d, round(c, 4)])
    p = meta.get('regularMarketPrice')
    if p is None:
        return None
    return {'s': sym, 'p': round(p, 4), 't': meta.get('regularMarketTime'), 'fech': fech[-45:]}


def main(pasta):
    hoje = dt.datetime.utcnow().date()
    reun = reunioes()
    if not reun:
        sys.exit('calendário do FOMC não encontrado')
    futuras = [r for r in reun if r['data'] >= hoje.isoformat()]
    alto, baixo = fred('DFEDTARU'), fred('DFEDTARL')
    effr_h = fred_serie('EFFR')
    effr = {'v': effr_h[-1][1], 'data': effr_h[-1][0]} if effr_h else None
    if not (alto and baixo and effr):
        sys.exit('FRED não respondeu')
    contratos = {}
    y, m = hoje.year, hoje.month
    for _ in range(16):
        sym = f'ZQ{COD[m - 1]}{y % 100:02d}.CBT'
        try:
            c = contrato(sym)
            if c:
                contratos[f'{y}-{m:02d}'] = c
        except Exception as e:
            print('sem', sym, e)
        m += 1
        if m > 12:
            y, m = y + 1, 1
    if len(contratos) < 3:
        sys.exit('poucos contratos de Fed Funds')
    out = {
        'gerado': dt.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
        'fonte': 'CME/CBOT (futuros de Fed Funds de 30 dias, via Yahoo), Federal Reserve e FRED',
        'reunioes': futuras[:10],
        'passadas': [r for r in reun if r['data'] < hoje.isoformat()][-4:],
        'alvo': {'min': baixo['v'], 'max': alto['v'], 'data': alto['data']},
        'effr': effr,
        'effr_hist': effr_h[-70:],
        'contratos': contratos,
    }
    os.makedirs(pasta, exist_ok=True)
    with open(os.path.join(pasta, 'fed.json'), 'w') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print(len(futuras), 'reuniões;', len(contratos), 'contratos; alvo', baixo['v'], alto['v'], 'effr', effr)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'terminal/fed')
