# diagnóstico temporário: lê ITR direto do RAD da CVM (não vai para o main)
import json, urllib.request, io, zipfile, re
U = "https://www.rad.cvm.gov.br/ENET/frmConsultaExternaCVM.aspx/ListarDocumentos"
def lista(cat, de="01/11/2026", ate="08/11/2026"):
    corpo = {"dataDe": de, "dataAte": ate, "empresa": "", "setorAtividade": "-1", "categoriaEmissor": "-1",
             "situacaoEmissor": "-1", "tipoParticipante": "-1", "dataReferencia": "", "categoria": cat,
             "periodo": "2", "horaIni": "", "horaFim": "", "palavraChave": "", "ultimaDtRef": "false",
             "tipoEmpresa": "0", "token": "", "versaoCaptcha": ""}
    r = urllib.request.Request(U, data=json.dumps(corpo).encode(), headers={"Content-Type": "application/json; charset=utf-8"})
    return json.loads(urllib.request.urlopen(r, timeout=90).read())["d"]["dados"]
d = lista("EST_3")
linhas = d.split("&*")
print(len(linhas), "linhas")
alvo = [l for l in linhas if "SUZANO" in l.upper() or "ALUPAR" in l.upper()]
for l in alvo[:2]:
    print(l[:3000]); print("-----")
m = re.search(r"OpenDownloadDocumentos\(([^)]*)\)", alvo[0]) or re.search(r"OpenPopUpVer\(([^)]*)\)", alvo[0])
print("args", m and m.group(1))
args = [a.strip("' ") for a in m.group(1).split(",")]
print(args)
seq, ver, prot = args[0], args[1], args[2]
url = f"https://www.rad.cvm.gov.br/ENET/frmDownloadDocumento.aspx?Tela=ext&descTipo=ITR&CodigoInstituicao=1&numProtocolo={prot}&numSequencia={seq}&numVersao={ver}"
print(url)
import subprocess, urllib.parse
q = urllib.parse.urlencode({"Grupo": "DFs Consolidadas", "Quadro": "Demonstração do Resultado", "NomeTipoDocumento": "ITR", "Titulo": "Demonstração do Resultado", "Empresa": "SUZANO", "DataReferencia": "30/09/2026", "Versao": "1", "CodTipoDocumento": "3", "NumeroSequencialDocumento": seq, "NumeroSequencialRegistroCvm": "", "CodigoTipoInstituicao": "1"})
h = subprocess.run(["curl", "-sS", "--retry", "3", "-L", "https://www.rad.cvm.gov.br/ENET/frmDemonstracaoFinanceiraITR.aspx?" + q], capture_output=True).stdout.decode("utf-8", "replace")
print("HTML", len(h)); t = re.sub(r"<[^>]+>", " ", h); t = re.sub(r"\s+", " ", t); print(t[:2500])
subprocess.run(["curl", "-sS", "--retry", "3", "-o", "/tmp/d.zip", url]); b = open("/tmp/d.zip", "rb").read()
print("bytes", len(b), b[:4])
z = zipfile.ZipFile(io.BytesIO(b))
for n in z.namelist(): print(" ", n, z.getinfo(n).file_size)
for n in z.namelist():
    if n.lower().endswith((".itr", ".dfp")):
        z2 = zipfile.ZipFile(io.BytesIO(z.read(n)))
        for n2 in z2.namelist(): print("   ", n2, z2.getinfo(n2).file_size)
        for n2 in z2.namelist():
            if "InfoFinaDFin" in n2:
                x = z2.read(n2).decode("utf-8", "replace")
                i = x.find("3.01")
                print(x[max(0, i-1500):i+1500])
