#!/usr/bin/env python3
"""Build static TeX package archives (TeX Live layout, .tar.xz) from a local texmf-dist tree.

The engine asks for  <runtime>/api/texlive/<package>  when a document needs a file that is
not in its built-in bundles. This script groups the files of a local TeX Live install into
packages (using the runtime's own file->package index) and writes one archive per package,
so the packages can be served by any static host.

usage: build_packages.py <texmf-dist> <runtime-dir>
"""
import collections, io, json, lzma, os, sys, tarfile

texmf, rt = sys.argv[1].rstrip('/'), sys.argv[2].rstrip('/')
B = f'{rt}/bundles'
f2p = json.load(open(f'{B}/file-to-package.json'))
font2p = json.load(open(f'{B}/font-file-to-package.json'))
bundled = {os.path.basename(p) for p in json.load(open(f'{B}/file-manifest.json'))}
out = f'{rt}/api/texlive'
os.makedirs(out, exist_ok=True)

TOPS = ('tex', 'bibtex', 'fonts')
SKIP_FMT = {'tex/context', 'tex/luatex', 'tex/lualatex', 'tex/xelatex', 'tex/xetex', 'tex/optex',
            'tex/cslatex', 'tex/csplain', 'tex/mex', 'tex/texinfo', 'tex/aleph', 'tex/lambda',
            'tex/platex', 'tex/uplatex', 'tex/jadetex', 'tex/xmltex', 'tex/eplain', 'tex/amstex',
            'tex/mltex', 'tex/fontinst', 'tex/alatex', 'tex/latex-dev', 'tex/ptex', 'tex/uptex',
            'fonts/source', 'fonts/afm', 'fonts/opentype', 'fonts/truetype', 'fonts/pk', 'fonts/ofm',
            'fonts/ovf', 'fonts/ovp', 'fonts/opl', 'fonts/sfd', 'fonts/cmap', 'fonts/misc', 'fonts/lig',
            'fonts/cid', 'fonts/type3', 'fonts/pfm', 'fonts/tlg', 'bibtex/csf'}

def depth_key(rel):
    parts = rel.split('/')
    if parts[0] == 'fonts':            # fonts/<kind>/<supplier>/<name>/...
        return '/'.join(parts[:4]) if len(parts) > 4 else '/'.join(parts[:-1])
    return '/'.join(parts[:3]) if len(parts) > 3 else '/'.join(parts[:-1])

dirs = collections.defaultdict(list)
for top in TOPS:
    for d, _, files in os.walk(f'{texmf}/{top}'):
        rel_d = os.path.relpath(d, texmf)
        if any(rel_d == s or rel_d.startswith(s + '/') for s in SKIP_FMT):
            continue
        for f in files:
            rel = f'{rel_d}/{f}'
            dirs[depth_key(rel)].append(rel)

pkgs = collections.defaultdict(list)
for key, files in dirs.items():
    votes = collections.Counter()
    for rel in files:
        base = os.path.basename(rel)
        p = f2p.get(base) or font2p.get(os.path.splitext(base)[0])
        if p:
            votes[p] += 1
    name = votes.most_common(1)[0][0] if votes else key.split('/')[-1]
    pkgs[name].extend(files)

# Huge packages nobody needs for papers (Greek bitmap fonts, emoji sets)
DROP = {'cbfonts', 'twemojis', 'hwemoji'}
index, total, skipped, added = {}, 0, 0, 0
for name, files in sorted(pkgs.items()):
    if name in DROP:
        continue
    if all(os.path.basename(f) in bundled for f in files):
        skipped += 1
        continue
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode='w', format=tarfile.USTAR_FORMAT) as tar:
        for rel in sorted(files):
            try:
                tar.add(f'{texmf}/{rel}', arcname=rel, recursive=False)
            except ValueError:      # path too long for ustar; none of these matter in practice
                print('skip long path', rel, file=sys.stderr)
    data = lzma.compress(buf.getvalue(), preset=6)
    safe = name.replace('/', '_')
    with open(f'{out}/{safe}', 'wb') as fh:
        fh.write(data)
    index[safe] = {'files': len(files), 'bytes': len(data)}
    for rel in files:               # teach the engine where files it does not know about live
        base = os.path.basename(rel)
        if base not in f2p and base not in bundled and rel.split('/')[0] != 'fonts':
            f2p[base] = safe
            added += 1
    total += len(data)

json.dump(index, open(f'{rt}/api/packages.json', 'w'), separators=(',', ':'))
json.dump(f2p, open(f'{B}/file-to-package.json', 'w'), separators=(',', ':'))
print(added, 'file names added to the index')
print(f'{len(index)} packages, {total/1e6:.1f} MB, {skipped} already bundled')
big = sorted(index.items(), key=lambda kv: -kv[1]['bytes'])[:25]
print(', '.join(f"{k} {v['bytes']/1e6:.1f}" for k, v in big))

# BibTeX styles: the engine only knows its bundled .bst files, so publish the rest as plain
# files; the editor adds the one a document asks for to the compile.
import shutil
os.makedirs(f'{rt}/bst', exist_ok=True)
names = []
for d, _, files in os.walk(f'{texmf}/bibtex/bst'):
    for f in files:
        if f.endswith('.bst') and f not in bundled:
            shutil.copyfile(f'{d}/{f}', f'{rt}/bst/{f}')
            names.append(f[:-4])
json.dump(sorted(names), open(f'{rt}/bst/index.json', 'w'), separators=(',', ':'))
print(len(names), 'bibliography styles')
