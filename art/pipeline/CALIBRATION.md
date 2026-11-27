# Calibration against the shipped gallop sheets

Gate: re-render `public/horses/straight_color_a*` and `corner_color_a*` from the Quaternius horse and diff.
Run: `python art/pipeline/make_horse.py gallop --out /tmp/gal && python art/pipeline/calib_sheets.py /tmp/gal`

Found parameters (in `lib.LOOK` and `horse.py`):
- horse scale 0.44 (glb units to metres), orthographic camera at 96.9697 px/m, elevation 24 (straight) / 9 (corner).
- Horse faces +Y, yaw rule from horses.json (`toCam = right*cos(yaw) - heading*sin(yaw)`).
- Frame sampling `t = k*14/12` of the Gallop action, start offset 0 (checked by best-match search over half frames).
- Anchor = the rig origin on the ground. Measured offset of the shipped anchor from it: (0.0, -0.3) px.
- Sun fixed in camera space (upper left, from the viewer), strength 1.457, white ambient 0.32, exposure +0.2 EV,
  Standard view transform, flat shading, Cycles. Coat/hair colours get a saturation gain (horse.py `COLOR_GAIN`).
- The saddle cloth is not in the glb. It is cut from the horse mesh (follows the skin), lifted 0.06, quilted in the shader.

Results (12 frames per camera, silhouette IoU after anchor alignment):
see `calib_numbers.txt` copy in the review folder; mean IoU 0.961, min 0.939, mean |luminance diff| 6.3 percent
(corner a0 is +9.4 percent, straight a4 -3.8 percent, the two target cameras straight a0 +1.6 and corner a1 +3.5).
Sheet frames are tight bounding boxes: the shipped sheets keep 15-34 px of extra headroom above the horse
(room for the jockey layer), the new sheets do not. Use `anchor`, not the frame size, to place them.
