#!/usr/bin/env python3
"""Balança comercial do Brasil (Comex Stat, MDIC): exportações e importações por mês, em US$ FOB.
Grava terminal/comex/comex.json para o bloco "Balança comercial" da aba Indicadores (área Brasil).
Só biblioteca padrão. Uso: python3 gerar_comex.py <pasta de saída>"""
import json, sys, time, urllib.request, urllib.error, datetime

API = 'https://api-comexstat.mdic.gov.br'
UA = {'User-Agent': 'MercadoMacro/1.0 (+https://mercadomacro.com.br)', 'Accept': 'application/json', 'Content-Type': 'application/json'}


def pedir(caminho, corpo=None, tentativas=6):
    time.sleep(12)  # a API limita o ritmo de consultas (HTTP 429): uma de cada vez, com folga
    for i in range(tentativas):
        try:
            req = urllib.request.Request(API + caminho, data=json.dumps(corpo).encode() if corpo is not None else None, headers=UA, method='POST' if corpo is not None else 'GET')
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as e:  # 429 = muitas consultas: espera o que a API pedir
            espera = int(e.headers.get('Retry-After') or 0) or 30 * (i + 1)
            print(f'  tentativa {i + 1} em {caminho}: HTTP {e.code}; esperando {espera} s')
            time.sleep(min(espera, 180))
        except Exception as e:  # a API do governo às vezes demora; tenta de novo
            print(f'  tentativa {i + 1} em {caminho}: {e}')
            time.sleep(15 * (i + 1))
    raise SystemExit(f'Comex Stat não respondeu em {caminho}')


def lista(resp):
    d = resp.get('data', resp) if isinstance(resp, dict) else resp
    if isinstance(d, dict):
        for k in ('list', 'lista', 'rows', 'data'):
            if isinstance(d.get(k), list):
                return d[k]
    return d if isinstance(d, list) else []


def num(v):
    try:
        return float(str(v).replace(',', '.'))
    except Exception:
        return None


# commodities exportadas que mexem com a bolsa, por posição SH4 (a carne bovina soma fresca e congelada)
PRODUTOS = [
    ('minerio', 'Minério de ferro', ['2601']),
    ('petroleo', 'Petróleo bruto', ['2709']),
    ('soja', 'Soja em grão', ['1201']),
    ('milho', 'Milho', ['1005']),
    ('cafe', 'Café', ['0901']),
    ('acucar', 'Açúcar', ['1701']),
    ('bovina', 'Carne bovina', ['0201', '0202']),
    ('frango', 'Carne de frango', ['0207']),
    ('celulose', 'Celulose', ['4703']),
]
FIXOS = ['China', 'Estados Unidos', 'Argentina']  # sempre no arquivo, mesmo fora do top


def chave_mes(it):
    a = it.get('year') or it.get('coAno')
    m = it.get('monthNumber') or it.get('coMes')
    return f'{int(a)}-{int(str(m)[:2]):02d}' if a and m else None


def produtos(periodos):
    sh = {c: k for k, _, cs in PRODUTOS for c in cs}
    acc = {}
    for periodo in periodos:
        resp = pedir('/general', {'flow': 'export', 'monthDetail': True, 'period': periodo, 'filters': [{'filter': 'heading', 'values': list(sh)}], 'details': ['heading'], 'metrics': ['metricFOB', 'metricKG']})
        itens = lista(resp)
        print(f'produtos {periodo}: {len(itens)} linhas')
        for it in itens:
            k, mm = sh.get(str(it.get('headingCode') or '').zfill(4)), chave_mes(it)
            fob, kg = num(it.get('metricFOB')), num(it.get('metricKG'))
            if k and mm and fob is not None:
                d = acc.setdefault(k, {}).setdefault(mm, [0, 0])
                d[0] += fob
                d[1] += kg or 0
    return [{'k': k, 'nome': nome, 'sh': cs, 'meses': [{'m': mm, 'fob': round(v[0]), 'kg': round(v[1])} for mm, v in sorted(acc[k].items())]} for k, nome, cs in PRODUTOS if acc.get(k)]


