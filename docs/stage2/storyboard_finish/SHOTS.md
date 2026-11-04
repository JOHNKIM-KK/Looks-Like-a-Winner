# storyboard_finish_v3: home stretch to finish (SPEC §8, 11/4)

Changes from v2:
- **11/4 revision:** the overhead rank badges are removed; tracking now starts 30 m out (SPEC §3-2); the HUD total reads /357m (start chute is now 55 m, home straight unchanged), and the results board header reads 357m. Keyframe renders and in-world distances are unchanged (they were rendered on the 329 m layout with a 27 m chute; the home straight and finish are the same). Old files are in `_prev/`.
- **Track:** the Blender scene is rebuilt with straight S = 80.28 m (`src/sbbase_v3.py`). Total L = 329.0 m, home stretch from the exit of the final turn to the finish = 53.5 m, finish at 2/3 of the home straight. Chute 27 m and corner radius 14 m are unchanged. Every keyframe distance is measured on this track (finish_d = 329.04 m).
- **Slow motion:** real speed until 10 m before the finish, then a smoothstep ease to 0.5x over 3 m, and 0.5x until the leader's nose reaches the line. There the camera eases to a freeze (the photo-finish frame).
- **f05:** a rear 3/4 view (sheet `wide_a4` = +45°, flip = False), so the saddle-cloth number is not mirrored. (The overhead rank-number badges were removed on 11/4.)
- **Cuts:** one cut only, f01 → f02. From f02 on it is one continuous camera: the tracking rig (outer side, y = 22.7 m, z = 1.35 m, 45mm) through the freeze at the line, then a rise and swing to the outer rear 3/4 (no crossing of the 180° line).

Speeds: race 329 m in about 55 s (SPEC §8-1), spurt +12%, so about 6.70 m/s on the home stretch.

## Timing (in-game values; t = 0 at the exit of the final turn)
These are in-game timing values at the SPEC race pace: 329 m in about 55 s (§8-1), so the base speed is 5.98 m/s, and the spurt is +12% from the turn exit (= 6.70 m/s).

| t (s) | key | leader to finish (m) | playback | note |
|---|---|---|---|---|
| 0.00 | f01 | 53.5 | 1.0x | static, outside and ahead (turn exit) |
| 3.51 | CUT → tracking start | 30.0 | 1.0x | tracking rig takes over (SPEC §3-2 step 1) |
| 5.49 | f02 (keyframe) | 16.7 | 1.0x | same rig (frame rendered at 16.7 m) |
| 6.49 | f02b | 10.0 | 1.0x → ease | 0.5x slow-mo starts |
| 7.13 | (ease end) | 7.0 | 0.5x |  |
| 9.21 | f04 | 0.0 | → freeze | camera and action freeze as the leader's nose crosses |
| 10.21 | (resume) | 0.0 | 0.5x → 1.0x over 0.6 s | camera starts rising |
| 11.11 | f04to05 | -3.5 | 1.0x, decelerating | rise and swing |
| 12.01 | f05 | -6.0 | decelerating | rear 3/4, results board |

f01 holds for 3.51 s. Tracking runs from 30 m out to the freeze in 5.71 s (2.99 s at real speed, then 2.72 s through the slow-mo), plus a 1.0 s freeze hold.

## Keyframes
| key | camera loc (m) | target | lens | elevation | horse length on screen (max / median) | sheet of the leader |
|---|---|---|---|---|---|---|
| f01 | (20.14, 23.05, 4.2) | (40.14, 14.25, 0.8) | 34mm | 8.8° | 9.6% / 4.7% | wide_a3 flip=False |
| f02 | (4.35, 22.7, 1.35) | (4.35, 8.6, 1.05) | 45mm | 1.2° | 33.6% / 24.7% | corner_a0 flip=False |
| f02b | (-2.35, 22.7, 1.35) | (-2.35, 8.6, 1.05) | 45mm | 1.2° | 33.6% / 24.7% | corner_a0 flip=False |
| f04 | (-13.38, 22.7, 1.35) | (-13.38, 8.6, 1.05) | 45mm | 1.2° | 33.5% / 24.7% | corner_a0 flip=False |
| f04to05 | (-14.78, 17.65, 3.58) | (-17.63, 8.6, 0.97) | 40mm | 15.3° | 57.7% / 57.7% | straight_a3 flip=False |
| f05 | (-15.18, 12.6, 3.4) | (-20.88, 8.6, 0.9) | 36mm | 19.7° | 32.3% / 32.3% | wide_a4 flip=False |

## Gaps
- **HUD progress:** it is computed as 357 − (leader distance to finish). The 3D scene still has the 27 m chute, so f01 and the gate in the distance reflect the old chute. This doesn't affect the home-straight frames.
- **f02 keyframe:** it is still the frame rendered at 16.7 m out. It now sits mid-tracking, and there is no keyframe at the 30 m tracking start.
- **Timing conflict:** the brief says the 53.5 m stretch is "about 3 s", but SPEC §8-1 gives about 9 s (55 s race). The timing table follows the SPEC speed: 53.5 m takes about 8 s at real speed.
- **Photo finish:** SPEC §3-2 says photo-finish judging is excluded from stage 2 ("사진 판독은 돌발상황이라 2단계에서 제외"). The freeze frame keeps the thin finish line only as a slow-mo stylisation, not as a judging event. 시게루 should confirm.
- **Field spacing:** the keyframes use different gaps (2.7 m during tracking, 1.5 m at the line, 2.6 m after), so an animation must blend them.
- **f04to05:** a trailing horse is large in the bottom-left foreground as the camera rises past it.
- **f01:** the gate in the chute is visible in the distance behind the field (the scene keeps it).
