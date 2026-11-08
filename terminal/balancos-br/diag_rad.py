# diagnóstico temporário: lê ITR direto do RAD da CVM (não vai para o main)
import json, urllib.request, io, zipfile, re, sys
U = "https://www.rad.cvm.gov.br/ENET/frmConsultaExternaCVM.aspx/ListarDocumentos"
def lista(cat, cvm="", de="01/11/2026", ate="08/11/2026"):
    corpo = {"dataDe": de, "dataAte": ate, "empresa": cvm, "setorAtividade": "-1", "categoriaEmissor": "-1",
             "situacaoEmissor": "-1", "tipoParticipante": "-1", "dataReferencia": "", "categoria": cat,
             "periodo": "2", "horaIni": "", "horaFim": "", "palavraChave": "", "ultimaDtRef": "false",
             "tipoEmpresa": "0", "token": "", "versaoCaptcha": ""}
    r = urllib.request.Request(U, data=json.dumps(corpo).encode(), headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        t = urllib.request.urlopen(r, timeout=60).read().decode("utf-8", "replace")
    except Exception as e:
        print(cat, cvm, "ERRO", e, getattr(e, "read", lambda: b"")()[:300]); return None
    print(cat, cvm, len(t), t[:600].replace("\\n", " "))
    return t
for cat in ("EST_3", "EST_4", "IPE_-1_-1_-1"):
    lista(cat)
t = lista("EST_3", "013986")
