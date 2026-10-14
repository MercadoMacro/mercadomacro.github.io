#!/usr/bin/env python3
"""Posição dos especuladores (CFTC, Commitments of Traders, relatório "Legacy", só futuros).

Grava terminal/posicoes/cot.json com, para cada mercado, as posições semanais dos
"não comerciais" (grandes especuladores: fundos e gestores) e dos "comerciais" (quem usa
o contrato para proteção: produtores, bancos, exportadores), nos últimos ~3 anos.
Fonte: API pública da CFTC (publicreporting.cftc.gov, conjunto 6dca-aqww), sem chave.
A CFTC publica toda sexta às 15h30 de Nova York com as posições da terça anterior.
Uso: python3 gerar_cot.py <pasta_saida>
"""
import json, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone, timedelta

URL = "https://publicreporting.cftc.gov/resource/6dca-aqww.json"
SEMANAS = 160

# código CFTC -> (chave, nome no site, grupo, palavra que precisa aparecer no nome oficial)
MERCADOS = [
    ("102741", "brl", "Real brasileiro", "Moedas", "BRAZILIAN REAL"),
    ("098662", "dxy", "Índice do dólar (DXY)", "Moedas", "USD INDEX"),
    ("099741", "eur", "Euro", "Moedas", "EURO FX"),
    ("097741", "jpy", "Iene", "Moedas", "JAPANESE YEN"),
    ("096742", "gbp", "Libra", "Moedas", "BRITISH POUND"),
    ("13874A", "spx", "S&P 500 (E-mini)", "Bolsas e juros", "S&P 500"),
    ("209742", "ndx", "Nasdaq 100 (E-mini)", "Bolsas e juros", "NASDAQ"),
    ("043602", "t10", "Treasury 10 anos", "Bolsas e juros", "10Y"),
    ("133741", "btc", "Bitcoin (CME)", "Bolsas e juros", "BITCOIN"),
    ("088691", "ouro", "Ouro", "Commodities", "GOLD"),
    ("084691", "prata", "Prata", "Commodities", "SILVER"),
    ("067651", "wti", "Petróleo WTI", "Commodities", "WTI"),
    ("085692", "cobre", "Cobre", "Commodities", "COPPER"),
    ("005602", "soja", "Soja", "Commodities", "SOYBEANS"),
    ("002602", "milho", "Milho", "Commodities", "CORN"),
    ("083731", "cafe", "Café", "Commodities", "COFFEE"),
    ("080732", "acucar", "Açúcar", "Commodities", "SUGAR"),
    ("033661", "algodao", "Algodão", "Commodities", "COTTON"),
    ("057642", "boi", "Boi gordo (EUA)", "Commodities", "LIVE CATTLE"),
]

CAMPOS = ["cftc_contract_market_code", "market_and_exchange_names", "report_date_as_yyyy_mm_dd",
          "open_interest_all", "noncomm_positions_long_all", "noncomm_positions_short_all",
          "comm_positions_long_all", "comm_positions_short_all"]


def baixa(params, tentativas=4):
    url = URL + "?" + urllib.parse.urlencode(params)
    for i in range(tentativas):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "MercadoMacro (contato@mercadomacro.com.br)"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            print(f"  tentativa {i + 1} falhou: {e}")
            time.sleep(5 * (i + 1))
    raise SystemExit("CFTC não respondeu")


def inteiro(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def main():
    saida = sys.argv[1] if len(sys.argv) > 1 else "."
    desde = (datetime.now(timezone.utc) - timedelta(weeks=SEMANAS)).strftime("%Y-%m-%dT00:00:00")
    codigos = ",".join(f"'{m[0]}'" for m in MERCADOS)
    linhas = baixa({
        "$select": ",".join(CAMPOS),
        "$where": f"cftc_contract_market_code in({codigos}) AND report_date_as_yyyy_mm_dd >= '{desde}'",
        "$order": "report_date_as_yyyy_mm_dd ASC",
        "$limit": "20000",
    })
    print(f"{len(linhas)} linhas da CFTC")

    por_codigo = {}
    for l in linhas:
        por_codigo.setdefault(l.get("cftc_contract_market_code"), []).append(l)

    mercados = []
    for cod, chave, nome, grupo, palavra in MERCADOS:
        ls = por_codigo.get(cod, [])
        if not ls:
            print(f"  {cod} {nome}: sem dados, fica de fora")
            continue
        oficial = ls[-1].get("market_and_exchange_names", "")
        if palavra not in oficial.upper():
            print(f"  {cod} {nome}: nome oficial '{oficial}' não confere, fica de fora")
            continue
        semanas = []
        for l in ls:
            d = (l.get("report_date_as_yyyy_mm_dd") or "")[:10]
            nl, ns = inteiro(l.get("noncomm_positions_long_all")), inteiro(l.get("noncomm_positions_short_all"))
            cl, cs = inteiro(l.get("comm_positions_long_all")), inteiro(l.get("comm_positions_short_all"))
            oi = inteiro(l.get("open_interest_all"))
            if not d or nl is None or ns is None:
                continue
            semanas.append({"d": d, "el": nl, "es": ns, "cl": cl, "cs": cs, "oi": oi})
        # a API pode repetir a mesma data em revisões: fica a última
        unicas = {}
        for s in semanas:
            unicas[s["d"]] = s
        semanas = [unicas[k] for k in sorted(unicas)]
        print(f"  {cod} {nome}: {len(semanas)} semanas, última {semanas[-1]['d'] if semanas else '—'} ({oficial})")
        mercados.append({"k": chave, "codigo": cod, "nome": nome, "grupo": grupo, "oficial": oficial, "semanas": semanas})

    if not mercados:
        raise SystemExit("nenhum mercado com dados")
    out = {
        "gerado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "fonte": "CFTC Commitments of Traders, Legacy, Futures Only",
        "mercados": mercados,
    }
    with open(f"{saida}/cot.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"cot.json: {len(mercados)} mercados")


if __name__ == "__main__":
    main()
