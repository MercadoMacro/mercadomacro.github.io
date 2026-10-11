#!/usr/bin/env python3
"""Agenda de proventos (dividendos, JCP e rendimentos) das empresas da B3.

Roda pelo .github/workflows/proventos.yml e grava proventos/agenda.json.
  Valores e datas: B3 (página "Empresas listadas", proventos em dinheiro de cada empresa).
  Avisos: CVM, dados abertos IPE (documentos "Aviso aos Acionistas" sobre proventos), com link do documento.
As empresas são as da aba Fundamentos (fundamentos/index.json). Nada inventado: se a B3 não traz
a data de pagamento, ela fica vazia (o site mostra "a definir").
"""
import base64, csv, io, json, os, re, sys, time, unicodedata, urllib.request, zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone

SAIDA = sys.argv[1] if len(sys.argv) > 1 else 'proventos'
INDICE = sys.argv[2] if len(sys.argv) > 2 else 'fundamentos/index.json'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'
HOJE = datetime.now(timezone(timedelta(hours=-3))).date()
DESDE = HOJE - timedelta(days=120)
erros = []


def baixa(url, tempo=60):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json, text/plain, */*'})
    with urllib.request.urlopen(req, timeout=tempo) as r:
        return r.read()


def dmy(s):
    m = re.match(r'^\s*(\d{2})/(\d{2})/(\d{4})', str(s or ''))
    if not m:
        return None
    try:
        d = date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    except ValueError:
        return None
    return None if d.year >= 9999 else d


def num(s):
    t = str(s or '').strip().replace('.', '').replace(',', '.')
    try:
        return float(t)
    except ValueError:
        return None


def tipo_de(label):
    l = (label or '').upper()
    if 'JRS' in l or 'JUROS' in l:
        return 'JCP'
    if 'RENDIMENTO' in l:
        return 'Rendimento'
    if 'DIVIDENDO' in l:
        return 'Dividendo'
    return (label or '').strip().title() or 'Provento'


# ---------------------------------------------------------------- B3
B3 = 'https://sistemaswebb3-listados.b3.com.br/listedCompaniesProxy/CompanyCall/GetListedSupplementCompany/'


def b3_empresa(emp):
    codigo = emp['tickers'][0][:4]
    par = base64.b64encode(json.dumps({'issuingCompany': codigo, 'language': 'pt-br'}).encode()).decode()
    for tentativa in range(3):
        try:
            j = json.loads(baixa(B3 + par))
            break
        except Exception as e:
            if tentativa == 2:
                raise RuntimeError(f'{codigo}: {e}')
            time.sleep(2 + tentativa * 3)
    if isinstance(j, list):
        j = j[0] if j else {}
    tickers = set(emp['tickers'])
    saida = []
    for c in j.get('cashDividends') or []:
        data_com, pag, aprov = dmy(c.get('lastDatePrior')), dmy(c.get('paymentDate')), dmy(c.get('approvedOn'))
        valor = num(c.get('rate'))
        ref = max([d for d in (data_com, pag, aprov) if d] or [date.min])
        if ref < DESDE or valor is None or valor <= 0:
            continue
        # a B3 informa a espécie (ON, PN, UNT); o ticker é o da empresa com o final dessa espécie
        especie = (c.get('assetIssued') or '').strip()
        isin = (c.get('isinCode') or '').strip()
        tk = ticker_por_isin(isin, tickers, especie)
        saida.append({
            'tk': tk, 'cvm': emp['cvm'], 'emp': emp['nome'], 'tipo': tipo_de(c.get('label')), 'valor': round(valor, 8),
            'com': data_com.isoformat() if data_com else None, 'pag': pag.isoformat() if pag else None,
            'aprov': aprov.isoformat() if aprov else None, 'isin': isin or None,
            'obs': re.sub(r'\s+', ' ', (c.get('remarks') or '').strip())[:200] or None
        })
    return saida


def ticker_por_isin(isin, tickers, especie):
    # ISIN brasileiro: BR + 4 letras do emissor + 3 da espécie (ACN=ON, PRA=PNA, PRB=PNB, ACP? etc.)
    sufixo = {'ACN': '3', 'ACNOR': '3', 'PR': '4', 'PRA': '5', 'PRB': '6', 'PRC': '7', 'UNT': '11', 'CDA': '11'}
    s = isin[6:9] if len(isin) >= 9 else ''
    alvo = sufixo.get(s) or ('3' if s.startswith('AC') else '4' if s.startswith('PR') else None)
    e = especie.upper()
    if not alvo:
        alvo = '3' if 'ON' in e else '11' if 'UNT' in e else '4' if 'PN' in e else None
    for t in sorted(tickers):
        if alvo and t.endswith(alvo) and not t[:-len(alvo)][-1:].isdigit():
            return t
    return sorted(tickers)[0]


def b3(empresas):
    eventos, falhas = [], []
    with ThreadPoolExecutor(max_workers=4) as ex:
        for res in ex.map(lambda e: (e, _seguro(b3_empresa, e)), empresas):
            e, r = res
            if isinstance(r, Exception):
                falhas.append(str(r))
            else:
                eventos.extend(r)
    print(f'B3: {len(eventos)} proventos de {len(empresas) - len(falhas)} empresas ({len(falhas)} falharam)')
    if falhas:
        erros.append(f'B3: {len(falhas)} empresas falharam, ex.: {falhas[0]}')
    return eventos, len(empresas) - len(falhas)


def _seguro(f, *a):
    try:
        return f(*a)
    except Exception as e:
        return e


# ---------------------------------------------------------------- CVM (avisos)
def sem_acento(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s or '') if unicodedata.category(c) != 'Mn').lower()


PALAVRAS = re.compile(r'dividend|juros sobre (o )?capital|jcp|provento|rendimento|remuneracao aos acionistas')


def cvm(codigos):
    avisos = []
    for ano in sorted({HOJE.year, DESDE.year}):
        url = f'https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/IPE/DADOS/ipe_cia_aberta_{ano}.zip'
        try:
            z = zipfile.ZipFile(io.BytesIO(baixa(url, 180)))
        except Exception as e:
            erros.append(f'CVM IPE {ano}: {e}')
            continue
        for nome in z.namelist():
            if not nome.endswith('.csv'):
                continue
            txt = z.read(nome).decode('latin-1')
            for r in csv.DictReader(io.StringIO(txt), delimiter=';'):
                cod = str(int(r.get('Codigo_CVM') or 0))
                if cod not in codigos:
                    continue
                cat = sem_acento(r.get('Categoria'))
                texto = sem_acento(' '.join([r.get('Tipo') or '', r.get('Especie') or '', r.get('Assunto') or '']))
                if not (('aviso aos acionistas' in cat or 'fato relevante' in cat or 'comunicado ao mercado' in cat) and PALAVRAS.search(texto)):
                    continue
                d = (r.get('Data_Entrega') or '')[:10]
                if d < DESDE.isoformat():
                    continue
                avisos.append({'cvm': cod, 'data': d, 'cat': (r.get('Categoria') or '').strip(),
                               'assunto': re.sub(r'\s+', ' ', (r.get('Assunto') or r.get('Tipo') or '').strip())[:180],
                               'link': (r.get('Link_Download') or '').strip() or None})
    # um documento pode ter várias versões: fica a mais recente de cada assunto/dia
    vistos, unicos = set(), []
    for a in sorted(avisos, key=lambda a: a['data'], reverse=True):
        k = (a['cvm'], a['data'], a['assunto'])
        if k not in vistos:
            vistos.add(k)
            unicos.append(a)
    print(f'CVM: {len(unicos)} avisos de proventos')
    return unicos


if __name__ == '__main__':
    os.makedirs(SAIDA, exist_ok=True)
    with open(INDICE, encoding='utf-8') as f:
        empresas = [e for e in json.load(f)['empresas'] if e.get('tickers')]
    if os.environ.get('PROVENTOS_LIMITE'):
        empresas = empresas[:int(os.environ['PROVENTOS_LIMITE'])]
    eventos, ok_b3 = b3(empresas)
    avisos = _seguro(cvm, {str(int(e['cvm'])) for e in empresas})
    if isinstance(avisos, Exception):
        erros.append(f'CVM: {avisos}')
        avisos = []
    antigo = {}
    try:
        with open(os.path.join(SAIDA, 'agenda.json'), encoding='utf-8') as f:
            antigo = json.load(f)
    except Exception:
        pass
    # se a B3 falhou quase toda, mantém os proventos da última vez (não apaga a agenda por uma falha)
    if ok_b3 < len(empresas) * 0.5 and antigo.get('eventos'):
        erros.append('B3 respondeu para menos da metade das empresas: proventos da última rodada mantidos')
        eventos = antigo['eventos']
    if not avisos and antigo.get('avisos'):
        avisos = antigo['avisos']
    eventos.sort(key=lambda e: (e['com'] or e['pag'] or e['aprov'] or '', e['tk']), reverse=True)
    if not eventos and not avisos:
        print('Nada coletado; arquivo não alterado.')
    else:
        with open(os.path.join(SAIDA, 'agenda.json'), 'w', encoding='utf-8') as f:
            json.dump({'gerado': datetime.now(timezone.utc).isoformat(timespec='seconds'),
                       'fonte': 'B3 (proventos em dinheiro de cada empresa) e CVM (dados abertos IPE)',
                       'eventos': eventos, 'avisos': avisos}, f, ensure_ascii=False, separators=(',', ':'))
        print(f'agenda.json: {len(eventos)} proventos, {len(avisos)} avisos')
    for e in erros:
        print('AVISO:', e)
