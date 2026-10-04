import re, sys, urllib.request, html

def get(url, ua='Mozilla/5.0 (compatible; TourGuidAudit/1.0)'):
    req = urllib.request.Request(url, headers={'User-Agent': ua})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status, dict(r.headers), r.read().decode('utf-8', 'replace')

status, headers, sm = get('https://tourguid.net/sitemap.xml')
urls = re.findall(r'<loc>([^<]+)</loc>', sm)
lastmods = re.findall(r'<lastmod>([^<]+)</lastmod>', sm)
print('sitemap urls:', len(urls), 'lastmod entries:', len(lastmods), 'distinct lastmods:', sorted(set(lastmods)))
print()
extra = ['https://tourguid.net/store/activities?destination=Paris', 'https://tourguid.net/store/detail?item=seine-cruise']
for u in urls + extra:
    try:
        status, headers, body = get(u)
    except Exception as e:
        print(u, 'ERROR', e); continue
    def one(pattern, flags=re.I | re.S):
        m = re.search(pattern, body, flags)
        return html.unescape(m.group(1).strip()) if m else None
    title = one(r'<title>(.*?)</title>')
    desc = one(r'<meta[^>]+name=["\']description["\'][^>]+content=["\'](.*?)["\']')
    canon = one(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\'](.*?)["\']')
    robots = one(r'<meta[^>]+name=["\']robots["\'][^>]+content=["\'](.*?)["\']')
    ogt = one(r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\'](.*?)["\']')
    ogi = one(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\'](.*?)["\']')
    ld = len(re.findall(r'application/ld\+json', body))
    h1 = len(re.findall(r'<h1[ >]', body, re.I))
    text = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', body, flags=re.S | re.I)
    text = re.sub(r'<[^>]+>', ' ', text)
    words = len(re.findall(r'\w+', html.unescape(text)))
    lang = one(r'<html[^>]+lang=["\'](.*?)["\']')
    print(u)
    print(f'  status {status} | x-robots-tag: {headers.get("X-Robots-Tag")} | cache-control: {headers.get("Cache-Control")}')
    print(f'  title: {title!r} ({len(title or "")} chars)')
    print(f'  description: {desc!r} ({len(desc or "")} chars)')
    print(f'  canonical: {canon} | robots meta: {robots} | lang: {lang}')
    print(f'  og:title: {ogt!r} | og:image: {ogi} | json-ld blocks: {ld} | h1 count: {h1} | visible words in raw HTML: {words}')
    print()
