#!/usr/bin/env python3
"""PIB dos EUA por componente (BEA, tabela NIPA T10102: contribuições para a variação do PIB real, em p.p.
anualizados) e a variação do PIB (T10101). Grava terminal/bea/bea.json para o bloco da aba Indicadores (área EUA).
A chave fica só no segredo BEA_API_KEY do GitHub. Só biblioteca padrão. Uso: python3 gerar_bea.py <pasta de saída>"""
import json, os, sys, time, urllib.request, urllib.parse, datetime

API = 'https://apps.bea.gov/api/data'
CHAVE = os.environ.get('BEA_API_KEY', '').strip()


def pedir(tabela, anos, tentativas=5, freq='Q'):
    q = {'UserID': CHAVE, 'method': 'GetData', 'DataSetName': 'NIPA', 'TableName': tabela, 'Frequency': freq, 'Year': ','.join(map(str, anos)), 'ResultFormat': 'JSON'}
    url = API + '?' + urllib.parse.urlencode(q)
    for i in range(tentativas):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'MercadoMacro/1.0'}), timeout=90) as r:
                j = json.loads(r.read().decode('utf-8'))
            res = j.get('BEAAPI', {}).get('Results', {})
            if isinstance(res, list):
                res = res[0] if res else {}
            if res.get('Error') or j.get('BEAAPI', {}).get('Error'):
                raise RuntimeError(str(res.get('Error') or j['BEAAPI']['Error'])[:300])
            return res
        except Exception as e:  # a API às vezes demora; tenta de novo sem mostrar a chave
            print(f'  tentativa {i + 1} em {tabela}: {str(e).replace(CHAVE, "***")[:300]}')
            time.sleep(15 * (i + 1))
    raise SystemExit(f'BEA não respondeu na tabela {tabela}')


def num(v):
    try:
        return float(str(v).replace(',', ''))
    except Exception:
        return None


def linhas(res):
    out = {}
    for it in res.get('Data', []):
        ln, tp, v = str(it.get('LineNumber')), it.get('TimePeriod'), num(it.get('DataValue'))
        if not tp or v is None:
            continue
        d = out.setdefault(ln, {'d': (it.get('LineDescription') or '').strip(), 'v': {}})
        d['v'][tp] = v
    return out


def antigo_familias(saida):
    try:
        return json.load(open(f'{saida}/bea.json', encoding='utf-8')).get('familias')
    except Exception:
        return None


def familias(anos):
    # tabela 2.6 (mensal): renda pessoal, renda disponível, consumo e taxa de poupança, em US$ bilhões na taxa anual
    # (a taxa de poupança em %). As linhas são escolhidas pela descrição, que a BEA mantém estável.
    tab = linhas(pedir('T20600', anos[-2:], freq='M'))
    for ln in sorted(tab, key=int):
        print('T20600', ln, tab[ln]['d'], list(tab[ln]['v'].items())[-1])
    def acha(teste):
        for ln in sorted(tab, key=int):
            if teste(tab[ln]['d'].lower().strip()):
                return tab[ln]['v']
        return None
    campos = {
        'renda': acha(lambda d: d == 'personal income'),
        'disponivel': acha(lambda d: d.endswith('disposable personal income') and 'chained' not in d and 'per capita' not in d),
        'consumo': acha(lambda d: d == 'personal consumption expenditures'),
        'poupanca': acha(lambda d: d.startswith('personal saving as a percentage of disposable personal income')),
        # linha "Total, Billions of chained (2017) dollars" do bloco da renda disponível real (as de % mais abaixo não servem)
        'disponivel_real': acha(lambda d: d.startswith('total, billions of chained')),
    }
    # consumo real: tabela 2.8.6 (mensal, dólares encadeados), linha do total
    try:
        real = linhas(pedir('T20806', anos[-2:], freq='M'))
        for ln in sorted(real, key=int)[:3]:
            print('T20806', ln, real[ln]['d'], list(real[ln]['v'].items())[-1])
        campos['consumo_real'] = next((real[ln]['v'] for ln in sorted(real, key=int) if real[ln]['d'].lower().startswith('personal consumption expenditures')), None)
    except SystemExit as e:
        print('Consumo real fora:', e)
        campos['consumo_real'] = None
    falta = [k for k, v in campos.items() if not v and k not in ('disponivel_real', 'consumo_real')]
    if falta:
        raise SystemExit(f'Linhas não encontradas na T20600: {falta}')
    ms = sorted(campos['consumo'])
    meses = [{'m': f'{m[:4]}-{m[5:7]}', **{k: (v or {}).get(m) for k, v in campos.items()}} for m in ms if 'M' in m]
    if len(meses) < 13:
        raise SystemExit(f'Poucos meses ({len(meses)})')
    return {'unidade': 'US$ milhões na taxa anual (poupança em % da renda disponível)', 'ultimo': meses[-1]['m'], 'meses': meses}


