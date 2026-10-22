#!/usr/bin/env python3
"""Fluxo de investidores na B3 (estrangeiro, institucional, pessoa física...).

Fonte: Boletim Diário do Mercado (BDI) da B3, arquivo BDI_02 em PDF, tabela
"Participação dos investidores": compras e vendas acumuladas do início do mês até
o pregão de referência (a B3 publica com cerca de 2 pregões de atraso), em R$ mil.

O saldo de cada dia sai da diferença entre dois acumulados seguidos do mesmo mês
(no primeiro pregão do mês, o acumulado já é o próprio dia).

Primeiro tenta a mesma tabela em JSON, pelo serviço que alimenta o site do BDI
(arquivos.b3.com.br/bdi/table/SharesInvesVolum/<data>): sai horas antes do PDF e tem poucos KB.
Se não vier, lê o PDF (~40 MB), como antes.

Uso: python3 fluxo/gerar_fluxo.py fluxo [dias_para_tras]
Grava fluxo/fluxo.json. Nunca inventa número: dia sem boletim fica sem saldo.
"""
import json, os, re, subprocess, sys, tempfile, time, urllib.request
from datetime import date, datetime, timedelta

PASTA = sys.argv[1] if len(sys.argv) > 1 else 'fluxo'
DIAS_ATRAS = int(sys.argv[2]) if len(sys.argv) > 2 else 12
ARQ = os.path.join(PASTA, 'fluxo.json')
URL = 'https://arquivos.b3.com.br/bdi/download/bdi/{iso}/BDI_02_{ymd}.pdf'
TIPOS = {
    'Investidor Estrangeiro': 'estrangeiro',
    'Institucionais': 'institucional',
    'Investidores Individuais': 'pf',
    'Instituições Financeiras': 'if',
    'Outros': 'outros',
}
LINHA = re.compile(r'^\s*(' + '|'.join(re.escape(k) for k in TIPOS) + r')\s+([\d.]+)\s+([\d,]+)\s+([\d.]+)\s+([\d,]+)\s*$')
ATE = re.compile(r'Dados acumulados do in[ií]cio do m[eê]s at[eé] o dia (\d{2})/(\d{2})/(\d{4})')


