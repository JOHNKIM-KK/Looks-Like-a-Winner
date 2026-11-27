"""Shared Blender helpers for the sprite pipeline. Run through `blender -b -P script.py -- args`."""
import bpy, math, sys, os, json, bmesh
from mathutils import Vector, Matrix, Quaternion

PX_PER_M = 96.9697
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'art', 'sources')

# Tunables found by calibration against the shipped gallop sheets (see CALIBRATION.md).
LOOK = dict(
    horse_scale=0.44,      # glb units -> metres
    sun_strength=1.457,
    sun_dir_cam=(-0.334, 0.720, 0.640),  # direction TOWARD the sun in camera space (x right, y up, z to camera)
    ambient=0.3226,
    exposure=0.2,
    view='Standard',
)

if os.environ.get('LOOK_JSON'):
    LOOK.update(json.loads(os.environ['LOOK_JSON']))

def argv():
    a = sys.argv
    return a[a.index('--') + 1:] if '--' in a else []

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]

def find(objs, typ):
    return [o for o in objs if o.type == typ]

def set_action(arm, name):
    act = bpy.data.actions[name]
    if arm.animation_data is None:
        arm.animation_data_create()
    arm.animation_data.action = act
    if hasattr(arm.animation_data, 'action_slot') and act.slots:
        arm.animation_data.action_slot = act.slots[0]
    return act

def pose_at(frame):
    """frame may be fractional."""
    f = math.floor(frame)
    bpy.context.scene.frame_set(f, subframe=frame - f)

def setup_render(w, h, samples=48, mask=False):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 1 if mask else samples
    sc.cycles.use_denoising = False
    sc.cycles.filter_width = 0.01 if mask else 1.5
    sc.render.resolution_x, sc.render.resolution_y = int(w), int(h)
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.view_settings.exposure = LOOK['exposure']
    sc.display_settings.display_device = 'sRGB'

def make_camera(elev_deg, yaw_deg, target, w, h, px_per_m=PX_PER_M, dist=60.0):
    """Orthographic camera. yaw 0 = pure side profile (horse faces screen right); negative = seen from the front.
    Horse heading is +Y, its right side is +X. yaw rule from horses.json: toCam = r*cos(yaw) - h*sin(yaw)."""
    yaw, el = math.radians(yaw_deg), math.radians(elev_deg)
    tocam = Vector((math.cos(yaw), -math.sin(yaw), 0))  # r=+X, h=+Y
    pos = Vector(target) + dist * (tocam * math.cos(el) + Vector((0, 0, math.sin(el))))
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    bpy.context.scene.collection.objects.link(cam)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = max(w, h) / px_per_m
    cam.data.clip_start, cam.data.clip_end = 1, 300
    cam.location = pos
    cam.rotation_euler = (Vector(target) - pos).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam
    return cam

def make_light(cam, strength=None, ambient=None):
    for o in [o for o in bpy.data.objects if o.type == 'LIGHT']:
        bpy.data.objects.remove(o)
    strength = LOOK['sun_strength'] if strength is None else strength
    ambient = LOOK['ambient'] if ambient is None else ambient
    ld = bpy.data.lights.new('Sun', 'SUN'); ld.energy = strength; ld.angle = math.radians(5)
    sun = bpy.data.objects.new('Sun', ld); bpy.context.scene.collection.objects.link(sun)
    d_cam = Vector(LOOK['sun_dir_cam']).normalized()
    bpy.context.view_layer.update()
    d_world = cam.matrix_world.to_3x3() @ d_cam           # toward the sun
    sun.rotation_euler = (-d_world).to_track_quat('-Z', 'Y').to_euler()
    w = bpy.data.worlds.new('W'); w.use_nodes = True
    bg = w.node_tree.nodes['Background']; bg.inputs[0].default_value = (1, 1, 1, 1); bg.inputs[1].default_value = ambient
    bpy.context.scene.world = w

def emission_mat(name, rgb):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    e = nt.nodes.new('ShaderNodeEmission'); e.inputs[0].default_value = (*rgb, 1); e.inputs[1].default_value = 1
    o = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(e.outputs[0], o.inputs[0])
    return m

def render_to(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)

def pose_blend(arm, items, prefix='AnimalArmature|'):
    """items = [(action, frame, weight)]; sets the pose to the weighted mix (loc/scale lerp, quaternion nlerp)."""
    acc = {}
    tot = sum(w for _, _, w in items)
    for name, t, w in items:
        set_action(arm, prefix + name); pose_at(t)
        for pb in arm.pose.bones:
            a = acc.setdefault(pb.name, [Vector((0, 0, 0)), None, Vector((0, 0, 0))])
            a[0] += pb.location * (w / tot); a[2] += pb.scale * (w / tot)
            q = pb.rotation_quaternion.copy()
            if a[1] is None: a[1] = [Quaternion((0, 0, 0, 0)), q.copy()]
            if q.dot(a[1][1]) < 0: q.negate()
            a[1][0] = Quaternion([a[1][0][i] + q[i] * (w / tot) for i in range(4)])
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        loc, qq, sc = acc[pb.name]
        pb.location = loc; pb.scale = sc
        q = qq[0]; q.normalize(); pb.rotation_quaternion = q
    bpy.context.view_layer.update()

def project_px(cam, point, w, h):
    from bpy_extras.object_utils import world_to_camera_view
    v = world_to_camera_view(bpy.context.scene, cam, Vector(point))
    return (v.x * w, (1 - v.y) * h)
