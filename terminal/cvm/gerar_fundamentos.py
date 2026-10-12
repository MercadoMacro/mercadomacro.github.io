#!/usr/bin/env python3
"""
Gera os JSON da aba Fundamentos do Mercado Macro a partir dos dados abertos da CVM.

Fontes (gratuitas, licença ODbL): https://dados.cvm.gov.br
  - DFP (balanços anuais) ........ /dados/CIA_ABERTA/DOC/DFP/DADOS/dfp_cia_aberta_<ano>.zip
  - ITR (balanços trimestrais) ... /dados/CIA_ABERTA/DOC/ITR/DADOS/itr_cia_aberta_<ano>.zip
  - FCA (tickers, setor) ......... /dados/CIA_ABERTA/DOC/FCA/DADOS/fca_cia_aberta_<ano>.zip

Saída (pasta fundamentos/):
  - index.json ........ lista das empresas com ticker na B3 e os números principais (12 meses)
  - <codigo_cvm>.json . histórico anual, últimos 12 meses e último balanço de cada empresa

Só usa a biblioteca padrão do Python (roda no GitHub Actions sem instalar nada).
Uso: python3 gerar_fundamentos.py [pasta_de_saida] [--local pasta_com_zips]
Regra do site: nada inventado. Conta que não existe no balanço vira null (o site mostra "—").
"""
import csv, io, json, os, re, sys, time, unicodedata, urllib.request, zipfile
from datetime import date, datetime, timezone

BASE = 'https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC'
ANOS_DFP = 6          # anos de balanço anual guardados por empresa
csv.field_size_limit(10_000_000)


def norm(s):
    s = unicodedata.normalize('NFKD', str(s or '')).encode('ascii', 'ignore').decode()
    return re.sub(r'\s+', ' ', s).strip().upper()


def baixar(url, local_dir=None, tentativas=4):
    nome = url.rsplit('/', 1)[-1]
    if local_dir:
        p = os.path.join(local_dir, nome)
        if os.path.exists(p):
            with open(p, 'rb') as f:
                return f.read()
        return None
    for i in range(tentativas):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'MercadoMacro-fundamentos/1.0'})
            with urllib.request.urlopen(req, timeout=180) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            erro = e
        except Exception as e:  # rede
            erro = e
        time.sleep(2 ** (i + 1))
    print(f'  falhou: {url} ({erro})', file=sys.stderr)
    return None


def ler_csv(zbytes, padrao):
    """Linhas (dict com chaves normalizadas) do CSV do zip cujo nome casa com o padrão."""
    if not zbytes:
        return
    with zipfile.ZipFile(io.BytesIO(zbytes)) as z:
        nomes = [n for n in z.namelist() if re.search(padrao, n, re.I)]
        for n in nomes:
            with z.open(n) as f:
                txt = io.TextIOWrapper(f, encoding='latin-1', newline='')
                rd = csv.reader(txt, delimiter=';')
                cab = None
                for row in rd:
                    if cab is None:
                        cab = [norm(c).replace(' ', '_') for c in row]
                        continue
                    yield dict(zip(cab, row))


def num(s):
    try:
        return float(str(s).replace(',', '.'))
    except Exception:
        return None


def digitos(s):
    return re.sub(r'\D', '', str(s or ''))


