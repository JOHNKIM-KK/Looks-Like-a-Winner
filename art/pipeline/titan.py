"""Original giant: a Quaternius Man (CC0) stretched into a gaunt ~15 m figure with overlong limbs and a loping, hunched sprint.
Design notes: pale bald skin, black eyes, torn dark loincloth, arms that reach below the knee, very long neck."""
import bpy, math
from mathutils import Vector
import lib, human

HEIGHT_M = 15.0
# (bone, length stretch along the bone, girth) - Man bones are y-along-bone
STRETCH = {'UpperArm': (1.75, 0.8), 'LowerArm': (1.85, 0.75), 'Palm': (1.5, 1.0), 'UpperLeg': (1.45, 0.8), 'LowerLeg': (1.5, 0.75),
           'Neck': (2.2, 0.8), 'Abdomen': (1.3, 0.8), 'Torso': (1.1, 0.75)}
SKIN = (0.62, 0.58, 0.54)

def build(mask=False):
    H = human.build(HEIGHT_M, mask=mask)
    arm, body = H['arm'], H['body']
    for pb in arm.pose.bones:
        key = pb.name.split('.')[0]
        if key in STRETCH: pb.bone.inherit_scale = 'NONE'
    if not mask:
        for m in bpy.data.materials:
            if m.name in ('Skin', 'Shirt', 'Hair', 'Socks'):
                b = m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (*SKIN, 1); b.inputs['Roughness'].default_value = 0.9
            if m.name == 'Pants':
                m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.05, 0.035, 0.03, 1)
            if m.name == 'Eyes':
                m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0, 0, 0, 1)
    H['z0'] = None
    # the stretch makes the figure taller than HEIGHT_M: rescale so the standing figure is exactly HEIGHT_M
    lib.pose_blend(arm, [('Man_Standing', 0, 1)], prefix=human.PREFIX); stretch(arm)
    dg = bpy.context.evaluated_depsgraph_get(); eo = body.evaluated_get(dg); me = eo.to_mesh()
    zs = [(eo.matrix_world @ v.co).z for v in me.vertices]; eo.to_mesh_clear()
    k = HEIGHT_M / (max(zs) - min(zs)); H['rig'].scale = tuple(x * k for x in H['rig'].scale)
    bpy.context.view_layer.update()
    return H

def stretch(arm):
    for pb in arm.pose.bones:
        key = pb.name.split('.')[0]
        if key in STRETCH:
            L, G = STRETCH[key]; pb.scale = (G, L, G)
    bpy.context.view_layer.update()

def lowest(H):
    arm = H['arm']
    return min(human.wpos(arm, b, True).z for b in ('Foot.L', 'Foot.R'))

def _ground(H, z):
    H['rig'].location.z += -(z)
    bpy.context.view_layer.update()

def _base_run(H, t):
    arm = H['arm']
    lib.pose_blend(arm, [('Man_Run', t, 1)], prefix=human.PREFIX)
    stretch(arm)
    # hunched, forward-thrown trunk and a lolling head: the odd part of the gait
    for b, d in (('Abdomen', -16), ('Torso', -22)): human.rotate_bone(arm, b, (1, 0, 0), d)
    human.rotate_bone(arm, 'Neck', (1, 0, 0), 28)
    human.rotate_bone(arm, 'Head', (0, 1, 0), 14)

def pose(S, i, n, clip='run'):
    H = S; arm = H['arm']
    H['rig'].location = (0, 0, 0)
    if H['z0'] is None:  # ground the lowest foot over the whole cycle
        zs = []
        for k in range(8):
            _base_run(H, k * 21 / 8); zs.append(lowest(H))
        H['z0'] = min(zs); H['rig'].location = (0, 0, 0)
    if clip == 'run':
        _base_run(H, i * 21 / n)
    else:
        _grab(H, i, n)
    _ground(H, H['z0'])

def _grab(H, i, n):
    arm = H['arm']
    lib.pose_blend(arm, [('Man_Idle', 0, 1)], prefix=human.PREFIX); stretch(arm)
    u = i / (n - 1)
    # phases: 0-.35 reach down, .35-.7 lift to mouth, .7-1 bite (head dives at the fist)
    def sm(a, b, x): x = min(max((x - a) / (b - a), 0), 1); return x * x * (3 - 2 * x)
    down = sm(0.0, 0.35, u) * (1 - sm(0.4, 0.7, u)); lift = sm(0.35, 0.7, u); bite = sm(0.7, 0.9, u) * (1 - sm(0.92, 1.0, u))
    crouch = down * 1.0
    for b, d in (('Abdomen', -30 * (down + 0.5 * lift)), ('Torso', -40 * (down + 0.4 * lift))): human.rotate_bone(arm, b, (1, 0, 0), d)
    hipsdrop = -3.0 * crouch
    H['rig'].location.z += hipsdrop; bpy.context.view_layer.update()
    ground = Vector((0.45, 5.5, 0.3)); mouth = Vector((0.2, 2.2, 11.2))
    target = ground.lerp(mouth, lift) if u > 0.35 else ground
    rest_hand = Vector((0.6, 0.6, 6.5))
    tgt = rest_hand.lerp(ground, sm(0.0, 0.35, u)) if u <= 0.35 else target
    human.reach(arm, 'UpperArm.R', 'LowerArm.R', 'Palm.R', tgt, pole=Vector((1, -0.3, -0.5)))
    human.reach(arm, 'UpperArm.L', 'LowerArm.L', 'Palm.L', Vector((-1.0, 1.0 + 2.0 * crouch, 5.5 - 3 * crouch)), pole=Vector((-1, -0.3, -0.5)))
    human.rotate_bone(arm, 'Neck', (1, 0, 0), 25 * bite + 10 * lift)
    human.rotate_bone(arm, 'Head', (1, 0, 0), 30 * bite)
    bpy.context.view_layer.update()

def ground_anchor(S): return (0, 0, 0)