def carrega():
    try:
        with open(ARQ, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def baixa(d):
    """PDF do boletim; None se a B3 diz que não existe (403/404). Falha de rede levanta erro."""
    url = URL.format(iso=d.isoformat(), ymd=d.strftime('%Y%m%d'))
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (MercadoMacro fluxo)'})
    for tentativa in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                if r.status != 200:
                    return None
                dados = r.read()
                return dados if dados[:4] == b'%PDF' else None
        except urllib.error.HTTPError as e:
            if e.code in (403, 404):
                return None
            erro = e
        except Exception as e:
            erro = e
        time.sleep(5 * (tentativa + 1))
    raise OSError(f'{url}: {erro}')


API = 'https://arquivos.b3.com.br/bdi/table/SharesInvesVolum/{iso}/{iso}/1/50'


def le_api(d):
    """Tabela "Participação dos investidores" do BDI de d, em JSON. Devolve (data_ref ISO, {tipo: [compras, vendas]}) ou None."""
    iso = d.isoformat()
    req = urllib.request.Request(API.format(iso=iso), data=b'{}', method='POST',
                                 headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (MercadoMacro fluxo)'})
    for tentativa in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                j = json.loads(r.read().decode('utf-8'))
            t = j.get('table') or {}
            texto = ' '.join((x.get('textPt') or '') for x in (t.get('texts') or []))
            m = ATE.search(texto)
            out = {}
            for row in t.get('values') or []:
                if len(row) >= 4 and row[0] in TIPOS and isinstance(row[1], (int, float)) and isinstance(row[3], (int, float)):
                    out[TIPOS[row[0]]] = [int(row[1]), int(row[3])]
            if not m or 'estrangeiro' not in out:
                return None
            return f'{m.group(3)}-{m.group(2)}-{m.group(1)}', out
        except Exception:
            time.sleep(5 * (tentativa + 1))
    return None


def le_tabela(pdf):
    """Devolve (data_ref ISO, {tipo: [compras, vendas]}) ou None."""
    with tempfile.TemporaryDirectory() as tmp:
        p = os.path.join(tmp, 'b.pdf')
        with open(p, 'wb') as f:
            f.write(pdf)
        txt = subprocess.run(['pdftotext', '-layout', p, '-'], capture_output=True, text=True, timeout=300).stdout
    m = ATE.search(txt)
    if not m:
        return None
    ref = f'{m.group(3)}-{m.group(2)}-{m.group(1)}'
    bloco = txt[m.end():m.end() + 4000].split('\n')
    out = {}
    for ln in bloco:
        r = LINHA.match(ln)
        if r:
            num = lambda s: int(s.replace('.', ''))
            out[TIPOS[r.group(1)]] = [num(r.group(2)), num(r.group(4))]
        elif out and not ln.strip():
            break
    if 'estrangeiro' not in out:
        return None
    return ref, out


def dias_uteis(ini, fim):
    d = ini
    while d <= fim:
        if d.weekday() < 5:
            yield d
        d += timedelta(days=1)


def main():
    base = carrega()
    acum = base.get('acum', {})            # data_ref -> {tipo: [compras, vendas]}
    lidos = set(base.get('boletins', []))  # datas de publicação já lidas (ou sem boletim)
    hoje = date.today()
    novos = 0
    for d in dias_uteis(hoje - timedelta(days=DIAS_ATRAS), hoje):
        iso = d.isoformat()
        if iso in lidos and d < hoje - timedelta(days=3):
            continue
        t = le_api(d)
        if t:
            lidos.add(iso)
            ref, tab = t
            if acum.get(ref) != tab:
                novos += 1
            acum[ref] = tab
            print(f'{iso}: (json) referente a {ref}, estrangeiro compras {tab["estrangeiro"][0]} vendas {tab["estrangeiro"][1]}')
            continue
        try:
            pdf = baixa(d)
        except OSError as e:
            # erro de rede não quer dizer que não houve boletim: o dia fica para a próxima passagem
            print(f'{iso}: falha ao baixar ({e})')
            continue
        if not pdf:
            print(f'{iso}: sem boletim')
            if d < hoje - timedelta(days=3):
                lidos.add(iso)
            continue
        t = le_tabela(pdf)
        lidos.add(iso)
        if not t:
            print(f'{iso}: tabela não encontrada')
            continue
        ref, tab = t
        if acum.get(ref) != tab:
            novos += 1
        acum[ref] = tab
        print(f'{iso}: referente a {ref}, estrangeiro compras {tab["estrangeiro"][0]} vendas {tab["estrangeiro"][1]}')

    # sem dado novo não grava (nem muda 'gerado'): dia marcado como lido sem boletim não gera commit
    if not novos:
        print('Nenhum acumulado novo; fluxo.json não foi alterado.')
        return

    # saldo diário: diferença entre acumulados seguidos do mesmo mês
    datas = sorted(acum)
    dias = []
    for i, d in enumerate(datas):
        ant = datas[i - 1] if i else None
        tipos = {}
        if ant and ant[:7] == d[:7]:
            for k, (c, v) in acum[d].items():
                if k in acum[ant]:
                    c0, v0 = acum[ant][k]
                    tipos[k] = [c - c0, v - v0]
        elif ant and (date.fromisoformat(d) - date.fromisoformat(ant)).days <= 5:
            # primeiro pregão do mês, logo depois do último do mês anterior: o acumulado é o próprio dia
            tipos = {k: list(cv) for k, cv in acum[d].items()}
        if tipos:
            dias.append({'data': d, 'tipos': {k: {'c': c, 'v': v, 'saldo': c - v} for k, (c, v) in tipos.items()}})

    # saldo do mês: último acumulado de cada mês
    meses = {}
    for d in datas:
        meses[d[:7]] = {'ate': d, 'tipos': {k: {'c': c, 'v': v, 'saldo': c - v} for k, (c, v) in acum[d].items()}}

    out = {
        'gerado': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
        'fonte': 'B3, Boletim Diário do Mercado (BDI), tabela Participação dos investidores',
        'unidade': 'R$ mil',
        'dias': dias[-260:],
        'meses': dict(sorted(meses.items())[-24:]),
        'acum': {d: acum[d] for d in datas[-300:]},
        'boletins': sorted(lidos)[-400:],
    }
    os.makedirs(PASTA, exist_ok=True)
    with open(ARQ, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{len(dias)} dias com saldo, {len(meses)} meses, {novos} acumulados novos ou mudados')


if __name__ == '__main__':
    main()
