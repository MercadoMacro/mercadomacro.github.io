#!/usr/bin/env python3
"""Carteiras dos grandes fundos americanos (formulário 13F da SEC).

Todo gestor com mais de US$ 100 milhões em ações americanas entrega à SEC, até 45 dias
depois do fim de cada trimestre, a lista das ações que tinha no último dia do trimestre.
Este script lê os dois últimos 13F-HR de cada fundo da lista e grava
terminal/posicoes/13f.json com as maiores posições e o que entrou, saiu, aumentou e diminuiu.
Fonte: SEC EDGAR (data.sec.gov e www.sec.gov/Archives), sem chave; a SEC pede um
User-Agent com contato e no máximo 10 pedidos por segundo.
Uso: python3 gerar_13f.py <pasta_saida>
"""
import json, sys, time, urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta

UA = "MercadoMacro contato@mercadomacro.com.br"
MAX_LISTA = 40

# CIK na SEC, apelido no site, gestor conhecido, palavra que precisa estar no nome oficial
FUNDOS = [
    (1067983, "Berkshire Hathaway", "Warren Buffett", "BERKSHIRE"),
    (1336528, "Pershing Square", "Bill Ackman", "PERSHING"),
    (1536411, "Duquesne Family Office", "Stanley Druckenmiller", "DUQUESNE"),
    (1656456, "Appaloosa", "David Tepper", "APPALOOSA"),
    (1061768, "Baupost Group", "Seth Klarman", "BAUPOST"),
    (1709323, "Himalaya Capital", "Li Lu", "HIMALAYA"),
    (1649339, "Scion Asset Management", "Michael Burry", "SCION"),
    (1029160, "Soros Fund Management", "George Soros", "SOROS"),
    (1040273, "Third Point", "Dan Loeb", "THIRD POINT"),
    (1167483, "Tiger Global", "Chase Coleman", "TIGER GLOBAL"),
    (1350694, "Bridgewater Associates", "Ray Dalio (fundador)", "BRIDGEWATER"),
    (1037389, "Renaissance Technologies", "Jim Simons (fundador)", "RENAISSANCE"),
    (1166559, "Fundação Gates (trust)", "Bill & Melinda Gates", "GATES"),
]

_ultimo = [0.0]


def get(url, tipo="json", tentativas=4):
    for i in range(tentativas):
        espera = 0.15 - (time.time() - _ultimo[0])
        if espera > 0:
            time.sleep(espera)
        _ultimo[0] = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity"})
            with urllib.request.urlopen(req, timeout=60) as r:
                dados = r.read()
            return json.loads(dados) if tipo == "json" else dados
        except Exception as e:  # noqa: BLE001
            print(f"    tentativa {i + 1} falhou em {url}: {e}")
            time.sleep(3 * (i + 1))
    return None


def sem_ns(tag):
    return tag.split("}", 1)[-1]


def le_tabela(xml_bytes, mil):
    """Soma as linhas da tabela de informação por (cusip, put/call)."""
    raiz = ET.fromstring(xml_bytes)
    pos = {}
    for it in raiz.iter():
        if sem_ns(it.tag) != "infoTable":
            continue
        campos = {}
        for c in it.iter():
            t = sem_ns(c.tag)
            if c.text and c.text.strip():
                campos[t] = c.text.strip()
        cusip = campos.get("cusip", "").upper()
        if not cusip:
            continue
        pc = campos.get("putCall", "").capitalize()
        try:
            valor = float(campos.get("value", "0")) * (1000 if mil else 1)
            qtd = float(campos.get("sshPrnamt", "0"))
        except ValueError:
            continue
        k = (cusip, pc)
        p = pos.setdefault(k, {"cusip": cusip, "pc": pc, "nome": campos.get("nameOfIssuer", ""),
                                 "classe": campos.get("titleOfClass", ""), "tipo": campos.get("sshPrnamtType", ""),
                                 "v": 0.0, "q": 0.0})
        p["v"] += valor
        p["q"] += qtd
    return pos


def filings(cik):
    sub = get(f"https://data.sec.gov/submissions/CIK{cik:010d}.json")
    if not sub:
        return None, []
    r = sub.get("filings", {}).get("recent", {})
    lista = []
    for i, form in enumerate(r.get("form", [])):
        if form == "13F-HR":
            lista.append({"acc": r["accessionNumber"][i], "entregue": r["filingDate"][i],
                          "periodo": (r.get("reportDate") or [""] * (i + 1))[i]})
    # um mesmo período pode ter sido entregue de novo: fica o mais recente de cada período
    por_periodo = {}
    for f in sorted(lista, key=lambda x: x["entregue"]):
        por_periodo[f["periodo"]] = f
    return sub.get("name", ""), sorted(por_periodo.values(), key=lambda x: x["periodo"], reverse=True)


