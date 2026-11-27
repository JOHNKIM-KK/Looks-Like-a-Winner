"""python check_edges.py public/titan/run.json public/titan/grab.json -> reports frames whose alpha touches a frame edge."""
import sys, json, os
import numpy as np
from PIL import Image
bad = 0
for jp in sys.argv[1:]:
    j = json.load(open(jp)); d = os.path.dirname(jp)
    for sn, s in j['sets'].items():
        for a in s['angles']:
            im = np.asarray(Image.open(os.path.join(d, a['color'])).convert('RGBA')); fw = a['frame_w']
            for i in range(j['frames']):
                al = im[:, i * fw:(i + 1) * fw, 3] > 0
                e = [n for n, v in (('L', al[:, 0]), ('R', al[:, -1]), ('T', al[0]), ('B', al[-1])) if v.any()]
                if e: bad += 1; print('EDGE', os.path.basename(jp), sn, a['index'], 'frame', i, ''.join(e))
print('edge-touching frames:', bad)
sys.exit(1 if bad else 0)
