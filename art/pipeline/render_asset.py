"""Render raw frames of a non-horse asset (bike, titan).
blender -b -P render_asset.py -- --asset bike --n 6 --set straight --angle 2 --out DIR [--mask] [--px-per-m 96.9697]"""
import sys, os, json, argparse, importlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, lib, cameras

p = argparse.ArgumentParser()
p.add_argument('--asset', required=True); p.add_argument('--clip', default='')
p.add_argument('--n', type=int, required=True)
p.add_argument('--set', required=True); p.add_argument('--angle', type=int, required=True)
p.add_argument('--out', required=True); p.add_argument('--mask', action='store_true')
p.add_argument('--canvas', default='480x420'); p.add_argument('--samples', type=int, default=48)
p.add_argument('--px-per-m', type=float, default=lib.PX_PER_M)
a = p.parse_args(lib.argv())
W, H = map(int, a.canvas.split('x'))
os.makedirs(a.out, exist_ok=True)
mod = importlib.import_module(a.asset)
lib.reset()
S = mod.build(mask=a.mask)
lib.setup_render(W, H, a.samples, mask=a.mask)
cs = cameras.SETS[a.set]
cam = lib.make_camera(cs['elev'], cs['yaws'][a.angle], mod.ground_anchor(S), W, H, px_per_m=a.px_per_m)
if not a.mask: lib.make_light(cam)
else:
    w = bpy.data.worlds.new('W'); w.use_nodes = True; w.node_tree.nodes['Background'].inputs[1].default_value = 0; bpy.context.scene.world = w
pts = []
for i in range(a.n):
    mod.pose(S, i, a.n, a.clip) if a.clip else mod.pose(S, i, a.n)
    bpy.context.view_layer.update()
    lib.render_to(os.path.join(a.out, f'f{i:03d}.png'))
    if hasattr(mod, 'frame_points'):
        pts.append({k: [round(c, 2) for c in lib.project_px(cam, v, W, H)] for k, v in mod.frame_points(S).items()})
json.dump(dict(W=W, H=H, target=[W / 2, H / 2], points=pts), open(os.path.join(a.out, 'meta.json'), 'w'))
