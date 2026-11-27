"""One command per horse action sheet set (needs Blender on PATH or BLENDER env, and Pillow+numpy in this Python).
  python make_horse.py gallop|fall|down|walk|graze [--out DIR] [--sets straight,corner] [--angles 0,2] [--samples 48]
Writes <out>/<action>_<set>_{color,mask}_a<i>.webp and <out>/<action>.json (horses.json schema)."""
import argparse, json, os, shutil, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sheetlib, cameras

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
BLENDER = os.environ.get('BLENDER', shutil.which('blender') or '/Applications/Blender.app/Contents/MacOS/Blender')
PX_PER_M = 96.9697

def g(k): return f'Gallop@{k * 14 / 12:.4f}'
ACTIONS = {
    # calibration target: the shipped gallop sheets
    'gallop': dict(poses=[g(k) for k in range(12)], loop=True, fps=24,
                   note='12 frames sampled from the 14-frame Quaternius Gallop cycle (t = k*14/12)'),
    # galloping -> stumble -> lying. Frames 0-2 blend the gallop pose into Death so there is no pop.
    'fall': dict(poses=['Gallop@0', 'Gallop@1.1667*0.6+Death@2*0.4', 'Gallop@2.3333*0.2+Death@4*0.8', 'Death@6', 'Death@8',
                        'Death@10', 'Death@12', 'Death@15'], loop=False, fps=16,
                 note='non-loop; ends in the pose of the first frame of `down`'),
    'down': dict(poses=['Death@24', 'Death@24+Death@16*0.0'], loop=True, fps=2, note='lying on the ground, idle loop', dedupe=True),
    'walk': dict(poses=[f'Walk@{k * 28 / 8:.4f}' for k in range(8)], loop=True, fps=12,
                 note='8 frames from the 28-frame Walk cycle; in place. Move the sprite at ~1.6 m/s (walk stride)'),
    'graze': dict(poses=[f'Eating@{t}' for t in (0, 10, 22, 45, 75, 105, 126, 138)], loop=True, fps=4,
                  note='8 frames spanning the 144-frame Eating clip; standing still'),
}

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode or 'Traceback' in r.stdout + r.stderr:
        sys.exit('blender failed:\n' + r.stdout[-2000:] + r.stderr[-2000:])

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('action', choices=ACTIONS)
    ap.add_argument('--out', default=os.path.join(ROOT, 'public/horses/events'))
    ap.add_argument('--sets', default='straight,corner'); ap.add_argument('--angles')
    ap.add_argument('--samples', type=int, default=48); ap.add_argument('--canvas', default='560x460')
    ap.add_argument('--keep', help='keep raw frames in this dir')
    a = ap.parse_args()
    spec = ACTIONS[a.action]; n = len(spec['poses']); poses = ';'.join(spec['poses'])
    W, H = map(int, a.canvas.split('x')); os.makedirs(a.out, exist_ok=True)
    meta = dict(px_per_m=PX_PER_M, fps=spec['fps'], frames=n, loop=spec['loop'], note=spec['note'],
                facing='right (+screen x). Mirror horizontally for horses seen from the inside of the bend (corner).',
                mask=dict(R='coat (do not tint)', G='saddle cloth only -> lane color', B='number plate -> lane color panel'),
                riderless=True, sets={})
    tmp = a.keep or tempfile.mkdtemp(prefix='horse_raw_')
    for sname in a.sets.split(','):
        cs = cameras.SETS[sname]; angs = []
        idx = [int(x) for x in a.angles.split(',')] if a.angles else range(len(cs['yaws']))
        for ai in idx:
            d = {k: os.path.join(tmp, f'{a.action}_{sname}{ai}_{k}') for k in ('color', 'mask')}
            for kind in ('color', 'mask'):
                cmd = [BLENDER, '-b', '-P', os.path.join(HERE, 'render_horse.py'), '--', '--poses', poses, '--set', sname, '--angle', str(ai),
                       '--out', d[kind], '--canvas', a.canvas, '--samples', str(a.samples)] + (['--mask'] if kind == 'mask' else [])
                run(cmd)
            m = json.load(open(os.path.join(d['color'], 'meta.json')))
            cn = f'{a.action}_{sname}_color_a{ai}.webp'; mn = f'{a.action}_{sname}_mask_a{ai}.webp'
            info = sheetlib.build_sheet(d['color'], d['mask'], n, os.path.join(a.out, cn), os.path.join(a.out, mn),
                                        (m['target'][0], m['target'][1] - 0.3), per_frame_anchor_px=m['body_px'])
            angs.append(dict(index=ai, yaw_deg=cs['yaws'][ai], color=cn, mask=mn, sheet=f'{n} frames in one row', **info,
                             anchor_note='ground point under the rig origin; per_frame_anchor = ground point under the Body bone each frame'))
        meta['sets'][sname] = dict(camera_elevation_deg=cs['elev'], angles=angs)
    json.dump(meta, open(os.path.join(a.out, f'{a.action}.json'), 'w'), indent=1)
    print('wrote', a.out, a.action)

if __name__ == '__main__':
    main()
