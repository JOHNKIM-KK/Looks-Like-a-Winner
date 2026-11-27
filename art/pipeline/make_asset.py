"""One command per non-horse asset.
  python make_asset.py bike|titan [--clip run|grab] [--out DIR] [--sets straight,corner] [--angles 0,2] [--samples 48]
Writes <out>/<name>_<set>_{color,mask}_a<i>.webp and <out>/<name>.json."""
import argparse, json, os, shutil, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sheetlib, cameras

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
BLENDER = os.environ.get('BLENDER', shutil.which('blender') or '/Applications/Blender.app/Contents/MacOS/Blender')
PX = 96.9697

ASSETS = {
    'bike': dict(clips={'ride': dict(n=6, fps=12, loop=True)}, out='public/vehicles', px_per_m=PX, canvas='480x420',
                 sets={'straight': [0, 1, 2, 3, 4], 'corner': [0, 1, 2]}, mask='G = rider silks (shirt + helmet) -> lane color; everything else 0',
                 note='motorcycle + helmeted rider, heading right; anchor = ground point under the bike centre; color sheet shades the silks in neutral grey like jockey/*'),
    'titan': dict(clips={'run': dict(n=8, fps=12, loop=True), 'grab': dict(n=10, fps=10, loop=False)}, out='public/titan', px_per_m=PX / 4, canvas='760x800',
                  sets={'straight': [1, 2, 3], 'corner': [1]}, mask=None,
                  note='original giant; sheets are rendered at px_per_m/4 - draw them at 4x scale (scale_up)'),
}

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode or 'Traceback' in r.stdout + r.stderr:
        sys.exit('blender failed:\n' + r.stdout[-2500:] + r.stderr[-2500:])

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('asset', choices=ASSETS)
    ap.add_argument('--clip'); ap.add_argument('--out'); ap.add_argument('--sets'); ap.add_argument('--angles')
    ap.add_argument('--samples', type=int, default=48); ap.add_argument('--keep')
    a = ap.parse_args(); cfg = ASSETS[a.asset]
    out = a.out or os.path.join(ROOT, cfg['out']); os.makedirs(out, exist_ok=True)
    tmp = a.keep or tempfile.mkdtemp(prefix=f'{a.asset}_raw_')
    for clip, spec in cfg['clips'].items():
        if a.clip and clip != a.clip: continue
        n = spec['n']
        meta = dict(px_per_m=cfg['px_per_m'], world_px_per_m=PX, scale_up=round(PX / cfg['px_per_m'], 4), fps=spec['fps'], frames=n, loop=spec['loop'],
                    note=cfg['note'], facing='right (+screen x). Mirror horizontally for the inside of the bend.',
                    mask={'G': cfg['mask'], 'R': 'unused (0)', 'B': 'unused (0)'} if cfg['mask'] else None, sets={})
        for sname, idx in cfg['sets'].items():
            if a.sets and sname not in a.sets.split(','): continue
            cs = cameras.SETS[sname]; angs = []
            for ai in ([int(x) for x in a.angles.split(',')] if a.angles else idx):
                d = {k: os.path.join(tmp, f'{clip}_{sname}{ai}_{k}') for k in ('color', 'mask')}
                for kind in ('color', 'mask') if cfg['mask'] else ('color',):
                    run([BLENDER, '-b', '-P', os.path.join(HERE, 'render_asset.py'), '--', '--asset', a.asset, '--clip', clip, '--n', str(n), '--set', sname,
                         '--angle', str(ai), '--out', d[kind], '--canvas', cfg['canvas'], '--samples', str(a.samples), '--px-per-m', str(cfg['px_per_m'])]
                        + (['--mask'] if kind == 'mask' else []))
                m = json.load(open(os.path.join(d['color'], 'meta.json')))
                name = f'{clip}'
                cn = f'{name}_{sname}_color_a{ai}.webp'; mn = f'{name}_{sname}_mask_a{ai}.webp'
                info = sheetlib.build_sheet(d['color'], d['mask'] if cfg['mask'] else None, n, os.path.join(out, cn), os.path.join(out, mn) if cfg['mask'] else None, tuple(m['target']))
                info.pop('plate_per_frame', None)
                ox, oy = info.pop('crop_origin')
                for key in ('hand_px', 'ground_px'):
                    if m.get('points') and key in m['points'][0] and (key != 'hand_px' or clip == 'grab'):
                        info[key] = [[round(pt[key][0] - ox, 1), round(pt[key][1] - oy, 1)] for pt in m['points']]
                angs.append(dict(index=ai, yaw_deg=cs['yaws'][ai], color=cn, **({'mask': mn} if cfg['mask'] else {}), sheet=f'{n} frames in one row', **info,
                                 anchor_note='ground point under the asset origin (frame pixels)'))
            if angs: meta['sets'][sname] = dict(camera_elevation_deg=cs['elev'], angles=angs)
        json.dump(meta, open(os.path.join(out, f'{clip}.json'), 'w'), indent=1)
        print('wrote', out, clip)

if __name__ == '__main__':
    main()