# ---------------------------------------------------------------- demonstrações
def carregar_demos(zbytes, prefixo, so_ultimo_doc=False):
    """
    Lê DRE, BPA, BPP e DFC (consolidado; individual só para quem não tem consolidado).
    Retorna {cnpj: {dt_refer: {'versao', 'denom', 'cvm', 'contas': {(demo, ordem, ini, fim, cod): (desc, valor)}}}}
    """
    out = {}
    for demo, pad in (('DRE', 'DRE'), ('BPA', 'BPA'), ('BPP', 'BPP'), ('DFC', 'DFC_M[ID]')):
        for tipo in ('con', 'ind'):
            for r in ler_csv(zbytes, rf'{prefixo}_cia_aberta_{pad}_{tipo}_\d{{4}}\.csv$'):
                cnpj = digitos(r.get('CNPJ_CIA'))
                dt = r.get('DT_REFER', '')
                if not cnpj or not dt:
                    continue
                ver = int(num(r.get('VERSAO')) or 0)
                emp = out.setdefault(cnpj, {})
                doc = emp.get(dt)
                if doc is None or ver > doc['versao']:
                    doc = emp[dt] = {'versao': ver, 'denom': r.get('DENOM_CIA', ''), 'cvm': digitos(r.get('CD_CVM')).lstrip('0'),
                                     'tipo': {}, 'contas': {}}
                elif ver < doc['versao']:
                    continue
                # consolidado manda: se o documento já tem consolidado desta demonstração, ignora o individual
                t = doc['tipo'].setdefault(demo, tipo)
                if t != tipo:
                    if t == 'ind' and tipo == 'con':
                        doc['contas'] = {k: v for k, v in doc['contas'].items() if k[0] != demo}
                        doc['tipo'][demo] = 'con'
                    else:
                        continue
                v = num(r.get('VL_CONTA'))
                if v is None:
                    continue
                if norm(r.get('ESCALA_MOEDA')) == 'MIL':
                    v *= 1000
                ordem = 'U' if norm(r.get('ORDEM_EXERC')).startswith('ULT') else 'P'
                k = (demo, ordem, r.get('DT_INI_EXERC', ''), r.get('DT_FIM_EXERC', ''), r.get('CD_CONTA', ''))
                doc['contas'][k] = (norm(r.get('DS_CONTA')), v)
    return out


def recorte(contas, demo, ordem, ytd=True):
    """{codigo: (desc, valor)} de uma demonstração; na DRE/DFC escolhe o período acumulado no ano (início mais antigo)."""
    linhas = [(k, v) for k, v in contas.items() if k[0] == demo and k[1] == ordem]
    if not linhas:
        return {}
    if demo in ('DRE', 'DFC'):
        inis = sorted({k[2] for k, _ in linhas if k[2]})
        if inis:
            alvo = inis[0] if ytd else inis[-1]
            linhas = [(k, v) for k, v in linhas if k[2] == alvo]
    return {k[4]: v for k, v in linhas}


def nivel(cod):
    return cod.count('.') + 1


def filhos(d, pai, nv=None):
    return {c: v for c, v in d.items() if c.startswith(pai + '.') and (nv is None or nivel(c) == nv)}


def metricas(dre, bpa, bpp, dfc, financeira):
    m = {}
    g = lambda d, c: d.get(c, (None, None))[1]
    m['receita'] = g(dre, '3.01')
    ebit = None
    if not financeira and '3.05' in dre and 'ANTES DO RESULTADO FINANCEIRO' in dre['3.05'][0]:
        ebit = dre['3.05'][1]
    m['ebit'] = ebit
    # lucro líquido: última conta de nível 2 "Lucro/Prejuízo ... do Período/Exercício"; parte dos controladores se houver
    cand = sorted((c for c, (ds, _) in dre.items() if nivel(c) == 2 and 'LUCRO' in ds and ('PERIODO' in ds or 'EXERCICIO' in ds)),
                  key=lambda c: int(c.split('.')[1]))
    lucro = lucro_tot = None
    if cand:
        c = cand[-1]
        lucro_tot = dre[c][1]
        lucro = lucro_tot
        for cc, (ds, v) in filhos(dre, c, 3).items():
            if 'CONTROLADOR' in ds and 'NAO CONTROLADOR' not in ds:
                lucro = v
                break
    m['lucro'] = lucro
    m['lucro_total'] = lucro_tot
    dep = [abs(v) for c, (ds, v) in dfc.items() if c.startswith('6.01.01.') and ('DEPRECIA' in ds or 'AMORTIZA' in ds or 'EXAUST' in ds)]
    m['ebitda'] = (ebit + sum(dep)) if (ebit is not None and dep) else None
    m['ativo'] = g(bpa, '1')
    pl = plnc = None
    for c, (ds, v) in bpp.items():
        if nivel(c) == 2 and ds.startswith('PATRIMONIO LIQUIDO'):
            pl = v
            for cc, (ds2, v2) in filhos(bpp, c).items():
                if 'NAO CONTROLADOR' in ds2 and nivel(cc) == 3:
                    plnc = v2
            break
    m['pl'] = (pl - (plnc or 0)) if pl is not None else None
    if financeira:
        m['caixa'] = m['divida'] = m['div_liq'] = None
    else:
        cx = [v for c, (ds, v) in filhos(bpa, '1.01', 3).items() if 'CAIXA E EQUIVALENTES' in ds or 'APLICACOES FINANCEIRAS' in ds]
        dv = [v for c, (ds, v) in list(filhos(bpp, '2.01', 3).items()) + list(filhos(bpp, '2.02', 3).items()) if 'EMPRESTIMOS E FINANCIAMENTOS' in ds]
        m['caixa'] = sum(cx) if cx else None
        m['divida'] = sum(dv) if dv else (0.0 if bpp else None)
        m['div_liq'] = (m['divida'] - m['caixa']) if (m['divida'] is not None and m['caixa'] is not None) else None
    m['fco'] = g(dfc, '6.01')
    prov = [abs(v) for c, (ds, v) in filhos(dfc, '6.03', 3).items() if v < 0 and ('DIVIDENDO' in ds or 'JUROS SOBRE' in ds)]
    m['proventos'] = sum(prov) if prov else (0.0 if dfc else None)
    return {k: (round(v) if isinstance(v, float) else v) for k, v in m.items()}


