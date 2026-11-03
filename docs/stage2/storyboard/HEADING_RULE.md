# HEADING_RULE: 말 몸 방향 규칙 (코마용)

목표: 모든 말이 **트랙 접선(실제 진행 방향)** 을 향해 보이게 한다. 시트는 "카메라가 말을 어느 각도에서 보는가"로 고르고, 좌우는 flipX로만 바꾼다.
검증: storyboard_v2 10장면 120마리에서 이 규칙이 고른 시트와 flip이 렌더 결과와 120/120 일치. flip 방향도 화면에 투영한 접선 방향과 120/120 일치.

## 1. 좌표와 입력 (엔진 logical 좌표 그대로)
- `h = (tx, ty)`: 말 위치의 트랙 접선. `track.ts`의 `presentationLogical(...)`이 주는 `tx, ty`이고, 진행 방향으로 정규화한다.
- `c = (camera.groundX - x, camera.groundY - y)`: 말에서 카메라로 가는 벡터(지면 투영)
- `camEl`: 말에서 본 카메라 고도각 = atan2(camera 높이, |c|). 지금 코드는 `camera.pitch`를 쓰는데, 그대로 써도 된다.

## 2. 상대 yaw 공식
```
dotH = c·h            = cx*tx + cy*ty          // >0: 카메라가 말 앞쪽
dotR = c·(ty, -tx)    = cx*ty - cy*tx          // relativeYawDeg의 rx=hy, ry=-hx 그대로
sheetYaw = atan2(-dotH, |dotR|)  (deg, -90..+90)   // <0: 앞 3/4가 보임, >0: 뒤 3/4가 보임
flip     = dotR > 0
```
- 시트 yaw 부호는 기존 시트와 같다. `straight_a0` = -30°(앞모습 쪽), `straight_a4` = +30°(엉덩이 쪽).
- **flipX 규칙:** 시트 원본은 화면 오른쪽(+screen x)을 본다. `dotR > 0`이면 카메라가 말의 반대편 옆구리를 보고 있으므로 좌우를 뒤집는다(`setFlipX(true)`). 화면에서는 "투영한 접선이 화면 왼쪽을 향하면 flip"과 같다. `track.ts:276/329`의 `pose.flipX = cos(heading) < 0`과 일치해야 한다. 개발 빌드에서 둘이 다르면 경고를 띄울 것.

## 3. 지금 코드의 버그 2개 (horseVisual.ts:59-97)
1. `relativeYawDeg` 반환값 `atan2(-dotH, dotR)`을 `pickHorseAngle`이 `|yaw|>90`이면 flip하는데, 이건 `dotR < 0`일 때 flip하는 것이라 **좌우가 정반대**다. 그래서 말이 거꾸로 달렸다.
2. 접기 `yaw ∓ 180`은 앞뒤도 뒤집는다(예: -150° → +30°, 앞모습이어야 할 말이 엉덩이를 보임). 그래서 "옆으로 달리는" 느낌이 났다. 올바른 접기는 `|dotR|`를 쓰는 것, 즉 `sheetYaw = atan2(-dotH, |dotR|)`.

## 4. 버킷 경계 (센터 사이 중간값) + 히스테리시스
기본 세트(고도 24°):

| 버킷 | 센터 | 범위 |
|---|---|---|
| wide_a0 | -90 | [-90, -82.5) |
| wide_a1 | -75 | [-82.5, -67.5) |
| wide_a2 | -60 | [-67.5, -52.5) |
| wide_a3 | -45 | [-52.5, -37.5) |
| straight_a0 | -30 | [-37.5, -22.5) |
| straight_a1 | -15 | [-22.5, -7.5) |
| straight_a2 | 0 | [-7.5, 7.5) |
| straight_a3 | +15 | [7.5, 22.5) |
| straight_a4 | +30 | [22.5, 37.5) |
| wide_a4 | +45 | [37.5, 52.5) |
| wide_a5 | +60 | [52.5, 67.5) |
| wide_a6 | +75 | [67.5, 90] (정후면 +90은 만들지 않음, 75로 클램프) |

