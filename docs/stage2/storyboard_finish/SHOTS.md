# storyboard_finish_v2: home stretch to finish with one cut

Scene: storyboard_v2 Blender scene (`src/sbf2.py`), overlay from `src/compf2.py`. Every horse uses the v2 heading rule. Lane 3 (금빛별) wins.

## Camera path
1. **f01 (stretch entry):** fixed camera outside and ahead, 34mm.
2. **The only cut: f01 → f02.**
3. **f02 → f02b → f04: one tracking rig.** It runs along the outer rail at a fixed y=22.7 m and height 1.35 m with a 45mm lens, looks straight across the track (target y=8.6, z=1.05), and moves in the running direction (−x) at the leaders' pace. Approaching the line it eases out and stops at x = finish (GOALX); f04 is the freeze as the leader's nose touches the line.
4. **f04 → f04to05 → f05: no cut.** The camera moves relative to the winner. Position and target follow a smoothstep from the f04 pose (beside, 1.35 m) to the f05 pose (3.2 m behind, 0.6 m inside, 3.3 m up) with an extra rise of 1.2·sin(πt) m so it arcs over rather than passing through the field. The lens goes 45 → 40 → 36mm over the same move.

Times are suggested seconds from the start of the sequence.

| key | t (s) | leader to finish | camera loc (m) | target | lens | elevation | horse length on screen (max / median) | heading OK |
|---|---|---|---|---|---|---|---|---|
| f01_stretch_entry | 0.0 | 23.8 m | (0.07, 23.05, 4.2) | (20.07, 14.25, 0.8) | 34mm | 8.8° | 9.6% / 4.7% | True |
| f02_sprint | ~1.2 (CUT) | 13.4 m | (7.72, 22.7, 1.35) | (7.72, 8.6, 1.05) | 45mm | 1.2° | 33.6% / 24.7% | True |
| f02b_sprint_mid | ~1.9 | 5.9 m | (0.23, 22.7, 1.35) | (0.23, 8.6, 1.05) | 45mm | 1.2° | 33.6% / 24.7% | True |
| f04_photo_finish | ~2.6 (slows to a freeze, hold ~1.0) | 1.1 m | (-6.69, 22.7, 1.35) | (-6.69, 8.6, 1.05) | 45mm | 1.2° | 33.5% / 24.7% | True |
| f04to05_rise_swing | ~4.1 | -3.5 m | (-8.59, 15.35, 3.53) | (-10.94, 8.6, 0.97) | 40mm | 19.6° | 39.6% / 39.6% | False |
| f05_result | ~5.0 | -6.0 m | (-9.49, 8.0, 3.3) | (-14.19, 8.6, 0.9) | 36mm | 26.9° | 21.4% / 21.4% | False |

## Gaps
- The track is 222 m and the home straight is only about 24 m, so the tracking run from f02 to the finish is about 13 m (about 1.4 s at race speed). The times above are slowed down for readability.
- The keyframes use different field spreads: 2.7 m at f02 and f02b, 1.5 m at the photo finish, 2.6 m after the finish. In a real animation the gaps would close and open smoothly between keys.
- f04: a horse in an outer lane (near the camera) is large in the left foreground. f04 uses the same rig as f02, so this is expected.
- f04to05: the camera passes over a trailing horse (lane 7, partly visible bottom-left).
- f05: the back-view sprite is mirrored by the flip, so the saddle-cloth number "3" reads backwards. The sprite sheets need a non-mirrored rear view or a number overlay.
- f05: the winner is 21% of screen width, up from 10.9% in v1. The results board covers the right third of the frame.
- "heading OK = False" on f04to05 and f05 comes only from horses behind the camera (negative depth, off screen): lanes 12 and 11 in f04to05, lane 1 in f05. Every visible horse passes the heading rule.