FLUXO = ('receita', 'ebit', 'ebitda', 'lucro', 'lucro_total', 'fco', 'proventos')   # somam no tempo
ESTOQUE = ('ativo', 'pl', 'caixa', 'divida', 'div_liq')                              # foto do balanço


# ---------------------------------------------------------------- cadastro (FCA)
def cadastro(zfca):
    emp, tick = {}, {}
    for r in ler_csv(zfca, r'fca_cia_aberta_geral_\d{4}\.csv$'):
        cnpj = digitos(r.get('CNPJ_COMPANHIA'))
        if cnpj:
            emp[cnpj] = {'nome': r.get('NOME_EMPRESARIAL', ''), 'setor': r.get('SETOR_ATIVIDADE', ''),
                         'cvm': digitos(r.get('CODIGO_CVM')).lstrip('0')}
    for r in ler_csv(zfca, r'fca_cia_aberta_valor_mobiliario_\d{4}\.csv$'):
        cnpj = digitos(r.get('CNPJ_COMPANHIA'))
        cod = (r.get('CODIGO_NEGOCIACAO') or '').strip().upper()
        if not cnpj or not re.fullmatch(r'[A-Z]{4}\d{1,2}', cod):
            continue
        if 'BOLSA' not in norm(r.get('MERCADO')) or (r.get('DATA_FIM_NEGOCIACAO') or '').strip():
            continue
        t = tick.setdefault(cnpj, {})
        t[cod] = {'segmento': r.get('SEGMENTO', '')}
    return emp, tick


def acoes(zbytes, prefixo):
    """{cnpj: (dt_refer, on, pn)} ações em circulação (total menos tesouraria) do documento mais recente."""
    out = {}
    for r in ler_csv(zbytes, rf'{prefixo}_cia_aberta_composicao_capital_\d{{4}}\.csv$'):
        cnpj = digitos(r.get('CNPJ_CIA'))
        dt = r.get('DT_REFER', '')
        on = (num(r.get('QT_ACAO_ORDIN_CAP_INTEGR')) or 0) - (num(r.get('QT_ACAO_ORDIN_TESOURO')) or 0)
        pn = (num(r.get('QT_ACAO_PREF_CAP_INTEGR')) or 0) - (num(r.get('QT_ACAO_PREF_TESOURO')) or 0)
        if cnpj and (on > 0 or pn > 0) and (cnpj not in out or dt >= out[cnpj][0]):
            out[cnpj] = (dt, int(on), int(pn))
    return out


