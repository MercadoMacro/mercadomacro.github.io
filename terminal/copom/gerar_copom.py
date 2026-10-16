#!/usr/bin/env python3
"""Probabilidades do Copom: grava terminal/copom/copom.json.

Fonte da curva: arquivo diário de Taxas de Swap da B3 (TS<aammdd>.ex_, curva "DI x pré"),
o mesmo que a B3 usa para marcar os contratos de DI futuro. Cada vértice traz dias corridos,
dias úteis e a taxa (base 252).

Conta: o fator de desconto da curva dá a taxa a termo entre duas datas. A taxa a termo entre
uma reunião e a seguinte é o CDI que o mercado espera depois daquela reunião; a diferença
para o período anterior é a mudança esperada da Selic. A mudança vira chance entre os dois
degraus de 0,25 ponto mais próximos, e as reuniões se somam numa árvore (como no FedWatch).

Selic meta (SGS 432) e CDI (SGS 4389) vêm do Banco Central. Só biblioteca padrão.
Nada inventado: dia sem arquivo da B3 fica de fora."""
import datetime as dt, io, json, math, os, sys, urllib.request, zipfile

UA = 'Mozilla/5.0 (MercadoMacro contato@mercadomacro.com.br)'
# Decisões do Copom (2º dia da reunião). Mesmo calendário de COPOM_DECISIONS em station/site/app.js;
# as passadas servem para o histórico (antes de uma reunião, a próxima era outra).
COPOM = ['2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-08-05', '2026-09-16',
         '2026-11-04', '2026-12-09',
         '2027-01-27', '2027-03-17', '2027-04-28', '2027-06-16', '2027-08-04', '2027-09-22', '2027-10-27', '2027-12-08']
PASSO = 0.25
DIAS_HIST = 30  # pregões guardados para "ontem", "1 semana" e o gráfico


