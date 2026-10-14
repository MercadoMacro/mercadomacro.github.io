#!/usr/bin/env python3
"""Agenda de balanços das empresas da B3 (CVM Dados Abertos, sem chave).

Grava terminal/balancos-br/agenda.json com:
- divulgados: ITR (trimestres 1 a 3) e DFP (ano fechado) entregues à CVM nos últimos 150 dias,
  com a data em que a CVM recebeu o documento (normalmente o dia da divulgação);
- proximos: para cada empresa da B3 que ainda não entregou o trimestre em aberto,
  a data confirmada pela própria empresa (comunicado ao mercado "agenda de divulgação
  de resultados", lido do PDF) ou, sem comunicado, a data provável: o mesmo dia da
  semana, 52 semanas depois da entrega do mesmo trimestre no ano passado.
Só entram empresas que estão em terminal/fundamentos/index.json (as que têm ação na B3).
Uso: python3 gerar_agenda.py <pasta_saida> <index_fundamentos.json>
"""
import csv, io, json, re, subprocess, sys, tempfile, time, urllib.request, zipfile
from datetime import date, datetime, timedelta, timezone

BASE = "https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC"
UA = {"User-Agent": "MercadoMacro (contato@mercadomacro.com.br)"}
MESES = {m: i + 1 for i, m in enumerate(["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
                                          "agosto", "setembro", "outubro", "novembro", "dezembro"])}
MESES["marco"] = 3


def baixa(url, tentativas=4, timeout=180):
    for i in range(tentativas):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            print(f"  tentativa {i + 1} falhou em {url}: {e}")
            time.sleep(4 * (i + 1))
    return None


def le_csv(zbytes, nome):
    with zipfile.ZipFile(io.BytesIO(zbytes)) as z:
        if nome not in z.namelist():
            return []
        texto = z.read(nome).decode("latin-1")
    return list(csv.DictReader(io.StringIO(texto), delimiter=";"))


def tri_nome(ref):
    """'2026-09-30' -> '3T26'; '2025-12-31' -> '4T25'."""
    return f"{(int(ref[5:7]) + 2) // 3}T{ref[2:4]}"


def fim_trimestre_anterior(d):
    q = (d.month - 1) // 3
    if q == 0:
        return date(d.year - 1, 12, 31)
    return [date(d.year, 3, 31), date(d.year, 6, 30), date(d.year, 9, 30)][q - 1]


