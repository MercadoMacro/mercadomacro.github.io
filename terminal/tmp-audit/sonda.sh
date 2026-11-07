set +e
for n in 11 12 13 14 24; do printf "189 ultimos/$n: "; curl -s -m 30 -o /tmp/r -w "%{http_code} " "https://api.bcb.gov.br/dados/serie/bcdata.sgs.189/dados/ultimos/$n?formato=json"; [ -s /tmp/r ] && head -c 60 /tmp/r; echo; done
for s in 432 4389 13522 433 189; do printf "$s ultimos/12: "; curl -s -m 30 -o /dev/null -w "%{http_code}\n" "https://api.bcb.gov.br/dados/serie/bcdata.sgs.$s/dados/ultimos/12?formato=json"; done
printf "shrill 189 u13: "; curl -s -m 30 -H "Origin: https://mercadomacro.com.br" -w " %{http_code}\n" "https://shrill-meadow-89c1.danilo-nillo.workers.dev/bcb?mmp=vitrine&c=189&q=%2Fultimos%2F13" | tail -c 120
