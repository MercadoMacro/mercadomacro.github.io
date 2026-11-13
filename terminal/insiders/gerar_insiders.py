#!/usr/bin/env python3
"""Radar de insiders: compras e vendas de ações das empresas da B3 pelos próprios controladores e administradores.

Fonte: CVM, Dados Abertos, "Valores Mobiliários Negociados e Detidos" (art. 11 da Resolução CVM 44), licença ODbL.
Cada empresa entrega até o dia 10 o formulário do mês anterior; a CVM atualiza a base toda semana.

Regras (para não distorcer):
- só compra à vista e venda à vista de ações e units da própria empresa (Tipo_Empresa = Companhia); ficam de fora
  saldo inicial, empréstimos, planos de remuneração, subscrições, posse e desligamento, transferências;
- de cada formulário vale só a versão mais recente (empresas reenviam com correções);
- linhas idênticas no mesmo formulário (mesma pessoa/cargo, dia, quantidade e preço) contam uma vez;
- só empresas com ação negociada em bolsa (código de negociação no FCA da CVM);
- a recompra da própria empresa (tesouraria) não está nessa base e não entra.

Grupos de cargo: 'ctl' = controlador ou vinculado; 'adm' = conselho de administração, diretoria, conselho fiscal e
outros órgãos estatutários (e vinculados).

Uso: python3 terminal/insiders/gerar_insiders.py terminal/insiders [terminal/fundamentos/index.json]
Grava insiders.json. Valores em R$ mil (inteiros).
"""
import csv, io, json, os, re, sys, time, urllib.request, zipfile
from collections import defaultdict
from datetime import datetime, timezone

PASTA = sys.argv[1] if len(sys.argv) > 1 else 'insiders'
FUND = sys.argv[2] if len(sys.argv) > 2 else None
ANO_INI = 2021
BASE = 'https://dados.cvm.gov.br/dados/CIA_ABERTA'
UA = {'User-Agent': 'Mozilla/5.0 (compatible; MercadoMacro/1.0; +https://mercadomacro.com.br)'}
OPS_MIN = 1000  # lista de operações: só a partir de R$ 1 milhão (em R$ mil)
OPS_MESES = 3


def baixar(url, tentativas=4):
    for i in range(tentativas):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return r.read()
        except Exception as e:
            if i == tentativas - 1:
                raise
            print('  de novo:', url, e)
            time.sleep(5 * (i + 1))


def csv_do_zip(dados, nome):
    with zipfile.ZipFile(io.BytesIO(dados)) as z:
        with z.open(nome) as f:
            return list(csv.DictReader(io.TextIOWrapper(f, encoding='latin1'), delimiter=';'))


def num(s):
    try:
        return float(str(s).replace(',', '.'))
    except Exception:
        return None


def grupo_cargo(c):
    c = (c or '').lower()
    if c.startswith('controlador'):
        return 'ctl'
    if c:
        return 'adm'
    return None


CARGO_CURTO = {'controlador': 'Controlador', 'conselho de administração': 'Conselho de adm.', 'diretor': 'Diretoria',
               'conselho fiscal': 'Conselho fiscal', 'órgão estatutário': 'Órgão estatutário'}


def cargo_curto(c):
    c = (c or '').lower()
    for k, v in CARGO_CURTO.items():
        if c.startswith(k):
            return v
    return 'Outro'


def setor_limpo(s):
    s = (s or '').strip()
    s = re.sub(r'^Emp\. Adm\. Part\.? ?- ?', '', s)
    if not s or s in ('Sem Setor Principal', 'Emp. Adm. Participações'):
        return 'Holdings e participações'
    return {'Const. Civil, Mat. Const. e Decoração': 'Construção Civil, Mat. Constr. e Decoração',
            'Máqs., Equip., Veíc. e Peças': 'Máquinas, Equipamentos, Veículos e Peças'}.get(s, s)


