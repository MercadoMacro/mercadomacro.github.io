#!/usr/bin/env python3
"""Curva de juros: grava terminal/curva/curva.json com a curva DI x pré da B3.

Fonte: arquivo diário de Taxas de Swap da B3 (TS<aammdd>.ex_, zip dentro de zip, TaxaSwap.txt),
a curva que a B3 usa para marcar os contratos de DI futuro. Cada vértice traz dias corridos,
dias úteis e a taxa (% ao ano, base 252). A B3 publica depois do pregão (à noite).
Guarda as curvas do último pregão, do anterior, de cerca de 1 semana e de 1 mês antes.
Só biblioteca padrão. Nada inventado: dia sem arquivo fica de fora."""
import datetime as dt, io, json, os, sys, urllib.request, zipfile

UA = 'Mozilla/5.0 (MercadoMacro contato@mercadomacro.com.br)'
MAX_DU = 252 * 11  # até uns 11 anos


def baixa(url, t=60):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': '*/*'})
    with urllib.request.urlopen(req, timeout=t) as r:
        return r.read()
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


# ---------- curva DI x pré da B3 ----------
def curva(dia):
    url = f'https://www.b3.com.br/pesquisapregao/download?filelist=TS{dia:%y%m%d}.ex_,'
    try:
        b = baixa(url)
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


def main(pasta):
    hoje = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date()
    achadas, d, tent = [], hoje, 0
    alvo_mes = None
    while tent < 45:
        if util(d):
            tent += 1
            cv = curva(d)
            if cv:
                achadas.append((d, cv))
                if alvo_mes is None:
                    alvo_mes = achadas[0][0] - dt.timedelta(30)
                if d <= alvo_mes:
                    break
        d -= dt.timedelta(1)
    if not achadas:
        sys.exit('nenhum arquivo de taxas da B3 encontrado')
    d0 = achadas[0][0]
    escolhe = lambda lim: next(((x, c) for x, c in achadas if x <= lim), None)
    sel = {'hoje': achadas[0], 'ontem': achadas[1] if len(achadas) > 1 else None,
           'semana': escolhe(d0 - dt.timedelta(7)), 'mes': escolhe(d0 - dt.timedelta(30))}
    out = {'gerado': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
           'fonte': 'B3, Taxas de Swap (curva DI x pré)', 'curvas': {}}
    for k, v in sel.items():
        if v:
            out['curvas'][k] = {'d': v[0].isoformat(), 'v': [[du, dc, round(t, 4)] for du, dc, t in v[1] if du <= MAX_DU]}
    os.makedirs(pasta, exist_ok=True)
    with open(os.path.join(pasta, 'curva.json'), 'w') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    for k, v in out['curvas'].items():
        print(k, v['d'], len(v['v']), 'vértices', v['v'][:2], v['v'][-1])


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'terminal/curva')
