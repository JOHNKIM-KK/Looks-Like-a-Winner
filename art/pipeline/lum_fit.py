"""Calibration helper: mean luminance of the horse (alpha>0.5) for every shipped camera at a few gallop frames.
blender -b -P lum_fit.py -- '<json LOOK overrides>'   -> prints LUM {set_angle: mean}"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, bpy, lib, horse, cameras
lib.LOOK.update(json.loads(lib.argv()[0]))
res = {}
lib.reset(); Hs = horse.build()
lib.set_action(Hs['arm'], 'AnimalArmature|Gallop')
for set_, cs in cameras.SETS.items():
    for ai, yaw in enumerate(cs['yaws']):
        for o in [o for o in bpy.data.objects if o.type == 'CAMERA']: bpy.data.objects.remove(o)
        lib.setup_render(360, 300, 10)
        cam = lib.make_camera(cs['elev'], yaw, (0, 0, 0), 360, 300); lib.make_light(cam)
        vals = []
        for t in (0, 14 * 3 / 12, 14 * 6 / 12, 14 * 9 / 12):
            lib.pose_at(t); lib.render_to('/private/tmp/claude-501/lf.png')
            img = bpy.data.images.load('/private/tmp/claude-501/lf.png'); img.colorspace_settings.name = 'Non-Color'
            px = np.array(img.pixels[:]).reshape(-1, 4); bpy.data.images.remove(img)
            m = px[:, 3] > 0.5
            vals.append(float((255 * (0.2126 * px[m, 0] + 0.7152 * px[m, 1] + 0.0722 * px[m, 2])).mean()))
        res[f'{set_}{ai}'] = sum(vals) / len(vals)
print('LUM', json.dumps(res))
