import sys, zipfile, re, io, os
from xml.etree import ElementTree as ET
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
OUT = os.path.dirname(os.path.abspath(__file__))

def text_of(p):
    out = []
    for n in p.iter():
        if n.tag == W + 't': out.append(n.text or '')
        elif n.tag == W + 'tab': out.append('\t')
        elif n.tag == W + 'br': out.append('\n')
    return ''.join(out)

def dump(path):
    z = zipfile.ZipFile(path)
    root = ET.fromstring(z.read('word/document.xml'))
    body = root.find(W + 'body')
    lines = []
    def walk(el):
        for ch in el:
            if ch.tag == W + 'p':
                st = ch.find(W + 'pPr/' + W + 'pStyle')
                style = st.get(W + 'val') if st is not None else ''
                num = ch.find(W + 'pPr/' + W + 'numPr')
                t = text_of(ch).strip()
                if not t: continue
                pre = ''
                if style.lower().startswith('heading'): pre = '#' * int(re.sub(r'\D', '', style) or 1) + ' '
                elif num is not None: pre = '- '
                lines.append(pre + t)
            elif ch.tag == W + 'tbl':
                for tr in ch.iter(W + 'tr'):
                    cells = []
                    for tc in tr.findall(W + 'tc'):
                        cells.append(' '.join(text_of(p).strip() for p in tc.iter(W + 'p') if text_of(p).strip()))
                    lines.append('| ' + ' | '.join(cells) + ' |')
                lines.append('')
            elif ch.tag == W + 'sdt':
                c = ch.find(W + 'sdtContent')
                if c is not None: walk(c)
    walk(body)
    media = [n for n in z.namelist() if n.startswith('word/media/')]
    return '\n'.join(lines), media

for p in sys.argv[1:]:
    t, media = dump(p)
    name = os.path.basename(p).replace('.docx', '.txt')
    io.open(os.path.join(OUT, name), 'w', encoding='utf-8').write(t)
    print(name, len(t), 'chars', len(t.split()), 'words; images inside:', len(media), media[:6])
