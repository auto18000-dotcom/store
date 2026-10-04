import json, re, sys, html
import xml.etree.ElementTree as ET

src = sys.argv[1]
out = sys.argv[2]
raw = open(src, encoding='utf-8').read()
data = json.loads(raw)
xml = data['data']['xml']

tags = sorted(set(re.findall(r'<([a-zA-Z][a-zA-Z0-9]*)', xml)))
print('TAGS:', tags)

root = ET.fromstring(xml)

lines = []

def text_of(el):
    parts = []
    if el.tag == 'text':
        t = ''.join(el.itertext())
        # inline code marks
        parts.append(t)
        return ''.join(parts)
    for ch in el:
        if ch.tag in ('text', 'code'):
            parts.append(''.join(ch.itertext()))
        elif ch.tag == 'date':
            parts.append(ch.get('value', ''))
        elif ch.tag == 'mention':
            parts.append('@' + (ch.get('name') or ''))
        elif ch.tag == 'link':
            parts.append(''.join(ch.itertext()) + ' <' + (ch.get('href') or ch.get('url') or '') + '>')
        else:
            parts.append(text_of(ch))
    return ''.join(parts)

def walk(el, depth=0):
    tag = el.tag
    if tag == 'paragraph':
        h = el.get('heading')
        t = text_of(el)
        # code-inside-text: ET.itertext already flattens
        if h:
            lines.append('')
            lines.append('#' * int(h) + ' ' + t)
        else:
            lines.append('  ' * depth + t)
        return
    if tag == 'list':
        for li in el:
            walk(li, depth + 1)
        return
    if tag == 'listItem':
        # first paragraph is the bullet text
        first = True
        for ch in el:
            if ch.tag == 'paragraph':
                t = text_of(ch)
                lines.append('  ' * (depth - 1) + ('- ' if first else '  ') + t)
                first = False
            else:
                walk(ch, depth + 1)
        return
    if tag in ('table',):
        lines.append('')
        lines.append('[TABLE]')
        for row in el.iter():
            if row.tag in ('row', 'tr'):
                cells = []
                for c in row:
                    cells.append(' / '.join(x for x in [text_of(p) if p.tag != 'paragraph' else text_of(p) for p in c.iter() if p.tag == 'paragraph'] if x) if c.tag in ('cell', 'td', 'th') else '')
                lines.append(' | '.join(cells))
        lines.append('[/TABLE]')
        return
    for ch in el:
        walk(ch, depth)

walk(root)
open(out, 'w', encoding='utf-8').write('\n'.join(lines))
print('lines', len(lines))
