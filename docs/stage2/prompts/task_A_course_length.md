# 코스 작업 A — 길이·속도 (Cursor 프롬프트)

`feature/renewal`에서 `feat/stage2-course-length` 브랜치를 새로 만들어 작업하고, 끝나면 push만 해. PR은 만들지 마.

## 먼저 읽을 것 (필요한 파일만)
- `docs/stage2/SPEC.md` §8 (특히 8-1 표)
- `game/track.ts`, `lib/race.ts`의 `BASE_SPEED` 부근, `game/gateViews.ts`의 `GATE_X`·드론 샷 targetX
- 관중석 배치 코드(메인 관중석 12m 타일), 아래 테스트들
- `game/trackLayout.test.ts`, `game/standPlacement.test.ts`, `game/overlayLayout.test.ts`, `scripts/safety-net.test.ts`

## 할 일
1. `game/track.ts`
   - `CHUTE_M = 55` (27 → 55)
   - `RACE_METERS = 357` (222 → 357)
   - `STRAIGHT_M`은 `RACE_METERS`에서 계산하지 말고 **상수 80.3**으로 바꿔.
   - 코너 반경 14m(`REFERENCE_RADIUS_M`), 트랙 폭, 레인 간격, 말 크기, 카메라 줌은 그대로 둬.
   - 결승선은 홈 직선 ⅔ 지점 그대로. 구간: 슈트 0~55 / 첫 직선 55~135.3 / 코너 135.3~179.3 / 백스트레치 179.3~259.5 / 코너 259.5~303.5 / 결승 직선 303.5~357.
2. `lib/race.ts`
   - 진행 속도 배율 1.99(SPEC §8) 기준으로 경주가 약 60초가 되게 `BASE_SPEED`를 1/40.2 → 약 1/60.0으로 조정.
   - 스퍼트 +12%는 결승 직선 시작(303.5m)부터. 시작 지점이 진행률로 잡혀 있으면 새 값에 맞춰.
3. 슈트 변경 영향 처리
   - 게이트는 `GATE_X = −STRAIGHT/2 − CHUTE`로 자동으로 따라가야 해. 슈트 시작점에 서는지 확인.
   - 드론 샷 01의 targetX를 새 게이트 위치·구도에 맞게 조정(02 이후 `start/` 구도는 변하지 않게).
   - 메인 관중석 띠가 늘어난 슈트를 덮도록 12m 타일 수를 맞춰(대략 +1장).
   - 결과 순위표 제목 등 화면에 나오는 트랙 거리 값이 있으면 새 값으로.
4. 영향받는 테스트 값 갱신(약 5개). 테스트를 지우거나 느슨하게 만들지 말고 새 기준값으로 바꿔.

## 하지 말 것
- 말 능력치·스킬 변경 금지.
- 레인·막힘 규칙(작업 B), 칸 번호 공정성 보정(작업 C)은 손대지 마.
- 결승 연출(§3-2, 9-B)과 SPEC 문서는 건드리지 마.

## 완료 기준
- `npm test` 전부 통과.
- 여러 시드(최소 20판)로 경주 시간 60초 ±2초. 시드별 시간 표를 커밋 메시지나 `docs/stage2/captures/taskA/times.md`에 남겨.
- 게이트가 슈트 시작점(0m)에 있음.
- 캡처를 `docs/stage2/captures/taskA/`에 저장: 드론 01 시작, `start/` 구도, 슈트 전체와 관중석, 결승 직선 진입, 결승선.
- 바꾼 숫자(전→후) 목록을 마지막에 정리해서 보고.