# ---------------------------------------------------------------- principal
def main():
    args = sys.argv[1:]
    local = None
    if '--local' in args:
        i = args.index('--local'); local = args[i + 1]; del args[i:i + 2]
    saida = args[0] if args else 'fundamentos'
    os.makedirs(saida, exist_ok=True)
    hoje = date.today()
    anos = list(range(hoje.year - ANOS_DFP, hoje.year + 1))

    print('Baixando cadastro (FCA)…')
    zfca = baixar(f'{BASE}/FCA/DADOS/fca_cia_aberta_{hoje.year}.zip', local) or baixar(f'{BASE}/FCA/DADOS/fca_cia_aberta_{hoje.year - 1}.zip', local)
    if not zfca:
        sys.exit('Sem o cadastro FCA da CVM: nada foi gerado.')
    emp, tick = cadastro(zfca)
    print(f'  {len(emp)} empresas, {len(tick)} com ação na bolsa')

    anual = {}       # cnpj -> {ano: {'dt', 'm'}}
    nomes = {}
    qtd = {}
    for ano in anos:
        print(f'Baixando DFP {ano}…')
        z = baixar(f'{BASE}/DFP/DADOS/dfp_cia_aberta_{ano}.zip', local)
        if not z:
            continue
        for cnpj, docs in carregar_demos(z, 'dfp').items():
            if cnpj not in tick:
                continue
            for dt, doc in docs.items():
                nomes[cnpj] = (doc['denom'], doc['cvm'])
                fin = 'INTERMEDIACAO FINANCEIRA' in recorte(doc['contas'], 'DRE', 'U').get('3.01', ('', 0))[0] or \
                      re.search(r'BANCO|INTERMEDIA|SEGURADORA|PREVIDENCIA|ARRENDAMENTO', norm(emp.get(cnpj, {}).get('setor', ''))) is not None
                c = doc['contas']
                m = metricas(recorte(c, 'DRE', 'U'), recorte(c, 'BPA', 'U'), recorte(c, 'BPP', 'U'), recorte(c, 'DFC', 'U'), fin)
                anual.setdefault(cnpj, {})[int(dt[:4])] = {'dt': dt, 'm': m, 'fin': fin}
        for cnpj, v in acoes(z, 'dfp').items():
            if cnpj not in qtd or v[0] >= qtd[cnpj][0]:
                qtd[cnpj] = v

    trimestral = {}  # cnpj -> {'dt', 'cur', 'prev'}
    for ano in (hoje.year - 1, hoje.year):
        print(f'Baixando ITR {ano}…')
        z = baixar(f'{BASE}/ITR/DADOS/itr_cia_aberta_{ano}.zip', local)
        if not z:
            continue
        for cnpj, docs in carregar_demos(z, 'itr').items():
            if cnpj not in tick:
                continue
            dt = max(docs)
            if cnpj in trimestral and trimestral[cnpj]['dt'] >= dt:
                continue
            doc = docs[dt]
            nomes.setdefault(cnpj, (doc['denom'], doc['cvm']))
            c = doc['contas']
            fin = any(a.get('fin') for a in anual.get(cnpj, {}).values()) or \
                  'INTERMEDIACAO FINANCEIRA' in recorte(c, 'DRE', 'U').get('3.01', ('', 0))[0]
            cur = metricas(recorte(c, 'DRE', 'U'), recorte(c, 'BPA', 'U'), recorte(c, 'BPP', 'U'), recorte(c, 'DFC', 'U'), fin)
            prev = metricas(recorte(c, 'DRE', 'P'), {}, {}, recorte(c, 'DFC', 'P'), fin)
            trimestral[cnpj] = {'dt': dt, 'cur': cur, 'prev': prev}
        for cnpj, v in acoes(z, 'itr').items():
            if cnpj not in qtd or v[0] >= qtd[cnpj][0]:
                qtd[cnpj] = v

    gerado = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    indice = []
    escritos = set()
    for cnpj, tks in tick.items():
        a = anual.get(cnpj, {})
        t = trimestral.get(cnpj)
        if not a and not t:
            continue
        nome_doc, cvm = nomes.get(cnpj, ('', ''))
        cad = emp.get(cnpj, {})
        cvm = cvm or cad.get('cvm', '')
        if not cvm:
            continue
        ult_ano = max(a) if a else None
        # últimos 12 meses: acumulado do ano no ITR + ano anterior completo − mesmo período do ano anterior
        ttm, ref, balanco = None, None, None
        if t and (ult_ano is None or t['dt'] > a[ult_ano]['dt']):
            base = a.get(int(t['dt'][:4]) - 1)
            ref = t['dt']
            balanco = {k: t['cur'].get(k) for k in ESTOQUE}
            if base:
                ttm = {}
                for k in FLUXO:
                    x, y, z_ = t['cur'].get(k), base['m'].get(k), t['prev'].get(k)
                    ttm[k] = (x + y - z_) if None not in (x, y, z_) else None
        elif ult_ano is not None:
            ref = a[ult_ano]['dt']
            ttm = {k: a[ult_ano]['m'].get(k) for k in FLUXO}
            balanco = {k: a[ult_ano]['m'].get(k) for k in ESTOQUE}
        q = qtd.get(cnpj)
        # Algumas empresas informam a composição do capital em milhares de ações (o arquivo não diz a escala).
        # Se o patrimônio por ação passar de R$ 1.500 (nenhuma ação da B3 chega perto), a quantidade está em mil.
        pl_ref = (balanco or {}).get('pl')
        if q and pl_ref and pl_ref > 0 and (q[1] + q[2]) > 0 and pl_ref / (q[1] + q[2]) > 1500:
            q = (q[0], q[1] * 1000, q[2] * 1000)
        fin = any(x.get('fin') for x in a.values())
        lista_t = sorted(tks)
        doc = {
            'cvm': cvm, 'cnpj': cnpj, 'nome': cad.get('nome') or nome_doc, 'setor': cad.get('setor', ''),
            'segmento': next((v['segmento'] for v in tks.values() if v.get('segmento')), ''),
            'tickers': lista_t, 'financeira': fin,
            'acoes': {'ref': q[0], 'on': q[1], 'pn': q[2]} if q else None,
            'anos': [{'ano': y, 'ref': a[y]['dt'], **{k: a[y]['m'].get(k) for k in FLUXO + ESTOQUE}} for y in sorted(a)[-ANOS_DFP:]],
            'ttm': {'ref': ref, **(ttm or {})} if ttm else None,
            'balanco': {'ref': ref, **balanco} if balanco else None,
            'gerado': gerado,
            'fonte': 'CVM Dados Abertos (DFP, ITR e FCA), licença ODbL. Valores em R$.'
        }
        with open(os.path.join(saida, f'{cvm}.json'), 'w', encoding='utf-8') as f:
            json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
        escritos.add(f'{cvm}.json')
        tt = doc['ttm'] or {}
        bl = doc['balanco'] or {}
        indice.append({'cvm': cvm, 'nome': doc['nome'], 'setor': doc['setor'], 'tickers': lista_t, 'fin': fin,
                       'ref': ref, 'receita': tt.get('receita'), 'lucro': tt.get('lucro'), 'ebitda': tt.get('ebitda'),
                       'pl': bl.get('pl'), 'div_liq': bl.get('div_liq')})
    indice.sort(key=lambda e: -(e['receita'] or 0))
    with open(os.path.join(saida, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump({'gerado': gerado, 'fonte': 'CVM Dados Abertos, licença ODbL', 'empresas': indice}, f, ensure_ascii=False, separators=(',', ':'))
    # remove arquivos de empresas que saíram da bolsa
    for n in os.listdir(saida):
        if re.fullmatch(r'\d+\.json', n) and n not in escritos:
            os.remove(os.path.join(saida, n))
    print(f'Pronto: {len(indice)} empresas em {saida}/')
    if not indice:
        sys.exit('Nenhuma empresa gerada: confira se a CVM mudou o formato dos arquivos.')


if __name__ == '__main__':
    main()
