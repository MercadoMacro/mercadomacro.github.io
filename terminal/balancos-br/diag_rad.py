# diagnóstico temporário: lê ITR direto do RAD da CVM (não vai para o main)
import json, urllib.request, re, struct, zlib, time, sys, unicodedata
import xml.etree.ElementTree as ET
sys.path.insert(0, "terminal/cvm"); import gerar_fundamentos as gf
CVMS = {int(c) for c in open("terminal/balancos-br/cvms.txt").read().split(",")}
U = "https://www.rad.cvm.gov.br/ENET/frmConsultaExternaCVM.aspx/ListarDocumentos"
def lista(cat, de, ate):
    corpo = {"dataDe": de, "dataAte": ate, "empresa": "", "setorAtividade": "-1", "categoriaEmissor": "-1",
             "situacaoEmissor": "-1", "tipoParticipante": "-1", "dataReferencia": "", "categoria": cat,
             "periodo": "2", "horaIni": "", "horaFim": "", "palavraChave": "", "ultimaDtRef": "false",
             "tipoEmpresa": "0", "token": "", "versaoCaptcha": ""}
    r = urllib.request.Request(U, data=json.dumps(corpo).encode(), headers={"Content-Type": "application/json; charset=utf-8"})
    d = json.loads(urllib.request.urlopen(r, timeout=90).read())["d"]["dados"]
    out = []
    for l in d.split("&*"):
        c = l.split("$&")
        m = re.search(r"OpenDownloadDocumentos\('(\d+)','(\d+)','([^']+)','(\w+)'\)", l)
        if len(c) < 7 or not m:
            continue
        ref = re.search(r"(\d{2})/(\d{2})/(\d{4})", c[5]); rec = re.search(r"(\d{2})/(\d{2})/(\d{4})", c[6])
        out.append({"cvm": int(re.sub(r"\D", "", c[0])[:-1]), "nome": c[1], "ref": f"{ref[3]}-{ref[2]}-{ref[1]}",
                    "receb": f"{rec[3]}-{rec[2]}-{rec[1]}", "seq": m[1], "ver": m[2], "prot": m[3], "tipo": m[4]})
    return out
def xml_doc(d):
    url = (f"https://www.rad.cvm.gov.br/ENET/frmDownloadDocumento.aspx?Tela=ext&descTipo={d['tipo']}&CodigoInstituicao=1"
           f"&numProtocolo={d['prot']}&numSequencia={d['seq']}&numVersao={d['ver']}")
    with urllib.request.urlopen(url, timeout=120) as r:
        h = r.read(30)
        if h[:4] != b"PK\x03\x04":
            return None
        fl, met, _, _, crc, csz, usz, nl, xl = struct.unpack("<HHHHIIIHH", h[6:30])
        nome = r.read(nl).decode("cp437"); r.read(xl)
        if not nome.lower().endswith(".xml") or fl & 8:
            print("   primeira entrada", nome, fl); return None
        b = b""
        while len(b) < csz:
            p = r.read(min(1 << 20, csz - len(b)))
            if not p: break
            b += p
    return zlib.decompress(b, -15) if met == 8 else b
def dres(x):
    raiz = ET.fromstring(x)
    esc = raiz.findtext(".//EscalaMoeda")
    mult = 1000 if esc == "2" else 1
    blocos = []
    for pai in raiz.iter():
        for dr in pai.findall("DemonstracaoResultado"):
            contas = {}
            for c in dr.iter("Conta"):
                cod = c.findtext("CodigoConta"); ds = gf.norm(c.findtext("DescricaoConta") or "")
                def v(t):
                    s = c.findtext(t)
                    try: return float(s) * mult
                    except (TypeError, ValueError): return None
                contas[cod] = (ds, v("TrimestreAtual"), v("TrimestreAnterior"), v("AcumuladoExercicioAtual"), v("AcumuladoExercicioAnterior"))
            blocos.append((pai.tag, contas))
    return esc, blocos
t0 = time.time()
docs = [d for d in lista("EST_3", "01/10/2026", "08/11/2026") if d["ref"] == "2026-09-30"]
print(len(docs), "ITR 3T26 no RAD;", len({d['cvm'] for d in docs}), "empresas;", len([d for d in docs if d['cvm'] in CVMS]), "das nossas por comunicado")
for d in [d for d in docs if d["cvm"] in CVMS][:60]:
    try:
        x = xml_doc(d)
    except Exception as e:
        print(d["cvm"], d["nome"], "ERRO", e); continue
    if not x:
        print(d["cvm"], d["nome"], "sem xml"); continue
    esc, bl = dres(x)
    res = []
    for tag, c in bl:
        dre_u = {k: (v[0], v[1]) for k, v in c.items() if v[1] is not None}
        dre_p = {k: (v[0], v[2]) for k, v in c.items() if v[2] is not None}
        u = gf.metricas(dre_u, {}, {}, {}, False); p = gf.metricas(dre_p, {}, {}, {}, False)
        res.append(f"{tag}: rec {u['receita']} ({p['receita']}) luc {u['lucro']} ({p['lucro']})")
    print(d["cvm"], d["nome"][:30], d["receb"], f"{len(x)//1000}k esc{esc}", " | ".join(res), f"{time.time()-t0:.0f}s")
