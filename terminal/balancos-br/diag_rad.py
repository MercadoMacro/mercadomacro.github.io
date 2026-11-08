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
import subprocess, os, struct, zlib
ok = False
for tent in range(4):
    if os.path.exists("/tmp/d.zip"): os.remove("/tmp/d.zip")
    r = subprocess.run(["curl", "-sS", "--http1.1", "-o", "/tmp/d.zip", "-w", "%{http_code} %{size_download}", url], capture_output=True, text=True)
    print("curl", tent, r.returncode, r.stdout, r.stderr[:120])
    try:
        zipfile.ZipFile("/tmp/d.zip"); ok = True; break
    except Exception as e:
        print("  incompleto", e)
b = open("/tmp/d.zip", "rb").read()
# zip cortado: lê as entradas locais em sequência
pos = 0; ents = {}
while b[pos:pos+4] == b"PK\x03\x04":
    fl, met, _, _, crc, csz, usz, nl, xl = struct.unpack("<HHHHIIIHH", b[pos+6:pos+30])
    nome = b[pos+30:pos+30+nl].decode("cp437"); ini = pos+30+nl+xl
    print("  entrada", nome, met, csz, usz, fl)
    if fl & 8 or ini+csz > len(b): print("  (para aqui)"); break
    ents[nome] = zlib.decompress(b[ini:ini+csz], -15) if met == 8 else b[ini:ini+csz]
    pos = ini+csz
for n, dado in ents.items():
    if n.lower().endswith(".xml"):
        x = dado.decode("utf-8", "replace")
        print("XML", len(x)); print(x[:1500])
        tags = {}
        for t in re.findall(r"<(\w+)[ >]", x): tags[t] = tags.get(t, 0) + 1
        print(sorted(tags.items(), key=lambda a: -a[1])[:60])
        for cod in ("<CodigoConta>3.01<", "<CodigoConta>3.11<"):
            k = x.find(cod); print(cod, k); print(x[max(0, k-1500):k+2500] if k >= 0 else "")
    if n.lower().endswith((".itr", ".dfp")):
        z2 = zipfile.ZipFile(io.BytesIO(dado))
        for n2 in z2.namelist(): print("   ", n2, z2.getinfo(n2).file_size)
        for n2 in z2.namelist():
            if "InfoFinaDFin" in n2:
                x = z2.read(n2).decode("utf-8", "replace")
                k = x.find("<CodigoConta>3.01"); print(x[max(0, k-1200):k+1800])
raise SystemExit
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
