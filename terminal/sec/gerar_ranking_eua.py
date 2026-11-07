#!/usr/bin/env python3
"""Ranking das maiores empresas americanas (aba Fundamentos > Ranking > EUA).

Lê da SEC (data.sec.gov, sem chave; a SEC pede User-Agent com contato e até 10 pedidos por segundo):
- "frames" do XBRL: receita e lucro do ano de todas as empresas que entregam balanço em US-GAAP;
- companyconcept: patrimônio líquido na data de fim do ano fiscal de cada uma das 500 maiores;
- submissions: código SIC (setor) e nome;
- company_tickers.json: ticker de cada empresa.
Usa o último ano completo (CY do ano passado); quem ainda não tem esse ano entra com o anterior e a data dele.
Grava <saida>/ranking_eua.json. Nada inventado: conta que não existe fica null ("—" no site).
Uso: python3 gerar_ranking_eua.py <pasta_saida>
"""
import json, os, sys, time, urllib.request
from datetime import date, datetime, timezone

UA = "MercadoMacro contato@mercadomacro.com.br"
TOP = 500
RECEITA = ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax',
           'SalesRevenueNet', 'RevenuesNetOfInterestExpense']
LUCRO = ['NetIncomeLoss', 'ProfitLoss']
PL = ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest']
_ultimo = [0.0]


def get(url, tentativas=4):
    for i in range(tentativas):
        espera = 0.13 - (time.time() - _ultimo[0])
        if espera > 0:
            time.sleep(espera)
        _ultimo[0] = time.time()
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Encoding': 'identity'})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            print(f'  tentativa {i + 1} falhou em {url}: {e}')
        except Exception as e:  # noqa: BLE001
            print(f'  tentativa {i + 1} falhou em {url}: {e}')
        time.sleep(3 * (i + 1))
    return None


def frame(conceito, ano):
    """{cik: (valor, inicio, fim)} do ano (período de ~12 meses que a SEC encaixa no ano civil)."""
    j = get(f'https://data.sec.gov/api/xbrl/frames/us-gaap/{conceito}/USD/CY{ano}.json')
    out = {}
    for d in (j or {}).get('data', []):
        out[d['cik']] = (d['val'], d.get('start'), d['end'], d.get('entityName', ''))
    print(f'  {conceito} CY{ano}: {len(out)} empresas')
    return out


# setor em português pelo código SIC (divisões e alguns grupos que pesam na bolsa americana)
def setor(sic):
    try:
        s = int(sic)
    except Exception:  # noqa: BLE001
        return ''
    faixas = [
        ((100, 999), 'Agro'), ((1000, 1299), 'Mineração'), ((1300, 1399), 'Petróleo e gás'), ((1400, 1499), 'Mineração'),
        ((1500, 1799), 'Construção'), ((2000, 2199), 'Alimentos, bebidas e fumo'), ((2830, 2836), 'Farmacêutico e biotecnologia'),
        ((2800, 2899), 'Químico'), ((2900, 2999), 'Petróleo e gás'), ((3570, 3579), 'Tecnologia (hardware)'),
        ((3600, 3699), 'Semicondutores e eletrônicos'), ((3700, 3799), 'Veículos, aviões e peças'), ((3800, 3899), 'Equipamentos médicos e de precisão'),
        ((2200, 3999), 'Indústria'), ((4000, 4799), 'Transporte'), ((4800, 4899), 'Telecomunicações e mídia'),
        ((4900, 4999), 'Energia elétrica, gás e saneamento'), ((5000, 5199), 'Atacado'), ((5200, 5999), 'Varejo'),
        ((6000, 6199), 'Bancos e crédito'), ((6200, 6299), 'Corretoras e gestoras'), ((6300, 6499), 'Seguros'),
        ((6500, 6599), 'Imóveis'), ((6798, 6798), 'Fundos imobiliários (REIT)'), ((6700, 6799), 'Holdings e fundos'),
        ((7370, 7379), 'Tecnologia (software e internet)'), ((7000, 7999), 'Serviços'), ((8000, 8099), 'Saúde'), ((8100, 8999), 'Serviços'),
    ]
    for (a, b), n in faixas:
        if a <= s <= b:
            return n
    return 'Outros'


