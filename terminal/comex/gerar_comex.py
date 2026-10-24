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


def main(saida):
    upd = pedir('/general/dates/updated')
    print('atualizado:', json.dumps(upd, ensure_ascii=False)[:300])
    du = upd.get('data', {}) if isinstance(upd, dict) else {}
    ano, mes = int(du.get('year') or 0), int(du.get('monthNumber') or du.get('month') or 0)
    if not ano or not mes:
        hoje = datetime.date.today()
        ano, mes = hoje.year, hoje.month
    periodo = {'from': f'{ano - 3}-01', 'to': f'{ano}-{mes:02d}'}
    meses = {}
    for fluxo, campo in (('export', 'exp'), ('import', 'imp')):
        resp = pedir('/general', {'flow': fluxo, 'monthDetail': True, 'period': periodo, 'filters': [], 'details': [], 'metrics': ['metricFOB', 'metricKG']})
        itens = lista(resp)
        print(f'{fluxo}: {len(itens)} linhas; exemplo:', json.dumps(itens[:2], ensure_ascii=False)[:400])
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
    caminho = f'{saida}/comex.json'
    try:
        antigo = json.load(open(caminho, encoding='utf-8'))
    except Exception:
        antigo = None
    if antigo and antigo.get('meses') == serie:
        print('Sem dado novo')
        return
    out['gerado'] = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')
    with open(caminho, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print(f'Gravado: {len(serie)} meses, último {serie[-1]}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
