#!/usr/bin/env python3
"""Indicadores da zona do euro pelo Banco Central Europeu (ECB Data Portal) e pelo Eurostat, APIs públicas sem chave.
Grava terminal/bce/bce.json para a área Europa da aba Indicadores: {"series": {id: [[AAAA-MM-DD, valor], ...]}}.
Só biblioteca padrão. Uso: python3 gerar_bce.py <pasta de saída>"""
import csv, io, json, sys, time, urllib.request, datetime

API = 'https://data-api.ecb.europa.eu/service/data/'
UA = {'User-Agent': 'MercadoMacro/1.0 (robo de indicadores)', 'Accept': 'text/csv'}

# id interno: (chave da série no BCE, desde)
SERIES = {
    'dfr':     ('FM/D.U2.EUR.4F.KR.DFR.LEV', '2008-01-01'),        # taxa de depósito
    'mro':     ('FM/D.U2.EUR.4F.KR.MRR_FR.LEV', '2008-01-01'),     # taxa de refinanciamento
    'estr':    ('EST/B.EU000A2X2A25.WT', '2019-10-01'),            # €STR
    'yc2':     ('YC/B.U2.EUR.4F.G_N_C.SV_C_YM.SR_2Y', '2015-01-01'),  # curva de todos os governos, 2 anos
    'yc10':    ('YC/B.U2.EUR.4F.G_N_C.SV_C_YM.SR_10Y', '2015-01-01'),
    'yc30':    ('YC/B.U2.EUR.4F.G_N_C.SV_C_YM.SR_30Y', '2015-01-01'),
    'desemp':  ('LFSI/M.U2.S.UNEHRT.TOTAL0.15_74.T', '2000-01-01'),  # zona do euro na composição de cada época
    'eurusd':  ('EXR/D.USD.EUR.SP00.A', '2015-01-01'),
    'm3':      ('BSI/M.U2.Y.V.M30.X.I.U2.2300.Z01.A', '2000-01-01'),  # M3, var. anual
    'de10':    ('IRS/M.DE.L.L40.CI.0000.EUR.N.Z', '2000-01-01'),   # Alemanha 10 anos (mensal)
    'it10':    ('IRS/M.IT.L.L40.CI.0000.EUR.N.Z', '2000-01-01'),   # Itália 10 anos (mensal)
}


# Inflação e PIB vêm do Eurostat (o BCE parou de atualizar a série antiga de inflação em dez/2025, quando o
# índice mudou de classificação, e publica o PIB com atraso). Mesma ideia: API pública, sem chave.
EUROSTAT = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/'
SERIES_EUROSTAT = {
    'hicp':   'prc_hicp_minr?geo=EA&unit=RCH_A&coicop18=TOTAL&sinceTimePeriod=2000-01',           # inflação cheia, 12 meses
    'core':   'prc_hicp_minr?geo=EA&unit=RCH_A&coicop18=TOT_X_NRG_FOOD&sinceTimePeriod=2000-01',  # sem energia, alimentos, álcool e fumo
    'serv':   'prc_hicp_minr?geo=EA&unit=RCH_A&coicop18=SERV&sinceTimePeriod=2000-01',            # serviços
    'hicp_m': 'prc_hicp_minr?geo=EA&unit=RCH_M&coicop18=TOTAL&sinceTimePeriod=2010-01',           # no mês
    'pib':    'namq_10_gdp?geo=EA&unit=CLV_PCH_SM&s_adj=SCA&na_item=B1GQ&sinceTimePeriod=2000-Q1',  # PIB real, var. anual
    'pib_q':  'namq_10_gdp?geo=EA&unit=CLV_PCH_PRE&s_adj=SCA&na_item=B1GQ&sinceTimePeriod=2000-Q1', # PIB real, var. trimestral
}


DEGRAUS = ('dfr', 'mro')


def periodo(p):
    p = p.strip()
    if len(p) == 10:
        return p
    if 'Q' in p:  # AAAA-Qn
        y, q = p.split('-Q')
        return f'{y}-{(int(q) - 1) * 3 + 1:02d}-01'
    if len(p) == 7:  # AAAA-MM
        return p + '-01'
    return None


def pedir_eurostat(q, tentativas=4):
    for i in range(tentativas):
        try:
            with urllib.request.urlopen(urllib.request.Request(EUROSTAT + q, headers={'User-Agent': UA['User-Agent']}), timeout=90) as r:
                d = json.loads(r.read().decode('utf-8'))
            t = d['dimension']['time']['category']['index']
            pos = {v: k for k, v in t.items()}
            out = [[periodo(pos[int(i)]), round(float(v), 4)] for i, v in d.get('value', {}).items() if v is not None]
            out = [x for x in out if x[0]]
            out.sort()
            return out
        except Exception as e:
            print(f'  tentativa {i + 1} em {q}: {str(e)[:200]}')
            time.sleep(8 * (i + 1))
    return None


def pedir(chave, desde, tentativas=4):
    url = f'{API}{chave}?format=csvdata&startPeriod={desde}&detail=dataonly'
    for i in range(tentativas):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as r:
                txt = r.read().decode('utf-8')
            out = []
            for row in csv.DictReader(io.StringIO(txt)):
                d, v = periodo(row.get('TIME_PERIOD', '')), row.get('OBS_VALUE', '')
                try:
                    out.append([d, round(float(v), 4)])
                except ValueError:
                    continue
            out = [x for x in out if x[0]]
            out.sort()
            return out
        except Exception as e:
            print(f'  tentativa {i + 1} em {chave}: {str(e)[:200]}')
            time.sleep(8 * (i + 1))
    return None


def main(saida):
    try:
        antigo = json.load(open(f'{saida}/bce.json', encoding='utf-8')).get('series', {})
    except Exception:
        antigo = {}
    series, falhas = {}, []
    pedidos = [(k, lambda c=c, d=d: pedir(c, d), c) for k, (c, d) in SERIES.items()] + [(k, lambda q=q: pedir_eurostat(q), q) for k, q in SERIES_EUROSTAT.items()]
    for k, buscar, chave in pedidos:
        s = buscar()
        if s and len(s) >= 3:
            if k in DEGRAUS:  # taxas que só mudam nas reuniões: guarda só os pontos de mudança e o último
                s = [x for i, x in enumerate(s) if i == 0 or i == len(s) - 1 or x[1] != s[i - 1][1]]
            series[k] = s
            print(f'{k}: {len(s)} pontos, último {s[-1]}')
        else:
            falhas.append(k)
            if antigo.get(k):
                series[k] = antigo[k]  # mantém o que já tinha
            print(f'{k}: FALHOU ({chave})')
    if len(falhas) > len(pedidos) // 2:
        raise SystemExit(f'Muitas séries falharam: {falhas}; arquivo mantido')
    out = {'fonte': 'Banco Central Europeu (ECB Data Portal) e Eurostat', 'gerado': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%MZ'),
           'falhas': falhas, 'series': series}
    with open(f'{saida}/bce.json', 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print('ok', len(series), 'séries; falhas:', falhas)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
