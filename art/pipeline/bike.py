"""Motorcycle (CC0 'Cartoony Purple Motorcycle', AliceCassie) + helmeted rider (Quaternius Man). Heading +Y."""
import bpy, bmesh, math, os
from mathutils import Vector
import lib, human

BIKE_SCALE = 2.0
WHEEL_R = 0.145
AXLES = {'WheelR': -0.40, 'WheelF': 0.30}  # y of the axle in model units (z = 0.14)
CENTER_Y = -0.05                            # model-space point that becomes the anchor
SPIN_STEP_DEG = 7.5
SILK = (0.5, 0.5, 0.5)

def _split_wheels(obj):
    me = obj.data; bm = bmesh.new(); bm.from_mesh(me)
    parts = {}
    for name, yc in AXLES.items():
        sel = [v for v in bm.verts if math.hypot(v.co.y - yc, v.co.z - 0.14) <= WHEEL_R and abs(v.co.x) <= 0.12]
        faces = [f for f in bm.faces if all(v in sel for v in f.verts)]
        parts[name] = faces
    wheels = {}
    for name, faces in parts.items():
        nb = bmesh.new()
        # copy faces to a new mesh, delete from the frame
        vmap = {}
        for f in faces:
            vs = []
            for v in f.verts:
                if v not in vmap: vmap[v] = nb.verts.new(v.co - Vector((0, AXLES[name], 0.14)))
                vs.append(vmap[v])
            nf = nb.faces.new(vs); nf.material_index = f.material_index; nf.smooth = False
        wm = bpy.data.meshes.new(name); nb.to_mesh(wm); nb.free()
        for m in me.materials: wm.materials.append(m)
        wo = bpy.data.objects.new(name, wm); bpy.context.scene.collection.objects.link(wo)
        wo.location = (0, AXLES[name], 0.14); wheels[name] = wo
        bmesh.ops.delete(bm, geom=faces, context='FACES')
    bm.to_mesh(me); bm.free()
    return wheels

def build(mask=False):
    objs = lib.import_glb(os.path.join(lib.SRC, 'motorcycle', 'moto.glb'))
    bike = [o for o in objs if o.type == 'MESH'][0]
    for p in bike.data.polygons: p.use_smooth = False
    wheels = _split_wheels(bike)
    parts = [bike] + list(wheels.values())
    rig = bpy.data.objects.new('BRIG', None); bpy.context.scene.collection.objects.link(rig)
    for o in parts: o.parent = rig
    H = human.build(1.72, mask=mask, silk_rgb=SILK)
    helmet = human.add_helmet(H, mask=mask, rgb=SILK, height_m=1.72)
    H['rig'].parent = rig
    if mask:
        black = lib.emission_mat('mk', (0, 0, 0))
        for o in parts:
            for i in range(len(o.data.materials)): o.data.materials[i] = black
    rig.scale = (BIKE_SCALE,) * 3
    rig.location = (0, -CENTER_Y * BIKE_SCALE, 0)
    # the rider rig keeps its own scale relative to the bike rig: undo the bike scale
    H['rig'].scale = tuple(x / BIKE_SCALE for x in H['rig'].scale)
    return dict(rig=rig, bike=bike, wheels=wheels, H=H, helmet=helmet)

SEAT = Vector((0.0, -0.30, 0.285))   # model-space seat top
BARS = Vector((0.11, 0.17, 0.43))      # model-space grip (x is mirrored for the left hand)
PEG = Vector((0.07, -0.02, 0.17))

def bike_world(S, v):
    return S['rig'].matrix_world @ v

def pose_rider(S, bob=0.0, lean=52):
    H = S['H']; arm = H['arm']
    H['rig'].location = S.setdefault('rider_loc0', H['rig'].location.copy())
    lib.pose_blend(arm, [('Man_Sitting', 30, 1)], prefix=human.PREFIX)
    bpy.context.view_layer.update()
    hips = arm.matrix_world @ arm.pose.bones['Hips'].head
    target = bike_world(S, SEAT + Vector((0, 0, 0.075 + bob)))
    H['rig'].location += (target - hips) / S['rig'].scale[0]
    bpy.context.view_layer.update()
    # racing tuck: lean the trunk forward (about the world X axis; +y is forward, so a positive turn tips +z towards +y)
    for b, f in (('Abdomen', 0.4), ('Torso', 0.6)):
        human.rotate_bone(arm, b, (1, 0, 0), -lean * f)
    human.rotate_bone(arm, 'Neck', (1, 0, 0), lean * 0.7)
    human.rotate_bone(arm, 'Head', (1, 0, 0), lean * 0.2)
    for side, sx in (('L', -1), ('R', 1)):
        human.reach(arm, f'UpperArm.{side}', f'LowerArm.{side}', f'Palm.{side}', bike_world(S, Vector((sx * BARS.x, BARS.y, BARS.z))), pole=Vector((sx * 0.6, -0.2, -0.6)))
        human.reach(arm, f'UpperLeg.{side}', f'LowerLeg.{side}', f'Foot.{side}', bike_world(S, Vector((sx * PEG.x, PEG.y, PEG.z))), pole=Vector((sx * 0.3, 1, 0.2)))
    bpy.context.view_layer.update()

def pose(S, i, n, clip='ride'):
    """Frame i of the n-frame loop: wheel roll (periodic for 8-fold spokes) plus a small suspension bob."""
    spin = i * (45.0 / n)
    for w in S['wheels'].values(): w.rotation_euler = (-math.radians(spin), 0, 0)
    ph = 2 * math.pi * i / n
    S['bike'].location.z = 0.004 * math.sin(ph)
    for w in S['wheels'].values(): w.location.z = 0.14   # wheels stay planted
    pose_rider(S, bob=0.008 * math.sin(ph + 1.2) + 0.004 * math.sin(ph), lean=52 + 2.5 * math.sin(ph))

def ground_anchor(S):
    return (0.0, 0.0, 0.0)
