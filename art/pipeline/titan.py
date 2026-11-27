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
    add_mouth(H)
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

def _base_run(H, t):
    arm = H['arm']
    lib.pose_blend(arm, [('Man_Run', t, 1)], prefix=human.PREFIX)
    stretch(arm)
    # hunched, forward-thrown trunk and a lolling head: the odd part of the gait
    for b, d in (('Abdomen', -16), ('Torso', -22)): human.rotate_bone(arm, b, (1, 0, 0), d)
    human.rotate_bone(arm, 'Neck', (1, 0, 0), 28)
    human.rotate_bone(arm, 'Head', (0, 1, 0), 14)

def pose(S, i, n, clip='run'):
    H = S
    if H['z0'] is None:  # ground the lowest foot over the whole run cycle (the grab clip uses the same offset)
        H['rig'].location = (0, 0, 0)
        H['z0'] = min((_base_run(H, k * 21 / 8), lowest(H))[1] for k in range(8))
    H['rig'].location = (0, 0, -H['z0']); bpy.context.view_layer.update()
    if clip == 'run':
        _base_run(H, i * 21 / n); hide_mouth(H)
    else:
        _grab(H, i, n)

def two_bone(arm, upper, lower, hand, target, pole):
    """Analytic two-bone reach: shoulder = head(upper), elbow = head(lower), wrist = head(hand). The bones are stubs
    (head ~ tail of the previous), so the wrist is the HAND bone head, not the lower arm tail."""
    S = human.wpos(arm, upper); E = human.wpos(arm, lower); W = human.wpos(arm, hand)
    L1 = (E - S).length; L2 = (W - E).length
    T = Vector(target); d = min(max((T - S).length, abs(L1 - L2) + 0.05), (L1 + L2) * 0.999)
    dirST = (T - S).normalized()
    a = (L1 * L1 + d * d - L2 * L2) / (2 * d); h = math.sqrt(max(L1 * L1 - a * a, 0))
    side = (Vector(pole) - dirST * Vector(pole).dot(dirST)).normalized()
    E2 = S + dirST * a + side * h
    W2 = S + dirST * d
    human.aim_bone(arm, upper, E2 - S)
    human.aim_bone(arm, lower, W2 - human.wpos(arm, lower))

def _keys(u, ks):
    """Smoothstep interpolation through [(u, value), ...]."""
    if u <= ks[0][0]: return ks[0][1]
    for (a, va), (b, vb) in zip(ks, ks[1:]):
        if u <= b:
            x = (u - a) / (b - a); x = x * x * (3 - 2 * x)
            if isinstance(va, tuple): return tuple(p + (q - p) * x for p, q in zip(va, vb))
            return va + (vb - va) * x
    return ks[-1][1]

# keys over u = i/(n-1): reach down, close the fist on the ground, lift, bring to the head, bite, chew
BEND = [(0, 0), (.33, 1.0), (.5, 1.0), (.62, .7), (.78, .25), (1.0, .2)]
# hand target in world metres (x right, y forward, z up); rest -> ground -> mid-lift; later keys follow the mouth
HAND = [(0, (0.6, 0.6, 6.5)), (.22, (0.55, 3.4, 2.6)), (.33, (0.45, 4.8, 0.3)), (.5, (0.45, 4.8, 0.3)), (.62, (0.5, 4.2, 4.5))]
TO_MOUTH = [(.62, 0.0), (.78, 1.0), (1.0, 1.0)]   # blend of the hand target from HAND to the point in front of the mouth
BITE = [(0, 0), (.78, 0), (.89, 1.0), (1.0, 0.25)]
MOUTH_OPEN = [(0, 0), (.78, 0), (.84, .45), (.89, 1.0), (.95, .1), (1.0, .55)]
CLOSE = [(0, 0), (.33, 0), (.5, 1.0), (1.0, 1.0)]   # fist closes once the hand is on the horse

