"""Quaternius 'Man' (CC0) loaded as a rig in metres, heading +Y. Shared by the motorcycle rider and the giant."""
import bpy, math, os
from mathutils import Vector, Matrix
import lib

PREFIX = 'HumanArmature|'
BASE_HEIGHT = 4.8  # glb units, standing

def build(height_m=1.75, mask=False, silk_rgb=(0.5, 0.5, 0.5), tint=None):
    objs = lib.import_glb(os.path.join(lib.SRC, 'human', 'man.glb'))
    ico = [o for o in objs if o.name.startswith('Icosphere')]
    objs = [o for o in objs if o not in ico]
    for o in ico: bpy.data.objects.remove(o)
    arm = [o for o in objs if o.type == 'ARMATURE'][0]
    body = [o for o in objs if o.type == 'MESH'][0]
    root = [o for o in objs if o.name == 'RootNode'][0]
    rig = bpy.data.objects.new('HRIG', None); bpy.context.scene.collection.objects.link(rig)
    s = height_m / BASE_HEIGHT; rig.scale = (s, s, s); rig.rotation_euler = (0, 0, math.pi)
    root.parent = rig
    for p in body.data.polygons: p.use_smooth = False
    mats = {m.name: m for m in bpy.data.materials}
    if mask:
        for slot in body.material_slots:
            n = slot.material.name
            slot.material = lib.emission_mat('m_' + n, (0, 1, 0) if n == 'Shirt' else (0, 0, 0))
    else:
        c = mats['Shirt'].node_tree.nodes['Principled BSDF']; c.inputs['Base Color'].default_value = (*silk_rgb, 1)
        c.inputs['Roughness'].default_value = 0.8
        for n, m in mats.items():
            m.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value = 0
            if n == 'Skin': 
                b = m.node_tree.nodes['Principled BSDF'].inputs['Base Color']; v = b.default_value; b.default_value = (v[0] * 1.5, v[1] * 1.2, v[2] * 1.0, 1)
    return dict(rig=rig, arm=arm, body=body, scale=s)

def add_helmet(H, mask=False, rgb=(0.5, 0.5, 0.5), height_m=1.72):
    """Skinned helmet: an ico sphere merged into the body mesh, 100% weighted to the Head bone."""
    import bmesh
    arm, body = H['arm'], H['body']; bpy.context.view_layer.update(); bpy.context.scene.frame_set(0)
    k = height_m / 1.75   # the Head bone is only a stub at the neck; the skull sits ~0.1 m above it
    center = arm.matrix_world @ arm.data.bones['Head'].head_local + Vector((0, 0.005 * k, 0.098 * k)); r = 0.118 * k
    inv = body.matrix_world.inverted()
    bm = bmesh.new(); bm.from_mesh(body.data)
    dl = bm.verts.layers.deform.verify(); gi = body.vertex_groups['Head'].index
    if mask:
        m = lib.emission_mat('helm', (0, 1, 0))
    else:
        m = bpy.data.materials.new('Helmet'); m.use_nodes = True
        bs = m.node_tree.nodes['Principled BSDF']; bs.inputs['Base Color'].default_value = (*rgb, 1); bs.inputs['Roughness'].default_value = 0.5
    body.data.materials.append(m); mi = len(body.data.materials) - 1
    res = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
    for v in res['verts']:
        co = Vector((v.co.x * r * 0.95, v.co.y * r * 1.12, max(v.co.z, -0.35) * r))
        v.co = inv @ (center + co); v[dl][gi] = 1.0
    for f in {f for v in res['verts'] for f in v.link_faces}: f.material_index = mi; f.smooth = False
    bm.to_mesh(body.data); bm.free()
    return body

def rotate_bone(arm, name, axis_world, deg, pivot='head'):
    """Rotate a pose bone about a WORLD axis through its head (pose is evaluated, so call after setting the base pose)."""
    pb = arm.pose.bones[name]
    aw = arm.matrix_world.to_3x3()
    ax = (aw.inverted() @ Vector(axis_world)).normalized()
    M = pb.matrix.copy(); p = M.translation.copy()
    R = Matrix.Translation(p) @ Matrix.Rotation(math.radians(deg), 4, ax) @ Matrix.Translation(-p)
    pb.matrix = R @ M
    bpy.context.view_layer.update()


def wpos(arm, bone, tail=False):
    pb = arm.pose.bones[bone]
    return arm.matrix_world @ (pb.tail if tail else pb.head)

def aim_bone(arm, bone, target_dir):
    """Rotate pose bone about its head so its head->tail direction points along target_dir (world)."""
    cur = (wpos(arm, bone, True) - wpos(arm, bone)).normalized()
    q = cur.rotation_difference(Vector(target_dir).normalized())
    ax, ang = q.to_axis_angle()
    if abs(ang) > 1e-6: rotate_bone(arm, bone, ax, math.degrees(ang))

def reach(arm, upper, lower, hand_tail_bone, target, pole=Vector((0, 0, -1))):
    """Two-bone analytic reach: bend the elbow/knee towards `pole`, hand (tail of lower bone) at `target`."""
    S = wpos(arm, upper); E = wpos(arm, lower); W = wpos(arm, lower, True)
    L1 = (E - S).length; L2 = (W - E).length
    T = Vector(target); d = min((T - S).length, (L1 + L2) * 0.999)
    dirST = (T - S).normalized()
    a = (L1 * L1 + d * d - L2 * L2) / (2 * d)
    h = math.sqrt(max(L1 * L1 - a * a, 0))
    side = (Vector(pole) - dirST * Vector(pole).dot(dirST)).normalized()
    E2 = S + dirST * a + side * h
    aim_bone(arm, upper, E2 - S)
    aim_bone(arm, lower, T - E2)
