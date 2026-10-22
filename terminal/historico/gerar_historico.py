#!/usr/bin/env python3
"""Histórico diário do Mercado Macro (roda pelo .github/workflows/historico.yml).

Gera, na pasta indicada (padrão: historico/):
  curva.json        curvas do Tesouro Direto (Prefixado e IPCA+), um retrato por dia, até 400 dias
  focus.json        Boletim Focus: mediana semanal de cada indicador, anos atual até +3, últimos 2 anos
  fechamentos.json  fechamento diário dos ativos da Mesa (inclui CDS e minério, que não têm histórico grátis)

Regra do painel: nada inventado. Fonte que falha deixa o arquivo como estava.
Fontes: Tesouro Transparente (CSV oficial), Banco Central (Olinda), Worker do site (Yahoo, Investing, Tesouro).
"""
import csv, io, json, os, sys, urllib.parse, urllib.request
from datetime import date, datetime, timedelta, timezone

# calendário de feriados da B3 (o mesmo do robô da curva DI)
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'curva'))
from gerar_curva import util as dia_util  # noqa: E402

PASTA = sys.argv[1] if len(sys.argv) > 1 else 'historico'
API = 'https://shrill-meadow-89c1.danilo-nillo.workers.dev'
ORIGEM = 'https://station.danilo-nillo.workers.dev'
UA = 'Mozilla/5.0 (compatible; MercadoMacro-Historico/1.0)'
BRT = timezone(timedelta(hours=-3))
HOJE = datetime.now(BRT).date()   # Brasília
erros = []


def baixa(url, origem=False, tempo=120, cabecalhos=False):
    h = {'User-Agent': UA, 'Accept': '*/*'}
    if origem:
        h['Origin'] = ORIGEM
    with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=tempo) as r:
        return (r.read(), r.headers) if cabecalhos else r.read()