def _grab(H, i, n):
    arm = H['arm']
    lib.pose_blend(arm, [('Man_Idle', 0, 1)], prefix=human.PREFIX); stretch(arm)
    u = i / (n - 1)
    bend = _keys(u, BEND); bite = _keys(u, BITE)
    human.rotate_bone(arm, 'Abdomen', (1, 0, 0), -34 * bend)
    human.rotate_bone(arm, 'Torso', (1, 0, 0), -44 * bend)
    # head stays up while the trunk folds, so the face keeps looking ahead
    human.rotate_bone(arm, 'Neck', (1, 0, 0), 22 * bend)
    human.rotate_bone(arm, 'Head', (1, 0, 0), 14 * bend)
    mouth0 = mouth_pos(H)
    front = mouth0 + Vector((0.2, 1.5, -1.9))
    tgt = Vector(_keys(u, HAND)).lerp(front, _keys(u, TO_MOUTH))
    two_bone(arm, 'UpperArm.R', 'LowerArm.R', 'Palm.R', tgt, pole=Vector((0.6, 0.3, -1)))
    two_bone(arm, 'UpperArm.L', 'LowerArm.L', 'Palm.L', Vector((-1.0, 1.0 + 2.0 * bend, 5.5 - 3 * bend)), pole=Vector((-1, -0.3, -0.5)))
    human.rotate_bone(arm, 'Neck', (1, 0, 0), -24 * bite)
    human.rotate_bone(arm, 'Head', (1, 0, 0), -24 * bite)
    H['mouth_open'] = _keys(u, MOUTH_OPEN); H['close'] = _keys(u, CLOSE)
    update_mouth(H)
    bpy.context.view_layer.update()

# ---- mouth: a dark opening on the face, placed from the Head bone each frame ----
MOUTH_UP, MOUTH_FWD = 1.0, 0.55   # metres from the Head bone head: along the bone, and out of the face (bone +Z is the front)
MOUTH_W, MOUTH_H, MOUTH_D = 0.3, 0.7, 0.22   # half width, max half height, half depth

def _head_frame(H):
    arm = H['arm']; pb = arm.pose.bones['Head']
    q = arm.matrix_world.to_quaternion() @ pb.matrix.to_quaternion()
    return arm.matrix_world @ pb.head, q

def mouth_pos(H):
    p, q = _head_frame(H)
    return p + q @ Vector((0, MOUTH_UP, MOUTH_FWD))

def add_mouth(H):
    import bmesh
    m = bpy.data.meshes.new('MouthMesh')
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=8, radius=1.0); bm.to_mesh(m); bm.free()
    mat = bpy.data.materials.new('Mouth'); mat.use_nodes = True
    b = mat.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (0.012, 0.0, 0.0, 1); b.inputs['Roughness'].default_value = 1
    m.materials.append(mat)
    o = bpy.data.objects.new('Mouth', m); bpy.context.scene.collection.objects.link(o)
    o.rotation_mode = 'QUATERNION'
    H['mouth'] = o

def update_mouth(H):
    o = H['mouth']; k = H['mouth_open']
    o.hide_render = k <= 0.001
    p, q = _head_frame(H)
    o.location = p + q @ Vector((0, MOUTH_UP, MOUTH_FWD)); o.rotation_quaternion = q
    o.scale = (MOUTH_W * (0.7 + 0.3 * k), max(MOUTH_H * k, 0.02), MOUTH_D)

def hide_mouth(H):
    H['mouth_open'] = 0.0; update_mouth(H)

def hand_world(H): return human.wpos(H['arm'], 'MiddleHand.R')  # centre of the palm / fist

def foot_ground(H):
    a = human.wpos(H['arm'], 'Foot.L'); b = human.wpos(H['arm'], 'Foot.R')
    return Vector(((a.x + b.x) / 2, (a.y + b.y) / 2, 0.0))

def frame_points(H):
    """World points the sheet maker projects into frame pixels: hand (right palm tip) and ground (midpoint of the feet on the floor)."""
    return dict(hand_px=hand_world(H), ground_px=foot_ground(H))

def ground_anchor(S): return (0, 0, 0)
