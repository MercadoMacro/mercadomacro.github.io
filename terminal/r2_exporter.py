import os
import json
import urllib.request

def upload_to_r2(data_obj, destination_key):
    """
    Função auxiliar para salvar dados JSON localmente e opcionalmente
    fazer upload direto para um bucket do Cloudflare R2 / S3 via API HTTP
    quando as variáveis de ambiente R2_BUCKET_URL e R2_API_TOKEN estiverem configuradas.
    """
    r2_url = os.environ.get("R2_BUCKET_URL")
    r2_token = os.environ.get("R2_API_TOKEN")

    if not r2_url or not r2_token:
        return False

    try:
        url = f"{r2_url.rstrip('/')}/{destination_key}"
        json_bytes = json.dumps(data_obj, ensure_ascii=False, separators=(',', ':')).encode('utf-8')

        req = urllib.request.Request(
            url,
            data=json_bytes,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {r2_token}"
            },
            method="PUT"
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status in (200, 201)
    except Exception as e:
        print(f"[R2 Sync Warning] Não foi possível fazer upload para {destination_key}: {e}")
        return False
