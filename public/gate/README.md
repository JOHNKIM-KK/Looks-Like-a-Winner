# Gate asset v2 (Blender render of storyboard_v2 build_gate)
Source: Rendered in Blender by 리무르 (sources not in repo). No horses.
Every PNG is a crop of a shared 1600x900 camera frame. Draw each at its (x,y) top-left from stalls.json → `layers` / `stalls[i].doors[state]`.
**Z-order:** back.png, then horses (foot at `stalls[i].horseFoot`), then doors, then front.png, then sign.png.
Door states: closed=0°, opening1=62°, opening2=106°, open=112° (leaf angle; frames from the storyboard 6-frame swing).
Lane 1 is at screen right.

## public/gate/drone/
storyboard shot-03 perspective camera (32mm, 17.35 m, el 5.3°). Doors are rendered one stall at a time (48 files).

| file | x,y | w×h | bytes |
|---|---|---|---|
| back.png | 320,376 | 1093×283 | 32223 |
| front.png | 299,245 | 1135×420 | 44777 |
| sign.png | 724,282 | 124×22 | 1492 |
| doors/ (48 files) | per stalls.json | | 140839 |

Total PNG: 214 KB. Preview: `docs/stage2/gate/preview_drone.webp` (top: closed, bottom: open).

## public/gate/front/
orthographic straight-front camera (ortho scale 19.5 m) for the countdown. One reusable door per state (doors/door_*.png); place it at each stall's x/y from stalls.json.

| file | x,y | w×h | bytes |
|---|---|---|---|
| back.png | 162,392 | 1276×244 | 38743 |
| front.png | 162,254 | 1276×382 | 43446 |
| sign.png | 729,279 | 143×22 | 1557 |
| doors/ (4 files) | per stalls.json | | 9746 |

Total PNG: 91 KB. Preview: `docs/stage2/gate/preview_front.webp` (top: closed, bottom: open).

Note: in the front view, the 106° and 112° leaves are clipped at the stall edge by a few px.

## public/gate/top/
Looking-down view for storyboard scene 04: perspective camera, 32mm, 40° elevation, 22 m from the gate centre, same azimuth as drone/. Storyboard shot 04's own camera looks along the gate end-on, so all 12 stalls aren't visible from it and I didn't use it. Doors are per stall (48 files).

| file | x,y | w×h | bytes |
|---|---|---|---|
| back.png | 397,233 | 851×415 | 39529 |
| front.png | 356,217 | 922×440 | 34428 |
| sign.png | 716,311 | 105×36 | 1354 |
| doors/ (48 files) | per stalls.json | | 98311 |

Total PNG: 170 KB. Preview: `docs/stage2/gate/preview_top.webp` (top: closed, bottom: open).

## public/gate/start/
Start scene (storyboard 05). Camera: shot-05 position (perspective), aimed at the gate centre, lens 36mm (shot 05 used 28mm). Elevation is about 13-15°. Lane 1 is front-right, lane 12 recedes to the back-left, and the right-end wheels and the gray rear chute are visible. Doors are per stall (48 files).
`stalls[i].exitDir` is the unit screen vector of the horse's exit direction (world -x) at the stall front; `exitPxPerM` is screen px per metre along that direction. Horses leave toward the front-left-bottom.
Plate fix (start/ only, PLATEFIX=1): plates 10 and 12 now use dark numbers with a light outline. drone/, front/ and top/ still have the old light numbers on 10 and 12 and need a re-render to apply the fix.

| file | x,y | w×h | bytes |
|---|---|---|---|
| back.png | 439,291 | 926×389 | 26392 |
| front.png | 422,201 | 802×489 | 39867 |
| sign.png | 677,228 | 83×24 | 1328 |
| doors/ (48 files) | per stalls.json | | 120357 |

Total PNG: 184 KB. Preview: `docs/stage2/gate/preview_start.webp` (top: closed, bottom: open).
