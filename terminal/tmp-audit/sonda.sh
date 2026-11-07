set +e
UA="MercadoMacro-RSS/1.0 (+https://mercadomacro.com.br)"
W="https://www.noticiasagricolas.com.br/widgets/noticias?subsecao=2,3,162,6,7,8,10,64,85,146,216,5,4,11,160,215,12,156,40,158,60,13,163,97,14,95,205,15,1,80,155,84,28,212,149,26,69,90,62,27,92,148,154,32,67,101,102,103,105,207,106,107,109,213,147,206,110,111,112,113,159,114,157,115,116,217,210,68,218,164,117,118,119,214,204,211,120,121,108,203,166&largura=300px&altura=250px&fonte=Arial&tamanho=10pt&cortexto=333333&corlink=006666&qtd=15&output=js"
curl -sL -m 25 -A "$UA" -o /tmp/w -w "widget %{http_code} %{content_type} %{size_download}\n" "$W"; head -c 2500 /tmp/w; echo
for u in https://www.noticiasagricolas.com.br/rss https://www.noticiasagricolas.com.br/rss/ https://www.noticiasagricolas.com.br/noticias/rss https://www.noticiasagricolas.com.br/feed; do
  code=$(curl -sL -m 25 -A "$UA" -o /tmp/r -w "%{http_code} %{content_type}" "$u"); n=$(grep -o "<item" /tmp/r | wc -l); echo "$code | $n itens | $u"; done
curl -sL -m 25 -A "$UA" https://www.noticiasagricolas.com.br/ | grep -io 'href="[^"]*rss[^"]*"\|application/rss+xml[^>]*' | head