def main():
    saida = sys.argv[1] if len(sys.argv) > 1 else 'terminal/sec'
    os.makedirs(saida, exist_ok=True)
    ano = date.today().year - 1
    tick = get('https://www.sec.gov/files/company_tickers.json')
    if not tick:
        sys.exit('Sem a lista de tickers da SEC: nada foi gravado.')
    tk = {}
    for v in tick.values():
        tk.setdefault(int(v['cik_str']), v['ticker'])   # o primeiro ticker de cada empresa é o principal
    print(f'{len(tk)} empresas com ticker')

    dados = {}   # cik -> {'ano', 'rec': (val, ini, fim), 'luc': ...}
    # ano seguinte primeiro: empresas com ano fiscal fora do calendário (Microsoft fecha em junho) já têm o ano que acabou
    # neste ano civil; fica o período de fim mais recente de cada empresa
    for a in (ano + 1, ano, ano - 1):
        rec = {}
        for c in RECEITA:
            for cik, v in frame(c, a).items():
                if cik in tk and (cik not in rec or v[0] > rec[cik][0]):
                    rec[cik] = v   # a maior das contas de receita é a receita total
        luc = {}
        for c in LUCRO:
            for cik, v in frame(c, a).items():
                if cik in tk and cik not in luc:
                    luc[cik] = v   # NetIncomeLoss (dos controladores) tem prioridade
        for cik, r in rec.items():
            if cik in dados and dados[cik]['rec'][2] >= r[2]:
                continue
            dados[cik] = {'ano': a, 'rec': r, 'luc': luc.get(cik)}
    # Os frames às vezes deixam de fora uma empresa grande (a Exxon em 2025). A lista de tickers da SEC vem mais ou menos
    # na ordem do valor de mercado: as 200 primeiras que faltaram são buscadas uma a uma, no último 10-K anual.
    def anual(cik, contas):
        melhor = None
        for c in contas:
            cc = get(f'https://data.sec.gov/api/xbrl/companyconcept/CIK{cik:010d}/us-gaap/{c}.json')
            for x in (cc or {}).get('units', {}).get('USD', []):
                if x.get('form') not in ('10-K', '10-K/A') or not x.get('start'):
                    continue
                dias = (date.fromisoformat(x['end']) - date.fromisoformat(x['start'])).days
                if 350 <= dias <= 380 and (melhor is None or (x['end'], x['val']) > (melhor[2], melhor[0])):
                    melhor = (x['val'], x['start'], x['end'], '')
        return melhor
    grandes = []
    for v in tick.values():
        c = int(v['cik_str'])
        if c not in grandes:
            grandes.append(c)
        if len(grandes) >= 200:
            break
    for cik in grandes:
        if cik in dados:
            continue
        r = anual(cik, RECEITA[:3])
        if not r or r[2] < f'{ano - 1}-06-30':
            continue
        l = anual(cik, LUCRO[:1])
        dados[cik] = {'ano': int(r[2][:4]) if r[2][5:7] > '06' else int(r[2][:4]) - 1, 'rec': r, 'luc': l if l and l[2] == r[2] else None}
        print(f'  {tk[cik]} entrou pela busca individual: receita {r[0]:,} até {r[2]}')
    if len(dados) < 1000:
        sys.exit(f'Só {len(dados)} empresas lidas: a SEC pode ter mudado o formato. Nada foi gravado.')

    # as 500 maiores por receita, entre as que têm o ano mais recente; quem só tem o anterior entra se couber pela receita
    top = sorted(dados.items(), key=lambda kv: -kv[1]['rec'][0])[:TOP]
    empresas = []
    for n, (cik, d) in enumerate(top, 1):
        sub = get(f'https://data.sec.gov/submissions/CIK{cik:010d}.json') or {}
        fim = d['rec'][2]
        pl = None
        for c in PL:
            cc = get(f'https://data.sec.gov/api/xbrl/companyconcept/CIK{cik:010d}/us-gaap/{c}.json')
            vals = [x for x in ((cc or {}).get('units', {}).get('USD', [])) if x.get('end') == fim and x.get('form') in ('10-K', '10-K/A', '20-F', '40-F')]
            if vals:
                pl = max(vals, key=lambda x: x.get('filed', ''))['val']
                break
        luc = d['luc']
        empresas.append({
            't': tk[cik], 'cik': cik, 'nome': sub.get('name') or d['rec'][3],
            'setor': setor(sub.get('sic')), 'sic': sub.get('sic') or None,
            'ref': fim, 'ano': min(d['ano'], ano),
            'receita': d['rec'][0],
            'lucro': luc[0] if luc and luc[2] == fim else None,   # lucro só se for do mesmo período da receita
            'pl': pl,
        })
        if n % 50 == 0:
            print(f'  {n} empresas lidas')
    with open(os.path.join(saida, 'ranking_eua.json'), 'w', encoding='utf-8') as f:
        json.dump({'gerado': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'ano': ano,
                   'fonte': 'SEC EDGAR (XBRL, US-GAAP), valores em US$',
                   'empresas': empresas}, f, ensure_ascii=False, separators=(',', ':'))
    print(f'Pronto: {len(empresas)} empresas em {saida}/ranking_eua.json')


if __name__ == '__main__':
    main()
