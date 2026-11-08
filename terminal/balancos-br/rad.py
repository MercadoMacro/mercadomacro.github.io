"""Leitura direta do RAD (Empresas.NET) da CVM, onde a empresa entrega o ITR/DFP.

O arquivo de dados abertos (ITR/DFP) chega com dias de atraso; o RAD lista a entrega na hora.
- lista_entregas: ITR (EST_3) ou DFP (EST_4) recebidos num intervalo de datas.
- dre_do_documento: lê só o XML do documento (primeira entrada do zip; o resto é o PDF,
  que a CVM costuma cortar no meio do download) e devolve a DRE consolidada
  (ou a individual, se a consolidada vier vazia) com o trimestre atual e o mesmo trimestre
  do ano anterior. Valores em R$.
"""
import json, re, struct, time, urllib.request, zlib
import xml.etree.ElementTree as ET

LISTA = "https://www.rad.cvm.gov.br/ENET/frmConsultaExternaCVM.aspx/ListarDocumentos"
BAIXA = ("https://www.rad.cvm.gov.br/ENET/frmDownloadDocumento.aspx?Tela=ext&descTipo={tipo}&CodigoInstituicao=1"
         "&numProtocolo={prot}&numSequencia={seq}&numVersao={ver}")
VER = "https://www.rad.cvm.gov.br/ENET/frmGerenciaPaginaFRE.aspx?NumeroSequencialDocumento={seq}&CodigoTipoInstituicao=1"


def lista_entregas(categoria, de, ate):
    """[{cvm, ref (AAAA-MM-DD), receb (AAAA-MM-DD), seq, ver, prot, tipo, link}]; None se falhou."""
    corpo = {"dataDe": de.strftime("%d/%m/%Y"), "dataAte": ate.strftime("%d/%m/%Y"), "empresa": "",
             "setorAtividade": "-1", "categoriaEmissor": "-1", "situacaoEmissor": "-1", "tipoParticipante": "-1",
             "dataReferencia": "", "categoria": categoria, "periodo": "2", "horaIni": "", "horaFim": "",
             "palavraChave": "", "ultimaDtRef": "false", "tipoEmpresa": "0", "token": "", "versaoCaptcha": ""}
    for i in range(3):
        try:
            r = urllib.request.Request(LISTA, data=json.dumps(corpo).encode(),
                                       headers={"Content-Type": "application/json; charset=utf-8"})
            d = json.loads(urllib.request.urlopen(r, timeout=90).read())["d"]
            if d.get("temErro"):
                print(f"  RAD {categoria}: {d.get('msgErro')}")
                return None
            break
        except Exception as e:  # noqa: BLE001
            print(f"  RAD {categoria}: tentativa {i + 1} falhou: {e}")
            time.sleep(5 * (i + 1))
    else:
        return None
    out = []
    for l in (d.get("dados") or "").split("&*"):
        c = l.split("$&")
        m = re.search(r"OpenDownloadDocumentos\('(\d+)','(\d+)','([^']+)','(\w+)'\)", l)
        if len(c) < 7 or not m:
            continue
        ref = re.search(r"(\d{2})/(\d{2})/(\d{4})", c[5])
        rec = re.search(r"(\d{2})/(\d{2})/(\d{4})", c[6])
        cod = re.sub(r"\D", "", c[0])
        if not (ref and rec and cod):
            continue
        out.append({"cvm": int(cod), "ref": f"{ref[3]}-{ref[2]}-{ref[1]}", "receb": f"{rec[3]}-{rec[2]}-{rec[1]}",
                    "seq": m[1], "ver": int(m[2]), "prot": m[3], "tipo": m[4], "link": VER.format(seq=m[1])})
    return out


def _xml(d, timeout=40):
    with urllib.request.urlopen(BAIXA.format(**d), timeout=timeout) as r:
        h = r.read(30)
        if h[:4] != b"PK\x03\x04":
            return None
        fl, met, _, _, _, csz, _, nl, xl = struct.unpack("<HHHHIIIHH", h[6:30])
        nome = r.read(nl).decode("cp437")
        r.read(xl)
        if not nome.lower().endswith(".xml") or fl & 8:
            return None
        b = bytearray()
        while len(b) < csz:
            p = r.read(min(1 << 20, csz - len(b)))
            if not p:
                return None
            b += p
    return zlib.decompress(bytes(b), -15) if met == 8 else bytes(b)


def dre_do_documento(d, norm):
    """(dre_atual, dre_ano_anterior) no formato {codigo: (descricao_normalizada, valor)}; None se não deu."""
    try:
        x = _xml(d)
    except Exception as e:  # noqa: BLE001
        print(f"    {d['cvm']}: download falhou ({e})")
        return None
    if not x:
        return None
    raiz = ET.fromstring(x)
    mult = 1000 if raiz.findtext(".//EscalaMoeda") == "2" else 1
    blocos = {}
    for pai in raiz.iter():
        dr = pai.find("DemonstracaoResultado")
        if dr is None:
            continue
        atual, ant = {}, {}
        for c in dr.iter("Conta"):
            cod = c.findtext("CodigoConta") or ""
            ds = norm(c.findtext("DescricaoConta") or "")
            for col, alvo in (("TrimestreAtual", atual), ("TrimestreAnterior", ant)):
                try:
                    alvo[cod] = (ds, float(c.findtext(col)) * mult)
                except (TypeError, ValueError):
                    pass
        blocos[pai.tag] = (atual, ant)
    for tag in ("DfConsolidadas", "DfIndividuais"):
        b = blocos.get(tag)
        if b and any(v for _, v in b[0].values()):
            return b
    return None