def main(saida):
    if not CHAVE:
        raise SystemExit('Falta o segredo BEA_API_KEY no GitHub')
    ano = datetime.date.today().year
    anos = list(range(ano - 3, ano + 1))
    contrib = linhas(pedir('T10102', anos))
    var = linhas(pedir('T10101', anos))
    for ln in sorted(contrib, key=int):
        print('T10102', ln, contrib[ln]['d'], list(contrib[ln]['v'].items())[-1])
    print('T10101 1', var.get('1', {}).get('d'), list(var.get('1', {}).get('v', {}).items())[-2:])
    # linhas da T10102: 1 PIB, 2 consumo das famílias, 7 investimento privado, 14 estoques, 15 exportações líquidas,
    # 16 exportações, 19 importações, 22 governo (conferidas pela descrição antes de usar)
    esperado = {'pib': ('1', 'gross domestic product'), 'consumo': ('2', 'personal consumption'), 'investimento': ('7', 'gross private domestic investment'),
                'estoques': ('14', 'change in private inventories'), 'externo': ('15', 'net exports'), 'exportacoes': ('16', 'exports'),
                'importacoes': ('19', 'imports'), 'governo': ('22', 'government')}
    campos = {}
    for k, (ln, desc) in esperado.items():
        d = contrib.get(ln)
        if not d or desc not in d['d'].lower():
            raise SystemExit(f'Linha {ln} da T10102 mudou: {d and d["d"]!r}; arquivo mantido')
        campos[k] = d['v']
    pib = var.get('1', {}).get('v', {})
    qs = sorted(set(campos['consumo']) & set(pib))
    if len(qs) < 4:
        raise SystemExit(f'Poucos trimestres ({len(qs)}); arquivo mantido')
    tri = [{'q': q, 'pib': pib.get(q), **{k: campos[k].get(q) for k in campos if k != 'pib'}} for q in qs]
    out = {'fonte': 'BEA (U.S. Bureau of Economic Analysis), tabelas NIPA 1.1.1, 1.1.2 e 2.6', 'unidade': 'p.p. anualizados', 'ultimo': qs[-1], 'trimestres': tri}
    try:
        out['familias'] = familias(anos)
    except SystemExit as e:  # renda das famílias é um extra: sem ela, o PIB continua sendo gravado
        print('Renda das famílias fora:', e)
        if antigo_familias(saida):
            out['familias'] = antigo_familias(saida)
    caminho = f'{saida}/bea.json'
    try:
        antigo = json.load(open(caminho, encoding='utf-8'))
    except Exception:
        antigo = None
    if antigo and antigo.get('trimestres') == tri and antigo.get('familias') == out.get('familias'):
        print('Sem dado novo')
        return
    out['gerado'] = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')
    with open(caminho, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print(f'Gravado: {len(tri)} trimestres, último {tri[-1]}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