def datas_no_texto(t):
    t = t.lower()
    out = []
    for d, m, a in re.findall(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b", t):
        out.append((int(a), int(m), int(d)))
    for d, m, a in re.findall(r"\b(\d{1,2})º?\s+de\s+([a-zç]+)\s+de\s+(\d{4})\b", t):
        if m in MESES:
            out.append((int(a), MESES[m], int(d)))
    res = []
    for a, m, d in out:
        try:
            res.append(date(a, m, d))
        except ValueError:
            pass
    return res


def pdf_texto(dados):
    if not dados or not dados.startswith(b"%PDF"):
        return ""
    with tempfile.NamedTemporaryFile(suffix=".pdf") as f:
        f.write(dados)
        f.flush()
        try:
            return subprocess.run(["pdftotext", "-q", f.name, "-"], capture_output=True, timeout=60).stdout.decode("utf-8", "ignore")
        except Exception:  # noqa: BLE001
            return ""


def main():
    saida, idx_path = sys.argv[1], sys.argv[2]
    hoje = datetime.now(timezone.utc).date()
    empresas = {int(e["cvm"]): e for e in json.load(open(idx_path, encoding="utf-8"))["empresas"]}
    print(f"{len(empresas)} empresas da B3 no índice")

    # entregas de ITR e DFP: primeira data de recebimento de cada (empresa, data de referência)
    entregas = {}
    for tipo, anos in (("ITR", (hoje.year - 1, hoje.year)), ("DFP", (hoje.year - 2, hoje.year - 1))):
        for ano in anos:
            z = baixa(f"{BASE}/{tipo}/DADOS/{tipo.lower()}_cia_aberta_{ano}.zip")
            if not z:
                print(f"  sem {tipo} {ano}")
                continue
            linhas = le_csv(z, f"{tipo.lower()}_cia_aberta_{ano}.csv")
            print(f"  {tipo} {ano}: {len(linhas)} entregas")
            for l in linhas:
                try:
                    cvm = int(l["CD_CVM"])
                except (KeyError, ValueError):
                    continue
                if cvm not in empresas:
                    continue
                k = (cvm, l["DT_REFER"])
                atual = entregas.get(k)
                if not atual or l["DT_RECEB"] < atual["data"]:
                    entregas[k] = {"data": l["DT_RECEB"], "link": l.get("LINK_DOC", ""), "doc": tipo}

    divulgados = []
    limite = (hoje - timedelta(days=150)).isoformat()
    for (cvm, ref), e in entregas.items():
        if e["data"] >= limite:
            divulgados.append({"cvm": cvm, "ref": ref, "tri": tri_nome(ref), "data": e["data"], "doc": e["doc"], "link": e["link"]})
    divulgados.sort(key=lambda x: (x["data"], x["cvm"]), reverse=True)

    # trimestre em aberto: o último que já fechou (e o anterior, para quem ainda não entregou)
    alvo = fim_trimestre_anterior(hoje)
    alvos = [alvo, fim_trimestre_anterior(alvo)]

    # comunicados com a agenda de divulgação (IPE): data confirmada pela empresa
    confirmadas = {}
    for ano in sorted({alvo.year, hoje.year}):
        z = baixa(f"{BASE}/IPE/DADOS/ipe_cia_aberta_{ano}.zip")
        if not z:
            continue
        linhas = le_csv(z, f"ipe_cia_aberta_{ano}.csv")
        cand = []
        for l in linhas:
            try:
                cvm = int(l.get("Codigo_CVM", ""))
            except ValueError:
                continue
            if cvm not in empresas or l.get("Data_Entrega", "") <= alvo.isoformat():
                continue
            ass = f"{l.get('Assunto', '')} {l.get('Tipo', '')}".lower()
            if "apresenta" in ass or "press" in ass:
                continue
            if re.search(r"(agenda|data|calend[aá]rio).{0,40}(divulga|resultado)|divulga[cç][aã]o de resultados", ass):
                cand.append(l)
        print(f"  IPE {ano}: {len(cand)} comunicados de agenda depois de {alvo}")
        for l in sorted(cand, key=lambda x: x["Data_Entrega"]):
            cvm = int(l["Codigo_CVM"])
            entrega = date.fromisoformat(l["Data_Entrega"])
            texto = pdf_texto(baixa(l["Link_Download"], tentativas=2, timeout=60))
            time.sleep(0.3)
            futuras = sorted(d for d in datas_no_texto(texto) if entrega <= d <= entrega + timedelta(days=75) and d > alvo)
            if not futuras:
                print(f"    {cvm} {l['Nome_Companhia']}: sem data no comunicado ({l['Assunto']})")
                continue
            confirmadas[cvm] = {"data": futuras[0].isoformat(), "link": l["Link_Download"], "comunicado": l["Data_Entrega"]}
    print(f"  {len(confirmadas)} datas confirmadas por comunicado")

    proximos = []
    for cvm in empresas:
        for ref_d in alvos:
            ref = ref_d.isoformat()
            if (cvm, ref) in entregas:
                break  # já entregou o mais recente que falta
            ref_ant = date(ref_d.year - 1, ref_d.month, ref_d.day).isoformat()
            base = entregas.get((cvm, ref_ant))
            item = {"cvm": cvm, "ref": ref, "tri": tri_nome(ref)}
            c = confirmadas.get(cvm) if ref_d == alvo else None
            if c:
                item.update({"data": c["data"], "tipo": "confirmada", "link": c["link"], "comunicado": c["comunicado"]})
            elif base:
                prov = date.fromisoformat(base["data"]) + timedelta(days=364)
                item.update({"data": prov.isoformat(), "tipo": "provavel", "base": base["data"]})
            else:
                break
            proximos.append(item)
            break
    proximos.sort(key=lambda x: (x["data"], x["cvm"]))

    usadas = {x["cvm"] for x in divulgados} | {x["cvm"] for x in proximos}
    out = {
        "gerado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "fonte": "CVM Dados Abertos (ITR, DFP e IPE), licença ODbL",
        "trimestre": tri_nome(alvo.isoformat()),
        "empresas": {str(c): {"nome": empresas[c]["nome"], "tickers": empresas[c].get("tickers", []), "setor": empresas[c].get("setor", "")} for c in sorted(usadas)},
        "divulgados": divulgados,
        "proximos": proximos,
    }
    with open(f"{saida}/agenda.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    n_conf = sum(1 for p in proximos if p["tipo"] == "confirmada")
    print(f"agenda.json: {len(divulgados)} divulgados, {len(proximos)} próximos ({n_conf} confirmados)")


if __name__ == "__main__":
    main()
