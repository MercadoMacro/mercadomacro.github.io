# diagnóstico temporário: categorias do IPE depois do fim do trimestre
import collections, sys, re
sys.path.insert(0, 'terminal/balancos-br')
import gerar_agenda as g
from datetime import date
z = g.baixa(f"{g.BASE}/IPE/DADOS/ipe_cia_aberta_2026.zip")
linhas = g.le_csv(z, "ipe_cia_aberta_2026.csv")
print("colunas", list(linhas[0].keys()))
pos = [l for l in linhas if l.get("Data_Entrega", "") > "2026-09-30"]
c = collections.Counter((l.get("Categoria"), l.get("Tipo"), l.get("Especie")) for l in pos)
for k, n in c.most_common(45): print(n, k)
print("--- com resultado/release no assunto")
r = [l for l in pos if re.search(r"resultado|release|trimestr|3T26|ITR", f"{l.get('Assunto','')} {l.get('Tipo','')} {l.get('Especie','')}", re.I)]
c2 = collections.Counter((l.get("Categoria"), l.get("Tipo"), l.get("Especie")) for l in r)
for k, n in c2.most_common(25): print(n, k)
for l in r[:40]: print(l.get("Data_Entrega"), l.get("Nome_Companhia")[:30], "|", l.get("Categoria"), "|", l.get("Tipo"), "|", l.get("Especie"), "|", (l.get("Assunto") or "")[:90])
for nome in ("ALLOS", "TELEF", "MARCOPOLO", "ISA "):
    print("==", nome); [print(l.get("Data_Entrega"), l.get("Categoria"), "|", l.get("Tipo"), "|", l.get("Especie"), "|", (l.get("Assunto") or "")[:80]) for l in pos if nome in (l.get("Nome_Companhia") or "").upper()][:12]
# ITR atualizado até quando?
z2 = g.baixa(f"{g.BASE}/ITR/DADOS/itr_cia_aberta_2026.zip")
it = g.le_csv(z2, "itr_cia_aberta_2026.csv")
print("ITR max DT_RECEB", max(l["DT_RECEB"] for l in it), len(it))