def paises(periodos):
    acc = {}
    for periodo in periodos:
        resp = pedir('/general', {'flow': 'export', 'monthDetail': True, 'period': periodo, 'filters': [], 'details': ['country'], 'metrics': ['metricFOB']})
        itens = lista(resp)
        print(f'países {periodo}: {len(itens)} linhas')
        for it in itens:
            p, mm, fob = it.get('country'), chave_mes(it), num(it.get('metricFOB'))
            if p and mm and fob is not None:
                acc.setdefault(p, {})[mm] = acc.get(p, {}).get(mm, 0) + round(fob)
    if not acc:
        return []
    ult = max(mm for v in acc.values() for mm in v)
    ano = ult[:4]
    ytd = lambda p: sum(v for mm, v in acc[p].items() if mm.startswith(ano))
    top = sorted(acc, key=ytd, reverse=True)[:12]
    top += [p for p in FIXOS if p in acc and p not in top]
    return [{'p': p, 'm': dict(sorted(acc[p].items()))} for p in top]


def main(saida):
    upd = pedir('/general/dates/updated')
    print('atualizado:', json.dumps(upd, ensure_ascii=False)[:300])
    du = upd.get('data', {}) if isinstance(upd, dict) else {}
    ano, mes = int(du.get('year') or 0), int(du.get('monthNumber') or du.get('month') or 0)
    if not ano or not mes:
        hoje = datetime.date.today()
        ano, mes = hoje.year, hoje.month
    # o filtro de período vale mês a mês dentro de cada ano (2023-01 a 2026-09 traz só jan-set de cada ano):
    # por isso uma consulta para os anos fechados e outra para o ano corrente
    periodos = [{'from': f'{ano - 3}-01', 'to': f'{ano - 1}-12'}, {'from': f'{ano}-01', 'to': f'{ano}-{mes:02d}'}]
    meses = {}
    for (fluxo, campo), periodo in [(f, p) for f in (('export', 'exp'), ('import', 'imp')) for p in periodos]:
        resp = pedir('/general', {'flow': fluxo, 'monthDetail': True, 'period': periodo, 'filters': [], 'details': [], 'metrics': ['metricFOB', 'metricKG']})
        itens = lista(resp)
        print(f'{fluxo} {periodo}: {len(itens)} linhas; exemplo:', json.dumps(itens[:2], ensure_ascii=False)[:400])
        for it in itens:
            a = it.get('year') or it.get('coAno') or it.get('ano')
            m = it.get('monthNumber') or it.get('coMes') or it.get('mes')
            v = num(it.get('metricFOB') or it.get('vlFob'))
            if a and m and v is not None:
                chave = f'{int(a)}-{int(str(m)[:2]):02d}'
                meses.setdefault(chave, {})[campo] = round(v)
    serie = [{'m': k, 'exp': v.get('exp'), 'imp': v.get('imp')} for k, v in sorted(meses.items()) if v.get('exp') is not None and v.get('imp') is not None]
    if len(serie) < 12:
        raise SystemExit(f'Poucos meses lidos ({len(serie)}); arquivo mantido como estava')
    out = {'fonte': 'Comex Stat (MDIC/SECEX)', 'unidade': 'US$ FOB', 'atualizado': du.get('updated') or '', 'ultimo': serie[-1]['m'], 'meses': serie}
    # do ano passado inteiro até o último mês divulgado: dá o mesmo mês de 12 meses atrás e o acumulado dos dois anos
    recentes = [{'from': f'{ano - 1}-01', 'to': f'{ano - 1}-12'}, {'from': f'{ano}-01', 'to': f'{ano}-{mes:02d}'}]
    out['produtos'] = produtos(recentes)
    out['paises'] = paises(recentes)
    caminho = f'{saida}/comex.json'
    try:
        antigo = json.load(open(caminho, encoding='utf-8'))
    except Exception:
        antigo = None
    if antigo and all(antigo.get(k) == out[k] for k in ('meses', 'produtos', 'paises')):
        print('Sem dado novo')
        return
    out['gerado'] = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')
    with open(caminho, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print(f'Gravado: {len(serie)} meses, último {serie[-1]}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
