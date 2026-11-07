set +e
echo "== BCB 189 direto"; for q in "ultimos/12" "ultimos/1"; do curl -s -m 30 -o /tmp/r -w "%{http_code} " "https://api.bcb.gov.br/dados/serie/bcdata.sgs.189/dados/$q?formato=json"; head -c 200 /tmp/r; echo; done
curl -s -m 30 -w " %{http_code}\n" "https://api.bcb.gov.br/dados/serie/bcdata.sgs.189/dados?formato=json&dataInicial=01/01/2025" | tail -c 300
echo "== 432 ultimos/3"; curl -s -m 30 "https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/3?formato=json"; echo
echo "== vitrine worker"; curl -s -m 30 -H "Origin: https://mercadomacro.com.br" -w " %{http_code}\n" "https://mercadomacro-vitrine.cota-cotacao10.workers.dev/bcb?c=189&n=12" | tail -c 300
echo "== home com varios UA"
for ua in "Mozilla/5.0 (X11; Linux x86_64) Chrome/130 Safari/537.36" "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" "curl/8"; do curl -s -o /dev/null -m 30 -w "%{http_code} $ua\n" -A "$ua" https://mercadomacro.com.br/; done
node -e "fetch('https://mercadomacro.com.br/',{redirect:'manual'}).then(r=>console.log('node fetch',r.status, r.headers.get('content-type')))"
