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
import subprocess, os
for tent in range(6):
    r = subprocess.run(["curl", "-sS", "--http1.1", "-C", "-", "-o", "/tmp/d.zip", "-w", "%{http_code} %{size_download}", url], capture_output=True, text=True)
    print("curl", tent, r.returncode, r.stdout, r.stderr[:200], os.path.getsize("/tmp/d.zip") if os.path.exists("/tmp/d.zip") else 0)
    try:
        zipfile.ZipFile("/tmp/d.zip"); break
    except Exception as e:
        print("  ainda não", e)
b = open("/tmp/d.zip", "rb").read()
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