def baixa(url, t=60, binario=False):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': '*/*'})
    with urllib.request.urlopen(req, timeout=t) as r:
        b = r.read()
    return b if binario else b.decode('utf-8', 'replace')


# ---------- calendário de dias úteis (feriados nacionais, como na ANBIMA) ----------
def pascoa(a):
    b, c = divmod(a, 100)
    d = (19 * (a % 19) + b - b // 4 - (b - (8 * b + 13) // 25 + 1) // 3 + 15) % 30
    e = (32 + 2 * (b % 4) + 2 * (c // 4) - d - c % 4) % 7
    f = d + e - 7 * ((a % 19 + 11 * d + 22 * e) // 451) + 114
    return dt.date(a, f // 31, f % 31 + 1)


_fer = {}


def feriados(a):
    if a not in _fer:
        p = pascoa(a)
        fs = {dt.date(a, 1, 1), p - dt.timedelta(48), p - dt.timedelta(47), p - dt.timedelta(2), dt.date(a, 4, 21),
              dt.date(a, 5, 1), p + dt.timedelta(60), dt.date(a, 9, 7), dt.date(a, 10, 12), dt.date(a, 11, 2),
              dt.date(a, 11, 15), dt.date(a, 12, 25)}
        if a >= 2024:
            fs.add(dt.date(a, 11, 20))
        _fer[a] = fs
    return _fer[a]


def util(d):
    return d.weekday() < 5 and d not in feriados(d.year)


def prox_util(d):
    d += dt.timedelta(1)
    while not util(d):
        d += dt.timedelta(1)
    return d


def du_entre(a, b):
    """dias úteis d com a <= d < b"""
    n, d = 0, a
    while d < b:
        if util(d):
            n += 1
        d += dt.timedelta(1)
    return n


# ---------- curva DI x pré da B3 ----------
def curva(dia):
    url = f'https://www.b3.com.br/pesquisapregao/download?filelist=TS{dia:%y%m%d}.ex_,'
    try:
        b = baixa(url, binario=True)
        z = zipfile.ZipFile(io.BytesIO(b))
        z2 = zipfile.ZipFile(io.BytesIO(z.read(z.namelist()[0])))
        txt = z2.read(z2.namelist()[0]).decode('latin1')
    except Exception:
        return None
    out = []
    for l in txt.splitlines():
        if l[21:24] != 'PRE' or 'DIxPRE' not in l[21:40] or 'Aj.' in l[21:45] or l[11:19] != f'{dia:%Y%m%d}':
            continue
        try:
            dc, du = int(l[41:46]), int(l[46:51])
            sinal = -1 if l[51] == '-' else 1
            taxa = sinal * int(l[52:66]) / 1e7
        except ValueError:
            continue
        out.append((du, dc, taxa))
    out.sort()
    return out or None


def fator(cv, du):
    """fator de capitalização (1+r)^(du/252) com interpolação flat-forward entre vértices"""
    if du <= 0:
        return 1.0
    pts = [(0, 1.0)] + [(v[0], (1 + v[2] / 100) ** (v[0] / 252)) for v in cv]
    for (d0, f0), (d1, f1) in zip(pts, pts[1:]):
        if d0 <= du <= d1:
            if d1 == d0:
                return f1
            return f0 * (f1 / f0) ** ((du - d0) / (d1 - d0))
    d0, f0 = pts[-2]
    d1, f1 = pts[-1]
    return f1 * (f1 / f0) ** ((du - d1) / (d1 - d0))


def termo(cv, du_a, du_b):
    if du_b <= du_a:
        return None
    return ((fator(cv, du_b) / fator(cv, du_a)) ** (252 / (du_b - du_a)) - 1) * 100


def probabilidades(cv, ref, reunioes):
    """taxa a termo entre reuniões, mudança esperada e árvore de chances (em degraus de 0,25 a partir da Selic atual)"""
    datas = [dt.date.fromisoformat(r) for r in reunioes if r > ref.isoformat()]
    if not datas:
        return []
    efet = [prox_util(d) for d in datas]  # a nova Selic vale a partir do dia útil seguinte à decisão
    max_du = cv[-1][0]
    marcos = [ref] + efet
    fwd = []
    for i in range(len(efet)):
        a = du_entre(ref, marcos[i])
        b = du_entre(ref, efet[i + 1]) if i + 1 < len(efet) else a + 42
        if b > max_du:
            break
        fwd.append(termo(cv, a, b))
    out, dist = [], {0: 1.0}
    for i in range(1, len(fwd)):
        delta = fwd[i] - fwd[i - 1]
        passos = delta / PASSO
        f = math.floor(passos)
        fr = passos - f
        nd = {}
        for s, p in dist.items():
            nd[s + f] = nd.get(s + f, 0) + p * (1 - fr)
            nd[s + f + 1] = nd.get(s + f + 1, 0) + p * fr
        dist = nd
        out.append({'data': datas[i - 1].isoformat(), 'antes': round(fwd[i - 1], 4), 'depois': round(fwd[i], 4),
                    'delta': round(delta * 100, 1),
                    'dist': {str(s): round(p * 100, 2) for s, p in sorted(dist.items()) if p >= 0.0005}})
    return out


def sgs(serie, n=5):
    j = json.loads(baixa(f'https://api.bcb.gov.br/dados/serie/bcdata.sgs.{serie}/dados/ultimos/{n}?formato=json'))
    return [{'data': '%s-%s-%s' % (x['data'][6:], x['data'][3:5], x['data'][:2]), 'v': float(x['valor'])} for x in j]


def main(pasta):
    hoje = (dt.datetime.utcnow() - dt.timedelta(hours=3)).date()
    # pregões recentes que têm arquivo da B3 (do mais novo para o mais antigo)
    hist, d, tent = [], hoje, 0
    while len(hist) < DIAS_HIST and tent < DIAS_HIST * 2:
        if util(d):
            cv = curva(d)
            tent += 1
            if cv:
                hist.append((d, cv))
        d -= dt.timedelta(1)
    if not hist:
        sys.exit('nenhum arquivo de taxas da B3 encontrado')
    # confere o calendário de dias úteis contra os vértices da B3
    d0, cv0 = hist[0]
    erros = [(du, dc) for du, dc, _ in cv0 if du_entre(d0, d0 + dt.timedelta(dc)) != du]
    print(f'curva de {d0}: {len(cv0)} vértices; dias úteis diferentes da B3 em {len(erros)}', erros[:5])
    if len(erros) > len(cv0) * 0.05:
        sys.exit('calendário de dias úteis não bate com a B3')
    selic_h = sgs(432, 400)
    selic = selic_h[-1]
    mudou = [x['data'] for i, x in enumerate(selic_h) if i and x['v'] != selic_h[i - 1]['v']]
    print('Selic', selic, 'últimas mudanças', mudou[-3:])
    cdi = sgs(4389, 3)[-1]
    selic_em = lambda dd: next((x['v'] for x in reversed(selic_h) if x['data'] <= dd), selic['v'])
    historico = []
    for d, cv in hist:
        r = probabilidades(cv, d, COPOM)
        if r:
            historico.append({'d': d.isoformat(), 'selic': selic_em(d.isoformat()), 'r': r})
    if not historico:
        sys.exit('sem reuniões futuras do Copom no calendário')
    out = {
        'gerado': dt.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
        'fonte': 'B3 (curva DI x pré das Taxas de Swap) e Banco Central (Selic meta e CDI)',
        'curva_dia': hist[0][0].isoformat(),
        'selic': selic, 'cdi': cdi,
        'reunioes': [x for x in COPOM if x > hist[0][0].isoformat()],
        'passadas': [x for x in COPOM if x <= hoje.isoformat()][-3:],
        'curva': [[du, round(t, 4)] for du, _, t in cv0 if du <= 800],
        'historico': historico,
    }
    os.makedirs(pasta, exist_ok=True)
    with open(os.path.join(pasta, 'copom.json'), 'w') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    r0 = historico[0]['r'][0]
    print(len(historico), 'pregões; próxima reunião', r0['data'], 'mudança esperada', r0['delta'], 'bp', r0['dist'])


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'terminal/copom')
