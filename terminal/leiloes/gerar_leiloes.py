#!/usr/bin/env python3
"""Leilões do Tesouro dos EUA (TreasuryDirect, API pública sem chave: /TA_WS/securities/auctioned e /upcoming).
Grava terminal/leiloes/leiloes.json para o bloco da aba Indicadores (área EUA, Juros e Fed).
Para cada leilão: data, título, taxa máxima aceita, bid-to-cover, quanto foi para dealers, diretos e indiretos.
Só biblioteca padrão. Uso: python3 gerar_leiloes.py <pasta de saída>"""
import json, sys, time, urllib.request, datetime

BASE = 'https://www.treasurydirect.gov/TA_WS/securities/'
LONGOS = ('Note', 'Bond', 'TIPS', 'FRN')
UA = {'User-Agent': 'Mozilla/5.0 (MercadoMacro robo de leiloes)', 'Accept': 'application/json'}


def pedir(caminho, tentativas=5):
    url = BASE + caminho
    for i in range(tentativas):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as r:
                j = json.loads(r.read().decode('utf-8'))
            if not isinstance(j, list):
                raise RuntimeError('resposta sem lista')
            return j
        except Exception as e:
            print(f'  tentativa {i + 1} em {caminho}: {str(e)[:200]}')
            time.sleep(10 * (i + 1))
    raise SystemExit(f'TreasuryDirect não respondeu: {caminho}')


def num(v):
    try:
        x = float(str(v).replace(',', ''))
        return x
    except Exception:
        return None


def data(v):
    v = str(v or '')[:10]
    return v if len(v) == 10 and v[4] == '-' else None


def tipo(r):
    t = (r.get('type') or r.get('securityType') or '').strip()
    if t == 'Bill' and r.get('cashManagementBill') == 'Yes':
        return 'CMB'
    return t


def leilao(r):
    d = data(r.get('competitiveAuctionCloseDate')) or data(r.get('auctionDate'))
    t = tipo(r)
    if not d or not t:
        return None
    if t in ('Bill', 'CMB'):
        taxa, kind = num(r.get('highRate')), 'desconto'
    elif t == 'FRN':
        taxa, kind = num(r.get('highDiscountMargin')), 'margem'
    else:
        taxa, kind = num(r.get('highYield')), 'yield'
    pd = num(r.get('primaryDealersCompetitiveParAwarded'))
    di = num(r.get('directBiddersCompetitiveParAwarded'))
    ind = num(r.get('indirectBiddersCompetitiveParAwarded'))
    comp = sum(x for x in (pd, di, ind) if x is not None) if None not in (pd, di, ind) else None
    parte = lambda x: round(x / comp * 100, 1) if comp and x is not None else None
    btc = num(r.get('bidToCoverRatio'))
    if taxa is None and btc is None:
        return None  # ainda sem resultado
    pdf = r.get('treasuryAuctionResultsPressReleaseFileName') or ''
    return {
        'd': d, 'tipo': t, 'prazo': (r.get('securityTerm') or '').strip(),
        'orig': (r.get('originalSecurityTerm') or r.get('securityTerm') or '').strip(),
        'reab': r.get('reopening') == 'Yes', 'cusip': r.get('cusip'),
        'taxa': taxa, 'kind': kind, 'btc': btc,
        'oferta': num(r.get('offeringAmount')),
        'pd': parte(pd), 'dir': parte(di), 'ind': parte(ind),
        'pdf': pdf if pdf.endswith('.pdf') else None,
    }


def main(saida):
    hoje = datetime.date.today()
    vistos, lista = set(), []
    # títulos de prazo longo: 2 anos de histórico (para comparar com os leilões anteriores do mesmo prazo)
    # as letras curtas (Bills) ficam de fora: saem várias por semana e pouco mexem com o mercado
    for t, dias in (('Note', 760), ('Bond', 760), ('TIPS', 760), ('FRN', 760)):
        rs = pedir(f'auctioned?format=json&type={t}&days={dias}')
        print(t, len(rs))
        for r in rs:
            x = leilao(r)
            if not x:
                continue
            k = (x['d'], x['cusip'], x['tipo'])
            if k in vistos:
                continue
            vistos.add(k)
            lista.append(x)
    lista.sort(key=lambda x: (x['d'], x['tipo'], x['prazo']), reverse=True)
    longos = [x for x in lista if x['tipo'] in LONGOS]
    if len(longos) < 20:
        raise SystemExit(f'Poucos leilões de títulos longos ({len(longos)}); arquivo mantido')
    prox = []
    for r in pedir('upcoming?format=json'):
        d = data(r.get('competitiveAuctionCloseDate')) or data(r.get('auctionDate'))
        if not d or d < hoje.isoformat() or tipo(r) not in LONGOS:
            continue
        prox.append({'d': d, 'anuncio': data(r.get('announcementDate')), 'tipo': tipo(r), 'prazo': (r.get('securityTerm') or '').strip(),
                     'orig': (r.get('originalSecurityTerm') or r.get('securityTerm') or '').strip(),
                     'reab': r.get('reopening') == 'Yes', 'oferta': num(r.get('offeringAmount'))})
    prox.sort(key=lambda x: (x['d'], x['tipo'], x['prazo']))
    out = {'fonte': 'TreasuryDirect (U.S. Department of the Treasury)', 'gerado': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%MZ'),
           'leiloes': lista, 'proximos': prox}
    with open(f'{saida}/leiloes.json', 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print('Leilões:', len(lista), '| longos:', len(longos), '| próximos:', len(prox))
    for x in longos[:8]:
        print(' ', x)
    for x in prox[:8]:
        print('  próx', x)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