- **낮은 카메라(corner 세트, 고도 9°):** `camEl < 16.5°`(= 지금 `ELEVATION_SPLIT_DEG`)이고 `|sheetYaw - {0,20,40}| ≤ 10°`이면 `corner_a0/a1/a2`. 아니면 위 표를 쓴다. corner 세트는 앞모습(음수) 쪽이 없다.
- **히스테리시스(말마다 상태 보관):**
  - yaw: 현재 버킷 센터에서 `|sheetYaw - center| > 7.5° + 3°`일 때만 다음 버킷으로 바꾼다.
  - 세트: corner↔기본 전환은 고도 16.5° ± 1.5°(들어갈 때 15°, 나올 때 18°).
  - flip: `|dotR| < 0.05·|c|`(카메라가 거의 정면이나 정후면)일 때는 이전 flip을 유지한다. 정면에서 좌우가 깜빡이는 걸 막는다.

## 5. 시트 목록 (12프레임 한 줄, 갤럽 루프 24fps)
| 키 | 시트 yaw | 렌더 고도 | 파일 | 프레임 | 비고 |
|---|---|---|---|---|---|
| `straight_a0` | -30° | 24° | `final/public/horses/straight_color_a0.webp` + `straight_mask_a0.webp`, `final/public/jockey/ride_straight_color_a0.webp` + mask | 12 | 기존 |
| `straight_a1` | -15° | 24° | `final/public/horses/straight_color_a1.webp` + `straight_mask_a1.webp`, `final/public/jockey/ride_straight_color_a1.webp` + mask | 12 | 기존 |
| `straight_a2` | +0° | 24° | `final/public/horses/straight_color_a2.webp` + `straight_mask_a2.webp`, `final/public/jockey/ride_straight_color_a2.webp` + mask | 12 | 기존 |
| `straight_a3` | +15° | 24° | `final/public/horses/straight_color_a3.webp` + `straight_mask_a3.webp`, `final/public/jockey/ride_straight_color_a3.webp` + mask | 12 | 기존 |
| `straight_a4` | +30° | 24° | `final/public/horses/straight_color_a4.webp` + `straight_mask_a4.webp`, `final/public/jockey/ride_straight_color_a4.webp` + mask | 12 | 기존 |
| `corner_a0` | +0° | 9° | `final/public/horses/corner_color_a0.webp` + `corner_mask_a0.webp`, `final/public/jockey/ride_corner_color_a0.webp` + mask | 12 | 기존 |
| `corner_a1` | +20° | 9° | `final/public/horses/corner_color_a1.webp` + `corner_mask_a1.webp`, `final/public/jockey/ride_corner_color_a1.webp` + mask | 12 | 기존 |
| `corner_a2` | +40° | 9° | `final/public/horses/corner_color_a2.webp` + `corner_mask_a2.webp`, `final/public/jockey/ride_corner_color_a2.webp` + mask | 12 | 기존 |
| `wide_a0` | -90° | 24° | `storyboard_v2/sheets/horses/wide_color_a0.webp` + `wide_mask_a0.webp`, `storyboard_v2/sheets/jockey/ride_wide_color_a0.webp` + mask | 12 | 신규 58KB + 기수 17KB |
| `wide_a1` | -75° | 24° | `storyboard_v2/sheets/horses/wide_color_a1.webp` + `wide_mask_a1.webp`, `storyboard_v2/sheets/jockey/ride_wide_color_a1.webp` + mask | 12 | 신규 73KB + 기수 19KB |
| `wide_a2` | -60° | 24° | `storyboard_v2/sheets/horses/wide_color_a2.webp` + `wide_mask_a2.webp`, `storyboard_v2/sheets/jockey/ride_wide_color_a2.webp` + mask | 12 | 신규 92KB + 기수 23KB |
| `wide_a3` | -45° | 24° | `storyboard_v2/sheets/horses/wide_color_a3.webp` + `wide_mask_a3.webp`, `storyboard_v2/sheets/jockey/ride_wide_color_a3.webp` + mask | 12 | 신규 104KB + 기수 25KB |
| `wide_a4` | +45° | 24° | `storyboard_v2/sheets/horses/wide_color_a4.webp` + `wide_mask_a4.webp`, `storyboard_v2/sheets/jockey/ride_wide_color_a4.webp` + mask | 12 | 신규 99KB + 기수 22KB |
| `wide_a5` | +60° | 24° | `storyboard_v2/sheets/horses/wide_color_a5.webp` + `wide_mask_a5.webp`, `storyboard_v2/sheets/jockey/ride_wide_color_a5.webp` + mask | 12 | 신규 93KB + 기수 20KB |
| `wide_a6` | +75° | 24° | `storyboard_v2/sheets/horses/wide_color_a6.webp` + `wide_mask_a6.webp`, `storyboard_v2/sheets/jockey/ride_wide_color_a6.webp` + mask | 12 | 신규 79KB + 기수 19KB |

