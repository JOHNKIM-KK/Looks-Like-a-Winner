# Sprite pipeline

Scripted Blender renders that reproduce the look of the shipped horse sheets (`CALIBRATION.md`) and add the event assets.

Requirements: Blender 5.x on `PATH` (`brew install --cask blender`, or set `BLENDER=/Applications/Blender.app/Contents/MacOS/Blender`) and a Python with `Pillow` and `numpy` (`python3 -m venv .venv && .venv/bin/pip install pillow numpy`). Run from the repo root.

| Command | Output |
|---|---|
| `python art/pipeline/make_horse.py gallop --out /tmp/gal` | calibration copy of the shipped gallop (do not overwrite `public/horses`) |
| `python art/pipeline/calib_sheets.py /tmp/gal` | IoU, anchor, mask and luminance diff against `public/horses` |
| `python art/pipeline/make_horse.py fall` | `public/horses/events/fall_*` + `fall.json` (8 frames, no loop) |
| `python art/pipeline/make_horse.py down` | lying loop (`down_*`) |
| `python art/pipeline/make_horse.py walk` | 8-frame walk loop |
| `python art/pipeline/make_horse.py graze` | 8-frame grazing loop |
| `python art/pipeline/make_asset.py bike` | `public/vehicles/ride_*` + `ride.json` (6-frame loop) |
| `python art/pipeline/make_asset.py titan` | `public/titan/run_*`, `grab_*` + JSONs |

Useful flags: `--sets straight|corner`, `--angles 0,2`, `--samples 16` (fast preview), `--out DIR`.
Contact sheets: `python art/pipeline/contact_json.py public/vehicles/ride.json out.png [mask]`.

Files: `lib.py` (camera, light, render, pose blending), `horse.py` (saddle cloth, plate, colors), `human.py` + `bike.py` + `titan.py` (the other assets),
`render_horse.py` / `render_asset.py` (Blender side), `make_*.py` + `sheetlib.py` (crop, anchor, webp, JSON).

Conventions: orthographic camera at 96.9697 px/m, sun fixed in camera space (upper left), transparent background, no baked shadow.
Mask webp is lossless: R coat, G silks / saddle cloth, B number plate. Color webp is quality 85. Frame crops are tight, so place sprites by `anchor`.
`per_frame_anchor` (horse events) is the ground point under the Body bone, for animations whose body moves relative to the rig origin (fall).
The giant is rendered at px_per_m / 4; JSON `scale_up` is 4.
