set +e
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36"
mkdir -p /tmp/f
curl -sL -m 30 -A "$UA" https://invezz.com/pt/feeds/ -o /tmp/f/invezz.html -w "invezz page %{http_code}\n"
curl -sL -m 30 -A "$UA" "https://www.globenewswire.com/rss/list" -o /tmp/f/gnw.html -w "gnw page %{http_code}\n"
python3 - <<'PY'
import re,subprocess,html,email.utils,datetime
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36"
def links(f,pat):
    s=open(f,errors='ignore').read()
    return sorted(set(html.unescape(u) for u in re.findall(r'href="([^"]+)"',s) if re.search(pat,u)))
inv=links('/tmp/f/invezz.html',r'feed')
gnw=links('/tmp/f/gnw.html',r'RssFeed|rss/')
print('INVEZZ links',len(inv)); print('\n'.join(inv[:80]))
print('GNW links',len(gnw)); print('\n'.join(gnw[:200]))
def probe(u):
    if u.startswith('/'): u=('https://invezz.com' if 'invezz' in u else 'https://www.globenewswire.com')+u
    try: s=subprocess.run(['curl','-sL','-m','25','-A',UA,u],capture_output=True,timeout=40).stdout.decode('utf-8','ignore')
    except Exception as e: print('ERR',u,e); return
    items=re.findall(r'<item[\s>][\s\S]*?</item>|<entry[\s>][\s\S]*?</entry>',s)
    ds=[]
    for it in items:
        m=re.search(r'<pubDate>([^<]+)|<published>([^<]+)|<dc:date>([^<]+)',it)
        if m:
            t=next(x for x in m.groups() if x)
            try: ds.append(email.utils.parsedate_to_datetime(t))
            except Exception:
                try: ds.append(datetime.datetime.fromisoformat(t.strip().replace('Z','+00:00')))
                except Exception: pass
    tit=[html.unescape(re.sub(r'<!\[CDATA\[|\]\]>','',x)).strip() for x in re.findall(r'<title>([\s\S]*?)</title>',s)[1:4]]
    print(f'FEED {u} | {len(items)} itens | mais novo {max(ds) if ds else "-"} | {tit}')
for u in inv[:30]: probe(u)
cand=[u for u in gnw if re.search(r'(?i)financ|bank|econom|market|stock|earn|energy|mining|crypto|brazil|latin|commod|oil|gold',u)][:25]
for u in cand: probe(u)
PY
