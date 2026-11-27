"""Build the Quaternius horse scene: rig scaled to metres, heading +Y, saddle cloth + number plate geometry."""
import bpy, bmesh, math, os
from mathutils import Vector
import lib

# cloth / plate placement in glb-bind-pose units (horse is ~5.7 long there; lib.LOOK['horse_scale'] converts to metres)
CLOTH = dict(y0=-0.72, y1=0.70, z_cut=1.65, z_top=9, lift=0.06)
PLATE = dict(y=-0.01, hy=0.18, z=2.55, hz=0.37)
GROUND_Y = 0.0   # horse centre along its axis (glb units, before flip); fitted in calibration

# Material look found by calibration: the Quaternius palette is desaturated next to the shipped art.
COLOR_GAIN = {'Main': (1.45, 0.80, 0.15), 'Main_Light': (1.45, 0.80, 0.15), 'Main_Dark': (1.45, 0.80, 0.15), 'Hair': (2.6, 1.7, 1.0)}
FLAT = True

def _recolor():
    for m in bpy.data.materials:
        g = COLOR_GAIN.get(m.name)
        if g and m.node_tree:
            bsdf = m.node_tree.nodes['Principled BSDF']; c = bsdf.inputs['Base Color'].default_value
            bsdf.inputs['Base Color'].default_value = (c[0]*g[0], c[1]*g[1], c[2]*g[2], 1)
            bsdf.inputs['Roughness'].default_value = 0.75
            bsdf.inputs['Metallic'].default_value = 0.0

def _cloth_material():
    m = bpy.data.materials.new('Cloth'); m.use_nodes = True
    nt = m.node_tree; nodes, links = nt.nodes, nt.links
    bsdf = nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 0.85
    uv = nodes.new('ShaderNodeTexCoord')
    sep = nodes.new('ShaderNodeSeparateXYZ'); links.new(uv.outputs['UV'], sep.inputs[0])
    def wave(axis):
        mul = nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; links.new(sep.outputs[axis], mul.inputs[0]); mul.inputs[1].default_value = 2*math.pi/0.42
        s = nodes.new('ShaderNodeMath'); s.operation = 'SINE'; links.new(mul.outputs[0], s.inputs[0])
        ab = nodes.new('ShaderNodeMath'); ab.operation = 'ABSOLUTE'; links.new(s.outputs[0], ab.inputs[0]); return ab
    a, b = wave(0), wave(1)
    prod = nodes.new('ShaderNodeMath'); prod.operation = 'MINIMUM'
    links.new(a.outputs[0], prod.inputs[0]); links.new(b.outputs[0], prod.inputs[1])
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.0; ramp.color_ramp.elements[0].color = (0.70, 0.60, 0.50, 1)
    ramp.color_ramp.elements[1].position = 0.6; ramp.color_ramp.elements[1].color = (0.88, 0.76, 0.64, 1)
    links.new(prod.outputs[0], ramp.inputs[0])
    links.new(ramp.outputs[0], bsdf.inputs['Base Color'])
    bump = nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 1.4
    links.new(prod.outputs[0], bump.inputs['Height']); links.new(bump.outputs[0], bsdf.inputs['Normal'])
    return m

def _plate_material():
    m = bpy.data.materials.new('Plate'); m.use_nodes = True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.9, 0.9, 0.9, 1)
    return m

def build(mask=False, with_cloth=True):
    objs = lib.import_glb(os.path.join(lib.SRC, 'horse', 'horse.glb'))
    arm = [o for o in objs if o.type == 'ARMATURE'][0]
    body = [o for o in objs if o.type == 'MESH' and o.name == 'Horse'][0]
    drop = [o for o in objs if o.type == 'MESH' and o is not body]
    objs = [o for o in objs if o not in drop]
    for o in drop: bpy.data.objects.remove(o)
    cloth = None
    if with_cloth:
        cloth = _make_cloth(body)
    # rig: flip heading to +Y, scale to metres
    rig = bpy.data.objects.new('RIG', None); bpy.context.scene.collection.objects.link(rig)
    s = lib.LOOK['horse_scale']; rig.scale = (s, s, s); rig.rotation_euler = (0, 0, math.pi)
    root = [o for o in objs if o.name == 'RootNode']
    top = root[0] if root else arm
    top.parent = rig
    if cloth is not None: cloth.parent = arm   # follows armature deformation via modifier
    if FLAT:
        for p in body.data.polygons: p.use_smooth = False
    if mask: _mask_materials(body, cloth)
    else: _recolor()
    return dict(rig=rig, arm=arm, body=body, cloth=cloth)

def _make_cloth(body):
    cl = body.copy(); cl.data = body.data.copy(); cl.name = 'Cloth'
    bpy.context.scene.collection.objects.link(cl)
    mw = body.matrix_world; inv3 = mw.to_3x3().inverted()
    cl.data.materials.clear(); cl.data.materials.append(None); cl.data.materials.append(None)
    bm = bmesh.new(); bm.from_mesh(cl.data)
    bm.faces.ensure_lookup_table()
    # sharp cut by three planes (world space) instead of whole faces
    def cut(co, no, keep_positive):
        lc = mw.inverted() @ Vector(co); ln = (inv3 @ Vector(no)).normalized()
        geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
        if keep_positive is None:
            bmesh.ops.bisect_plane(bm, geom=geom, plane_co=lc, plane_no=ln)
        else:
            bmesh.ops.bisect_plane(bm, geom=geom, plane_co=lc, plane_no=ln, clear_inner=keep_positive, clear_outer=not keep_positive)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    cut((0, CLOTH['y0'], 0), (0, 1, 0), True)
    cut((0, CLOTH['y1'], 0), (0, 1, 0), False)
    cut((0, 0, CLOTH['z_cut']), (0, 0, 1), True)
    for sgn in (-1, 1):
        cut((0, PLATE['y'] + sgn * PLATE['hy'], 0), (0, 1, 0), None)
        cut((0, 0, PLATE['z'] + sgn * PLATE['hz']), (0, 0, 1), None)
    for v in [v for v in bm.verts if not v.link_faces]: bm.verts.remove(v)
    bm.verts.ensure_lookup_table(); bm.normal_update()
    for v in bm.verts:
        n = (mw.to_3x3() @ v.normal).normalized()
        v.co += inv3 @ (n * CLOTH['lift'])
    uvl = bm.loops.layers.uv.new('UVMap')
    for f in bm.faces:
        for l in f.loops:
            w = mw @ l.vert.co
            l[uvl].uv = (w.y, math.atan2(w.x, w.z - 2.3) * 1.6)
    # plate faces get material slot 1
    for f in bm.faces:
        c = mw @ f.calc_center_median()
        if abs(c.y - PLATE['y']) <= PLATE['hy'] and abs(c.z - PLATE['z']) <= PLATE['hz'] and abs(c.x) > 0.15:
            f.material_index = 1
        else:
            f.material_index = 0
    bm.to_mesh(cl.data); bm.free()
    cl.data.materials[0] = _cloth_material(); cl.data.materials[1] = cl.data.materials[0]  # plate shows as cloth; the engine paints the panel
    for p in cl.data.polygons: p.use_smooth = True
    return cl

def _mask_materials(body, cloth):
    red = lib.emission_mat('mR', (1, 0, 0))
    body.data.materials.clear(); body.data.materials.append(red)
    for p in body.data.polygons: p.material_index = 0
    if cloth is not None:
        cloth.data.materials[0] = lib.emission_mat('mG', (0, 1, 0))
        cloth.data.materials[1] = lib.emission_mat('mB', (0, 0, 1))