- 메타데이터: `storyboard_v2/sheets/horses/wide.json`(frame_w/h, anchor, plate_per_frame), `storyboard_v2/sheets/jockey/ride_wide.json`(offset_in_horse_frame). 형식은 horses.json / jockey.json과 같다.
- 마스크: 말 R=털(틴트 안 함), G=안장천(레인 색), B=번호판. 기수 ride 마스크 G=실크+모자(`out = lane*(lum/185)^1.1`).
- 렌더: 기존 시트와 같은 리그·카메라(`final/preview/stage4/render_ridemask_v3.py` 복사본 `storyboard_v2/src/render_yaw.py`, `SETS`만 바꿈). 320×240, ortho 3.3, 96.97px/m, 16샘플.
- **용량:** 신규 말 599KB, 신규 기수 146KB. 말 합계 = 기존 1,221,322B + 613,136B = **1,834,458B**(2.6MB 예산의 71%). 아직 final/public에는 넣지 않았다.

## 6. 의사코드 (지금 코드에 바로 대응)
```ts
// horseVisual.ts : relativeYawDeg 대체
export function headingView(tx: number, ty: number, toCamX: number, toCamY: number) {
  const l = Math.hypot(tx, ty) || 1, hx = tx / l, hy = ty / l;
  const dotH = toCamX * hx + toCamY * hy;
  const dotR = toCamX * hy - toCamY * hx;            // 기존 rx=hy, ry=-hx 그대로
  const sheetYaw = Math.atan2(-dotH, Math.abs(dotR)) * 180 / Math.PI; // -90..90
  return { sheetYaw, flip: dotR > 0, side: Math.abs(dotR) / (Math.hypot(toCamX, toCamY) || 1) };  // FIX: 예전 flip = dotR < 0
}

// pickHorseAngle(yawDeg, elevationDeg) → pickHorseAngle(view, elevationDeg, prev)
export function pickHorseAngle(view, elevationDeg, prev?: PickedAngle): PickedAngle {
  const useCorner = prev?.set === "corner" ? elevationDeg < 18 : elevationDeg < 15;
  const flip = view.side < 0.05 && prev ? prev.flip : view.flip;
  if (useCorner) {
    const c = nearest(HORSE_ANGLES.corner, view.sheetYaw, prev, 10 /*range*/);
    if (c) return { set: "corner", index: c.index, yawDeg: c.yawDeg, flip };
  }
  const all = [...HORSE_ANGLES.wide.slice(0, 4), ...HORSE_ANGLES.straight, ...HORSE_ANGLES.wide.slice(4)];
  const b = nearestWithHysteresis(all, view.sheetYaw, prev, 7.5 + 3);
  return { set: b.set, index: b.index, yawDeg: b.yawDeg, flip };
}

// createRaceGame.ts:767-779
const view = headingView(heading.tx, heading.ty, currentCamera.groundX - heading.x, currentCamera.groundY - heading.y);
const picked = pickHorseAngle(view, camElevDeg, actor.lastPicked); actor.lastPicked = picked;
if (import.meta.env.DEV && picked.flip !== pose.flipX) console.warn("heading flip mismatch", actor.horse.number);
// 이후 paintGallop(..., picked.flip)은 그대로 둔다(기수, 마크, 그림자, 번호판 모두 picked.flip 사용 :780-867)
```
- `AngleSetName`에 `"wide"` 추가. `HORSE_ANGLES.wide`는 wide.json에서, ride는 ride_wide.json에서 읽는다.
- 브레이크 기울기(`createRaceGame.ts:758`)는 이미 `pose.flipX`를 쓰므로 그대로 둔다.

## 7. 테스트 케이스 (엔진 logical 좌표, m 단위. 엔진 px는 ×37.42)
storyboard_v2 각 장면에서 yaw 최소와 최대인 말. 스토리보드 월드에서 x 부호만 뒤집은 값이다. "화면"은 렌더에서 투영한 접선 방향(← = flip).

