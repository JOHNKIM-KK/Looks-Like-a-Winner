"""Render raw horse frames to PNG.
blender -b -P render_horse.py -- --action Gallop --times 0,1.1667 --set straight --angle 2 --out DIR [--mask] [--noloop]
Writes DIR/f000.png ... and DIR/meta.json (canvas size, target pixel). Target (ground point under horse centre) is the canvas centre."""
import sys, os, json, argparse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, lib, horse, cameras

p = argparse.ArgumentParser()
p.add_argument('--action'); p.add_argument('--times')
p.add_argument('--poses', help="';'-separated recipes: Action@frame*weight+Action@frame*weight")
p.add_argument('--set', required=True); p.add_argument('--angle', type=int, required=True)
p.add_argument('--out', required=True); p.add_argument('--mask', action='store_true')
p.add_argument('--canvas', default='520x420'); p.add_argument('--samples', type=int, default=48)
p.add_argument('--no-cloth', action='store_true')
p.add_argument('--root-offset', default='0,0,0', help='horse-local metres: centre point along axis (+y forward), ground z')
a = p.parse_args(lib.argv())
W, H = map(int, a.canvas.split('x'))
os.makedirs(a.out, exist_ok=True)
lib.reset()
Hs = horse.build(mask=a.mask, with_cloth=not a.no_cloth)
lib.setup_render(W, H, a.samples, mask=a.mask)
cs = cameras.SETS[a.set]
tx, ty, tz = map(float, a.root_offset.split(','))
cam = lib.make_camera(cs['elev'], cs['yaws'][a.angle], (tx, ty, tz), W, H)
if not a.mask: lib.make_light(cam)
else:
    w = bpy.data.worlds.new('W'); w.use_nodes = True; w.node_tree.nodes['Background'].inputs[1].default_value = 0; bpy.context.scene.world = w
recipes = a.poses.split(';') if a.poses else [f'{a.action}@{t}' for t in a.times.split(',')]
def parse(r):
    out = []
    for part in r.split('+'):
        name, rest = part.split('@'); t, _, w = rest.partition('*'); out.append((name, float(t), float(w or 1)))
    return out
body_px = []
for i, r in enumerate(recipes):
    lib.pose_blend(Hs['arm'], parse(r))
    pb = Hs['arm'].pose.bones['Body']; wp = Hs['arm'].matrix_world @ pb.head
    body_px.append(lib.project_px(cam, (wp.x, wp.y, 0), W, H))
    lib.render_to(os.path.join(a.out, f'f{i:03d}.png'))
json.dump(dict(W=W, H=H, target=[W / 2, H / 2], body_px=body_px), open(os.path.join(a.out, 'meta.json'), 'w'))