def carteira(cik, f):
    pasta = f"https://www.sec.gov/Archives/edgar/data/{cik}/{f['acc'].replace('-', '')}"
    idx = get(pasta + "/index.json")
    if not idx:
        return None
    xmls = [i["name"] for i in idx.get("directory", {}).get("item", [])
            if i["name"].lower().endswith(".xml") and i["name"].lower() != "primary_doc.xml"]
    for nome in xmls:
        dados = get(f"{pasta}/{nome}", tipo="bytes")
        if not dados or b"infoTable" not in dados:
            continue
        # até o fim de 2022 o campo value vinha em milhares de dólares
        return le_tabela(dados, mil=f["entregue"] < "2023-01-03")
    return None


def arred(x):
    return round(x) if x is not None else None


def main():
    saida = sys.argv[1] if len(sys.argv) > 1 else "."
    limite = (datetime.now(timezone.utc) - timedelta(days=470)).strftime("%Y-%m-%d")
    fundos = []
    for cik, apelido, gestor, palavra in FUNDOS:
        nome, fs = filings(cik)
        if not nome or palavra not in nome.upper():
            print(f"  {cik} {apelido}: nome oficial '{nome}' não confere, fica de fora")
            continue
        if not fs:
            print(f"  {cik} {apelido}: sem 13F-HR")
            continue
        if fs[0]["periodo"] < limite:
            print(f"  {cik} {apelido}: último 13F é de {fs[0]['periodo']}, antigo demais, fica de fora")
            continue
        atual = carteira(cik, fs[0])
        if not atual:
            print(f"  {cik} {apelido}: não li a tabela do 13F {fs[0]['acc']}")
            continue
        ant = carteira(cik, fs[1]) if len(fs) > 1 else None
        total = sum(p["v"] for p in atual.values())
        tot_ant = sum(p["v"] for p in ant.values()) if ant else None

        def linha(p, pa=None):
            d = {"cusip": p["cusip"], "nome": p["nome"], "classe": p["classe"], "pc": p["pc"],
                 "v": arred(p["v"]), "q": arred(p["q"]), "pct": round(p["v"] / total * 100, 2) if total else None}
            if pa is not None:
                d["qa"] = arred(pa["q"])
                d["va"] = arred(pa["v"])
            return d

        maiores = sorted(atual.values(), key=lambda p: p["v"], reverse=True)
        novas, zeradas, mais, menos = [], [], [], []
        if ant:
            for k, p in atual.items():
                pa = ant.get(k)
                if not pa:
                    novas.append(linha(p))
                elif p["q"] > pa["q"] * 1.005:
                    mais.append(linha(p, pa))
                elif p["q"] < pa["q"] * 0.995:
                    menos.append(linha(p, pa))
            for k, pa in ant.items():
                if k not in atual:
                    zeradas.append({"cusip": pa["cusip"], "nome": pa["nome"], "classe": pa["classe"], "pc": pa["pc"],
                                    "va": arred(pa["v"]), "qa": arred(pa["q"]),
                                    "pcta": round(pa["v"] / tot_ant * 100, 2) if tot_ant else None})
        pelo_valor = lambda l: sorted(l, key=lambda x: x.get("v") or x.get("va") or 0, reverse=True)[:MAX_LISTA]
        fundos.append({
            "cik": cik, "apelido": apelido, "gestor": gestor, "oficial": nome,
            "periodo": fs[0]["periodo"], "entregue": fs[0]["entregue"], "acc": fs[0]["acc"],
            "periodo_ant": fs[1]["periodo"] if ant else None,
            "total": arred(total), "total_ant": arred(tot_ant), "n": len(atual), "n_ant": len(ant) if ant else None,
            "maiores": [linha(p, ant.get((p["cusip"], p["pc"])) if ant else None) for p in maiores[:MAX_LISTA]],
            "novas": pelo_valor(novas), "zeradas": pelo_valor(zeradas),
            "aumentou": pelo_valor(mais), "diminuiu": pelo_valor(menos),
            "n_novas": len(novas), "n_zeradas": len(zeradas), "n_aumentou": len(mais), "n_diminuiu": len(menos),
        })
        print(f"  {cik} {apelido}: {fs[0]['periodo']} ({len(atual)} posições, US$ {total / 1e9:.1f} bi); "
              f"novas {len(novas)}, zeradas {len(zeradas)}, aumentou {len(mais)}, diminuiu {len(menos)}")

    if not fundos:
        raise SystemExit("nenhum fundo lido")
    out = {"gerado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "fonte": "SEC EDGAR, formulário 13F-HR", "fundos": fundos}
    with open(f"{saida}/13f.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"13f.json: {len(fundos)} fundos")


if __name__ == "__main__":
    main()