| 장면 | 레인 | 카메라 (x, y, 높이) | 말 (x, y) | 접선 | sheetYaw | 고도 | 기대 시트 | 기대 flip | 화면 |
|---|---|---|---|---|---|---|---|---|---|
| 01 드론 전경 | 1 | (-4, -66, 34) | (-48.42, 7.4) | (1, 0) | -31.2° | 21.6° | `straight_a0` | true | ← |
| 01 드론 전경 | 12 | (-4, -66, 34) | (-48.42, 20.6) | (1, 0) | -27.2° | 19.3° | `straight_a0` | true | ← |
| 02 드론 하강 | 1 | (-25.07, 0, 15) | (-48.42, 7.4) | (1, 0) | -72.4° | 31.5° | `wide_a1` | true | ← |
| 02 드론 하강 | 12 | (-25.07, 0, 15) | (-48.42, 20.6) | (1, 0) | -48.6° | 25.7° | `wide_a3` | true | ← |
| 03 게이트 정면 | 2 | (-32.07, 8.25, 3.6) | (-48.42, 8.6) | (1, 0) | -88.8° | 12.4° | `wide_a0` | true | ← |
| 03 게이트 정면 | 12 | (-32.07, 8.25, 3.6) | (-48.42, 20.6) | (1, 0) | -52.9° | 10.0° | `wide_a2` | true | ← |
| 04 카운트다운 | 12 | (-44.07, 31.85, 15) | (-48.42, 20.6) | (1, 0) | -21.1° | 51.2° | `straight_a1` | false | → |
| 04 카운트다운 | 1 | (-44.07, 31.85, 15) | (-48.42, 7.4) | (1, 0) | -10.1° | 31.1° | `straight_a1` | false | → |
| 05 출발 | 1 | (-35.07, -0.35, 5.0) | (-45.09, 7.4) | (1, 0) | -52.3° | 21.5° | `wide_a3` | true | ← |
| 05 출발 | 12 | (-35.07, -0.35, 5.0) | (-44.14, 20.6) | (1, 0) | -23.4° | 12.4° | `straight_a0` | true | ← |
| 06 초반 직선 | 6 | (-2.07, -2.35, 4.2) | (-21.01, 12.2) | (1, 0) | -52.5° | 10.0° | `wide_a3` | true | ← |
| 06 초반 직선 | 3 | (-2.07, -2.35, 4.2) | (-3.07, 9.8) | (1, 0) | -4.7° | 19.0° | `straight_a2` | true | ← |
| 07 코너 | 6 | (50.92, -4, 6.5) | (23.11, 8.05) | (0.936, -0.353) | -87.3° | 12.1° | `wide_a0` | true | ← |
| 07 코너 | 3 | (50.92, -4, 6.5) | (26.6, -3.49) | (-0.471, -0.882) | 26.9° | 15.0° | `corner_a1` | false | → |
| 08 백 스트레치 | 9 | (12, 2, 15) | (7.03, -13.4) | (-1, 0) | 17.9° | 42.8° | `straight_a3` | true | ← |
| 08 백 스트레치 | 1 | (12, 2, 15) | (-14.47, -7.4) | (-1, 0) | 70.5° | 28.1° | `wide_a6` | true | ← |
| 09 홈 스퍼트 | 2 | (3.69, 0.65, 3.0) | (-20.37, 7.39) | (0.999, 0.041) | -72.0° | 6.8° | `wide_a1` | true | ← |
| 09 홈 스퍼트 | 9 | (3.69, 0.65, 3.0) | (-26.79, 10.18) | (0.835, 0.551) | -39.2° | 5.4° | `wide_a3` | true | ← |
| 10 결승 | 2 | (9.69, -1.35, 4.5) | (-2.06, 7.4) | (1, 0) | -53.3° | 17.1° | `wide_a2` | true | ← |
| 10 결승 | 3 | (9.69, -1.35, 4.5) | (7.29, 8.6) | (1, 0) | -13.6° | 23.7° | `straight_a1` | true | ← |
| 합성: 측면, 카메라 +y 쪽 | - | toCam=(0, 10, z 4) | - | (1, 0) | 0° | - | `straight_a2` | false | - |
| 합성: 측면, 카메라 -y 쪽 | - | toCam=(0, -10, z 4) | - | (1, 0) | 0° | - | `straight_a2` | true | - |
| 합성: 정면(카메라가 앞) | - | toCam=(10, 0.01, z 4) | - | (1, 0) | -89.9° | - | `wide_a0` (flip은 이전 값 유지) | false | - |
| 합성: 후면(카메라가 뒤) | - | toCam=(-10, 0.01, z 4) | - | (1, 0) | 89.9° | - | `wide_a6` (클램프, flip은 이전 값 유지) | false | - |
| 합성: 앞쪽 45° | - | toCam=(7, 7, z 4) | - | (1, 0) | -45° | - | `wide_a3` | false | - |

전체 120마리 케이스: `storyboard_v2/work/cases.json`. 생성과 검증 코드는 `storyboard_v2/src/cases.py`(엔진 공식으로 다시 계산해 렌더 결과와 비교, 불일치 0).