def le(nome, padrao):
    try:
        with open(os.path.join(PASTA, nome), encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return padrao


def grava(nome, obj):
    with open(os.path.join(PASTA, nome), 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{nome}: {os.path.getsize(os.path.join(PASTA, nome)) // 1024} KB')


def num(t):
    t = str(t or '').strip().replace('.', '').replace(',', '.')
    try:
        return float(t)
    except ValueError:
        return None


def dmy(s):
    d, m, a = s.strip().split('/')
    return date(int(a), int(m), int(d))


# ---------------------------------------------------------------- curva do Tesouro
CSV_TT = ('https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/'
          'resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/PrecoTaxaTesouroDireto.csv')
DIAS_CURVA = 400


def entra_na_curva(nome):
    n = nome.lower()
    return ('prefixado' in n or 'ipca+' in n) and 'renda+' not in n and 'educa+' not in n


def curva():
    cur = le('curva.json', {}).get('dias', {})
    corte = HOJE - timedelta(days=DIAS_CURVA)
    novos = 0
    try:
        txt = baixa(CSV_TT, tempo=300).decode('latin-1')
        dias = {}
        for c in csv.reader(io.StringIO(txt), delimiter=';'):
            if len(c) < 4 or not c[0].lower().startswith('tesouro'):
                continue
            try:
                base, venc = dmy(c[2]), dmy(c[1])
            except Exception:
                continue
            taxa = num(c[3])
            if base < corte or taxa is None or not entra_na_curva(c[0]):
                continue
            dias.setdefault(base.isoformat(), []).append([f'{c[0].strip()} {venc.year}', taxa, venc.strftime('%d/%m/%Y')])
        for k, v in dias.items():
            cur[k] = sorted(v, key=lambda t: (t[0].split(' ')[0:-1], dmy(t[2])))
            novos += 1
        print(f'curva: {len(dias)} dias do Tesouro Transparente')
    except Exception as e:
        erros.append(f'Tesouro Transparente: {e}')
    # o dia de hoje (o CSV oficial chega um dia depois): taxa atual pelo Worker
    # só em dia útil da B3 e só com resposta fresca de hoje (não a cópia de reserva do Worker)
    if dia_util(HOJE) and HOJE.isoformat() not in cur:
        try:
            corpo, cab = baixa(API + '/tesouro', origem=True, cabecalhos=True)
            j = json.loads(corpo)
            ts = j.get('ts')
            dia_ts = datetime.fromtimestamp(ts / 1000, BRT).date() if isinstance(ts, (int, float)) else None
            if cab.get('X-Reserva') or dia_ts != HOJE:
                raise ValueError(f'resposta de reserva ou antiga (X-Reserva={cab.get("X-Reserva")}, ts={dia_ts}), dia de hoje fora da curva')
            t = [[x['nome'], x['taxa'], x['vencimento']] for x in j.get('titulos', [])
                 if entra_na_curva(x['nome']) and isinstance(x.get('taxa'), (int, float))]
            if t:
                cur[HOJE.isoformat()] = t
                novos += 1
        except Exception as e:
            erros.append(f'Worker /tesouro: {e}')
    cur = {k: v for k, v in cur.items() if k >= corte.isoformat()}
    if novos:
        grava('curva.json', {'gerado': datetime.now(timezone.utc).isoformat(timespec='seconds'),
                             'fonte': 'Tesouro Transparente (taxa de compra) e Tesouro Direto', 'dias': dict(sorted(cur.items()))})


# ---------------------------------------------------------------- Focus
OLINDA = 'https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais'
IND = ['IPCA', 'PIB Total', 'Câmbio', 'Selic', 'IGP-M', 'IPCA Administrados', 'Conta corrente', 'Balança comercial',
       'Investimento direto no país', 'Dívida líquida do setor público', 'Resultado primário', 'Resultado nominal']


def focus():
    desde = (HOJE - timedelta(days=740)).isoformat()
    anos = [HOJE.year + i for i in range(4)]
    # parte do arquivo anterior: indicador que não respondeu fica como estava
    saida = dict(le('focus.json', {}).get('ind') or {})
    novos = 0
    for ind in IND:
        filtro = (f"Indicador eq '{ind}' and baseCalculo eq 0 and Data ge '{desde}' and ("
                  + ' or '.join(f"DataReferencia eq '{a}'" for a in anos) + ')')
        url = (OLINDA + '?$format=json&$top=10000&$orderby=Data%20asc&$select=Data,DataReferencia,Mediana&$filter='
               + urllib.parse.quote(filtro))
        try:
            linhas = json.loads(baixa(url)).get('value', [])
        except Exception as e:
            erros.append(f'Focus {ind}: {e}')
            continue
        por_ano = {}
        for r in linhas:
            if r.get('Mediana') is None:
                continue
            d = date.fromisoformat(r['Data'][:10])
            semana = d.isocalendar()[:2]
            # um ponto por semana: o último dia com dado (o relatório usa a sexta)
            por_ano.setdefault(str(r['DataReferencia']), {})[semana] = [d.isoformat(), round(float(r['Mediana']), 4)]
        if por_ano:
            saida[ind] = {a: [p for _, p in sorted(s.items())] for a, s in sorted(por_ano.items())}
            novos += 1
    if novos and len(saida) >= 4:
        grava('focus.json', {'gerado': datetime.now(timezone.utc).isoformat(timespec='seconds'),
                             'fonte': 'Banco Central do Brasil, sistema Expectativas de Mercado (Focus)', 'ind': saida})
    else:
        erros.append('Focus: nenhum indicador novo, arquivo mantido')


# ---------------------------------------------------------------- fechamentos
SIMBOLOS = ['^BVSP', 'IFIX.SA', 'EWZ', 'BRL=X', 'EURBRL=X', 'GBPBRL=X', 'DX-Y.NYB', 'EURUSD=X', 'GBPUSD=X', 'JPY=X',
            '^GSPC', '^IXIC', '^DJI', '^RUT', '^VIX', '^GDAXI', '^STOXX50E', '^FTSE', '^N225', '^HSI', '000001.SS',
            '^IRX', '^FVX', '^TNX', '^TYX', 'CL=F', 'BZ=F', 'NG=F', 'GC=F', 'SI=F', 'HG=F', 'ZS=F', 'ZC=F', 'KC=F', 'SB=F',
            'BTC-USD', 'ETH-USD']


def fechamentos():
    h = le('fechamentos.json', {'s': {}})
    s = h.get('s', {})
    mudou = 0

    def poe(chave, dia, valor):
        nonlocal mudou
        if valor is None:
            return
        lst = s.setdefault(chave, [])
        if lst and lst[-1][0] == dia:
            lst[-1] = [dia, valor]
        elif not lst or lst[-1][0] < dia:
            lst.append([dia, valor])
        mudou += 1

    try:
        j = json.loads(baixa(API + '/quotes?symbols=' + urllib.parse.quote(','.join(SIMBOLOS), safe=','), origem=True))
        for sym, v in j.items():
            meta = ((v or {}).get('chart') or {}).get('result', [{}])[0].get('meta', {}) if isinstance(v, dict) else {}
            preco, t = meta.get('regularMarketPrice'), meta.get('regularMarketTime')
            if isinstance(preco, (int, float)) and t:
                off = meta.get('gmtoffset') or 0
                dia = datetime.fromtimestamp(t + off, timezone.utc).date().isoformat()
                poe(sym, dia, round(preco, 6))
    except Exception as e:
        erros.append(f'Worker /quotes: {e}')
    for rota, chave in (('/cds', 'CDS_BR_5A'), ('/minerio', 'MINERIO')):
        try:
            j = json.loads(baixa(API + rota, origem=True))
            if isinstance(j.get('valor'), (int, float)) and HOJE.weekday() < 5:
                k = chave if rota == '/cds' else f"{chave}_{j.get('mercado', '')}"
                poe(k, HOJE.isoformat(), j['valor'])
        except Exception as e:
            erros.append(f'Worker {rota}: {e}')
    if mudou:
        grava('fechamentos.json', {'gerado': datetime.now(timezone.utc).isoformat(timespec='seconds'),
                                   'fonte': 'Yahoo Finance (pelo Worker), Investing (CDS e minério SGX), Sina (minério Dalian)',
                                   'nota': 'Um valor por dia, gravado depois do fechamento. MINERIO_SGX em US$/t, MINERIO_DCE em yuan/t.',
                                   's': s})


# ---------------------------------------------------------------- reserva dos Indicadores
# cópia do pacote /ind/bundle (FRED e Banco Central): se a fonte sair do ar e o worker não tiver
# cópia guardada, ele usa este arquivo e o site continua mostrando os últimos números bons
def reserva_indicadores():
    for g in ('us', 'mo', 'br'):
        try:
            j = json.loads(baixa(f'{API}/ind/bundle?g={g}', origem=True))
            dados = j.get('data') or {}
            antigo = le(f'ind-{g}.json', {}).get('data') or {}
            # só grava se veio tudo novo (sem séries faltando nem emprestadas da cópia anterior)
            if not dados or j.get('errors') or j.get('antigos') or len(dados) < len(antigo):
                erros.append(f'Reserva {g}: pacote incompleto, mantida a cópia anterior')
                continue
            grava(f'ind-{g}.json', {'g': g, 'ts': j.get('ts'), 'data': dados})
        except Exception as e:
            erros.append(f'Reserva {g}: {e}')


if __name__ == '__main__':
    os.makedirs(PASTA, exist_ok=True)
    for f in (curva, focus, fechamentos, reserva_indicadores):
        try:
            f()
        except Exception as e:
            erros.append(f'{f.__name__}: {e}')
    for e in erros:
        print('AVISO:', e)
    print('Pronto.' if not erros else f'Pronto, com {len(erros)} aviso(s).')
