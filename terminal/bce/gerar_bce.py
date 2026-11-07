#!/usr/bin/env python3
"""Indicadores da zona do euro pelo Banco Central Europeu (ECB Data Portal, API pública sem chave).
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
    'hicp':    ('ICP/M.U2.N.000000.4.ANR', '2000-01-01'),          # inflação cheia, 12 meses
    'core':    ('ICP/M.U2.N.XEF000.4.ANR', '2000-01-01'),          # sem energia, alimentos, álcool e fumo
    'hicp_m':  ('ICP/M.U2.N.000000.4.MOR', '2015-01-01'),          # no mês (sem ajuste)
    'desemp':  ('LFSI/M.I9.S.UNEHRT.TOTAL0.15_74.T', '2000-01-01'),
    'pib':     ('MNA/Q.Y.I9.W2.S1.S1.B.B1GQ._Z._Z._Z.EUR.LR.GY', '2000-01-01'),  # PIB real, var. anual
    'pib_q':   ('MNA/Q.Y.I9.W2.S1.S1.B.B1GQ._Z._Z._Z.EUR.LR.GO', '2000-01-01'),  # PIB real, var. trimestral
    'eurusd':  ('EXR/D.USD.EUR.SP00.A', '2015-01-01'),
    'm3':      ('BSI/M.U2.Y.V.M30.X.I.U2.2300.Z01.A', '2000-01-01'),  # M3, var. anual
    'de10':    ('IRS/M.DE.L.L40.CI.0000.EUR.N.Z', '2000-01-01'),   # Alemanha 10 anos (mensal)
    'it10':    ('IRS/M.IT.L.L40.CI.0000.EUR.N.Z', '2000-01-01'),   # Itália 10 anos (mensal)
}


def periodo(p):
    p = p.strip()
    if len(p) == 10:
        return p
    if len(p) == 7:  # AAAA-MM
        return p + '-01'
    if 'Q' in p:  # AAAA-Qn
        y, q = p.split('-Q')
        return f'{y}-{(int(q) - 1) * 3 + 1:02d}-01'
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
    for k, (chave, desde) in SERIES.items():
        s = pedir(chave, desde)
        if s and len(s) >= 3:
            series[k] = s
            print(f'{k}: {len(s)} pontos, último {s[-1]}')
        else:
            falhas.append(k)
            if antigo.get(k):
                series[k] = antigo[k]  # mantém o que já tinha
            print(f'{k}: FALHOU ({chave})')
    if len([k for k in series if k not in falhas]) < len(SERIES) // 2:
        raise SystemExit(f'Muitas séries falharam: {falhas}; arquivo mantido')
    out = {'fonte': 'Banco Central Europeu (ECB Data Portal)', 'gerado': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%MZ'),
           'falhas': falhas, 'series': series}
    with open(f'{saida}/bce.json', 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print('ok', len(series), 'séries; falhas:', falhas)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