def tickers_fca(ano):
    """CNPJ -> códigos de negociação em bolsa (ações e units ainda negociadas), do FCA mais recente."""
    out = {}
    for a in (ano, ano - 1):
        try:
            z = baixar(f'{BASE}/DOC/FCA/DADOS/fca_cia_aberta_{a}.zip')
        except Exception as e:
            print('FCA', a, 'indisponível:', e)
            continue
        linhas = csv_do_zip(z, f'fca_cia_aberta_valor_mobiliario_{a}.csv')
        ver = {}
        for l in linhas:
            k = l['CNPJ_Companhia']
            ver[k] = max(ver.get(k, 0), int(l['Versao'] or 0))
        for l in linhas:
            k, cod = l['CNPJ_Companhia'], (l.get('Codigo_Negociacao') or '').strip().upper()
            if k in out or int(l['Versao'] or 0) != ver[k]:
                continue
            if l.get('Mercado') != 'Bolsa' or (l.get('Data_Fim_Negociacao') or '').strip() or not re.fullmatch(r'[A-Z]{4}\d{1,2}', cod):
                continue
            out.setdefault('_tmp_' + k, []).append(cod)
        for k in [x for x in out if x.startswith('_tmp_')]:
            out[k[5:]] = sorted(set(out.pop(k)), key=lambda c: (not c.endswith('3'), not c.endswith('4'), not c.endswith('11'), c))
    return out


def ibov_mensal():
    """Fechamento mensal do Ibovespa (Yahoo); se falhar, o gráfico fica sem a linha."""
    try:
        j = json.loads(baixar('https://query1.finance.yahoo.com/v8/finance/chart/%5EBVSP?interval=1mo&range=10y'))
        r = j['chart']['result'][0]
        out = {}
        for t, c in zip(r['timestamp'], r['indicators']['quote'][0]['close']):
            if c is not None:
                out[datetime.fromtimestamp(t + 12 * 3600, timezone.utc).strftime('%Y-%m')] = round(c)
        return out
    except Exception as e:
        print('Ibovespa indisponível:', e)
        return {}


