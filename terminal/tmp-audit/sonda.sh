set +e
for u in https://invezz.com/pt/feed/ https://invezz.com/pt/noticias/economia/feed/ https://invezz.com/pt/noticias/mercado-de-acoes/feed/ "https://www.globenewswire.com/RssFeed/orgclass/1/feedTitle/GlobeNewswire%20-%20News%20about%20Public%20Companies" "https://www.globenewswire.com/RssFeed/country/Brazil/feedTitle/GlobeNewswire%20-%20News%20from%20Brazil"; do
  code=$(curl -sL -m 25 -A "MercadoMacro-RSS/1.0 (+https://mercadomacro.com.br)" -o /tmp/r -w "%{http_code} %{content_type}" "$u")
  n=$(grep -o "<item" /tmp/r | wc -l); d=$(grep -o "<pubDate>[^<]*" /tmp/r | head -1)
  t=$(grep -o "<title>[^<]*</title>\|<title><!\[CDATA\[[^]]*" /tmp/r | sed -n 2,6p | tr '\n' '|')
  echo "$code | $n itens | $d | $t | $(echo $u | cut -c1-90)"
done