def main():
    hoje = datetime.now(timezone.utc)
    os.makedirs(PASTA, exist_ok=True)
    fund = {}
    if FUND and os.path.exists(FUND):
        for e in json.load(open(FUND, encoding='utf-8')).get('empresas', []):
            fund[str(e.get('cvm'))] = e
    cad = {}
    try:
        for l in csv.DictReader(io.StringIO(baixar(f'{BASE}/CAD/DADOS/cad_cia_aberta.csv').decode('latin1')), delimiter=';'):
            cad[l['CNPJ_CIA']] = l
    except Exception as e:
        print('cadastro indisponível:', e)
    tick = tickers_fca(hoje.year)
    print('empresas com código em bolsa:', len(tick))

    docs, linhas = {}, []
    for ano in range(ANO_INI, hoje.year + 1):
        z = baixar(f'{BASE}/DOC/VLMO/DADOS/vlmo_cia_aberta_{ano}.zip')
        for d in csv_do_zip(z, f'vlmo_cia_aberta_{ano}.csv'):
            docs[d['CNPJ_Companhia']] = d.get('Codigo_CVM') or docs.get(d['CNPJ_Companhia'])
        l = csv_do_zip(z, f'vlmo_cia_aberta_con_{ano}.csv')
        print(ano, len(l), 'linhas')
        linhas += l

    # versão mais recente de cada formulário (empresa + mês)
    ver = defaultdict(int)
    for l in linhas:
        k = (l['CNPJ_Companhia'], l['Data_Referencia'])
        ver[k] = max(ver[k], int(l['Versao'] or 0))
    # quantas empresas entregaram em cada mês (para saber se o último mês ainda está chegando)
    entregas = defaultdict(set)
    for (cnpj, ref) in ver:
        entregas[ref[:7]].add(cnpj)

    vistos, mov = set(), []
    for l in linhas:
        if int(l['Versao'] or 0) != ver[(l['CNPJ_Companhia'], l['Data_Referencia'])]:
            continue
        if l['Tipo_Empresa'] != 'Companhia' or l['Tipo_Ativo'] not in ('Ações', 'Units'):
            continue
        tm = l['Tipo_Movimentacao']
        if tm not in ('Compra à vista', 'Venda à vista'):
            continue
        g = grupo_cargo(l['Tipo_Cargo'])
        if not g or l['CNPJ_Companhia'] not in tick:
            continue
        q, p = num(l['Quantidade']), num(l['Preco_Unitario'])
        vol = num(l['Volume'])
        if vol is None and q and p:
            vol = q * p
        if not vol or vol <= 0:
            continue
        chave = (l['CNPJ_Companhia'], l['Data_Referencia'], l['Tipo_Cargo'], l['Data_Movimentacao'], tm, l['Quantidade'], l['Preco_Unitario'], l['Caracteristica_Valor_Mobiliario'])
        if chave in vistos:
            continue
        vistos.add(chave)
        mov.append({'cnpj': l['CNPJ_Companhia'], 'nome': l['Nome_Companhia'], 'mes': l['Data_Referencia'][:7], 'g': g, 'cargo': cargo_curto(l['Tipo_Cargo']),
                    'compra': tm.startswith('Compra'), 'vol': vol / 1000, 'q': q, 'p': p, 'dia': (l['Data_Movimentacao'] or '')[:10],
                    'classe': (l['Caracteristica_Valor_Mobiliario'] or '').strip()[:12]})
    print('operações válidas:', len(mov))

    meses = sorted({m['mes'] for m in mov})
    ultimo = max(entregas)
    if ultimo not in meses:
        meses.append(ultimo)
    # meses sem operação no meio também aparecem (barra zero)
    a, b = meses[0], meses[-1]
    todos, y, mth = [], int(a[:4]), int(a[5:])
    while f'{y:04d}-{mth:02d}' <= b:
        todos.append(f'{y:04d}-{mth:02d}')
        mth += 1
        if mth > 12:
            y, mth = y + 1, 1
    meses = todos
    idx = {m: i for i, m in enumerate(meses)}
    ant = sorted(entregas)[-7:-1]
    base_ent = sorted(len(entregas[m]) for m in ant)[len(ant) // 2] if ant else 0
    parciais = [m for m in meses[-2:] if base_ent and len(entregas.get(m, ())) < 0.85 * base_ent]

    empresas, eidx, setores, sidx = [], {}, [], {}
    for m in mov:
        k = m['cnpj']
        if k in eidx:
            continue
        cvm = str(int(docs.get(k) or 0)) if docs.get(k) else ''
        f = fund.get(cvm, {})
        setor = setor_limpo(f.get('setor') or cad.get(k, {}).get('SETOR_ATIV'))
        if setor not in sidx:
            sidx[setor] = len(setores)
            setores.append(setor)
        nome = (cad.get(k, {}).get('DENOM_COMERC') or '').strip() or m['nome']
        eidx[k] = len(empresas)
        empresas.append({'n': re.sub(r'\s+', ' ', nome).strip()[:60], 't': tick[k][:4], 's': sidx[setor], 'cvm': cvm, 'm': {}})

    tot = {'ctl': [[0, 0] for _ in meses], 'adm': [[0, 0] for _ in meses]}
    for m in mov:
        i, e = idx[m['mes']], empresas[eidx[m['cnpj']]]
        col = (0 if m['compra'] else 1) + (0 if m['g'] == 'ctl' else 2)
        v = e['m'].setdefault(str(i), [0, 0, 0, 0])
        v[col] += m['vol']
        tot[m['g']][i][0 if m['compra'] else 1] += m['vol']
    for e in empresas:
        e['m'] = {k: [round(x) for x in v] for k, v in e['m'].items() if any(round(x) for x in v)}
    for g in tot:
        tot[g] = [[round(c), round(v)] for c, v in tot[g]]

    corte = meses[-OPS_MESES] if len(meses) >= OPS_MESES else meses[0]
    ops = sorted((m for m in mov if m['mes'] >= corte and m['vol'] >= OPS_MIN), key=lambda m: (m['dia'], m['vol']), reverse=True)[:400]
    ops = [[eidx[m['cnpj']], m['cargo'], 'C' if m['compra'] else 'V', m['dia'], round(m['q'] or 0), round(m['p'] or 0, 2), round(m['vol']), m['classe']] for m in ops]

    ib = ibov_mensal()
    out = {
        'gerado': hoje.strftime('%Y-%m-%dT%H:%M:%SZ'),
        'fonte': 'CVM, Dados Abertos: Valores Mobiliários Negociados e Detidos (Resolução CVM 44), licença ODbL',
        'unidade': 'R$ mil',
        'meses': meses,
        'parciais': parciais,
        'entregas': [len(entregas.get(m, ())) for m in meses],
        'ibov': [ib.get(m) for m in meses],
        'tot': tot,
        'setores': setores,
        'emp': empresas,
        'ops': ops,
    }
    arq = os.path.join(PASTA, 'insiders.json')
    with open(arq, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print('gravado', arq, os.path.getsize(arq) // 1024, 'KB;', len(empresas), 'empresas;', meses[0], 'a', meses[-1], '; parciais', parciais)


if __name__ == '__main__':
    main()
