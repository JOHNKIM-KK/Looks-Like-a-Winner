# Stage 2 아트 차이 목록: 목업 vs 라이브(#19, 38e5279, localhost:3001)
범위: 기본 말과 기수의 주행만 봄(스킬·이벤트 제외, 품종 20종 보류). 비교 이미지: `diff/NN_*.png`(왼쪽 목업, 오른쪽 라이브), 모아 보기: `diff/00_contact.png`.
코드 경로 기준: `/workspace/gemi_review3`. 🎨 표시는 에셋을 새로 만들어야 하는 항목.

## P0: 반드시 고칠 것
1. **말이 거꾸로 달림**: `diff/04`
   - 목업: 진행 방향을 향해 달림
   - 라이브: 왼쪽으로 가면서 머리는 오른쪽을 봄. 코너와 결승 구간도 같은 문제
   - 수정: `game/createRaceGame.ts:767-779`에서 그릴 때 picked.flip 대신 pose.flipX(`track.ts:276`)를 쓰거나, `game/horseVisual.ts:63-67`의 좌우 부호를 바꾸기. 방향 테스트 추가.
2. **말과 기수가 너무 작음**: `diff/04`
   - 목업 직선: 말 길이가 화면 폭의 약 40-50%
   - 라이브: 약 5-8%
   - 수정: `game/cameraConfig.ts:83` STRAIGHT_EARLY(distance 360, focal 1100)를 목업처럼 가깝고 낮게. 기준값은 distance 약 120-150, 고도 약 10°. `:82` START(520/32°)도 같이.
   - 프레이밍 제약: `cameraConfig.ts:33-41`의 "12마리 모두 화면 안" 규칙과 충돌하므로, topN 상태로 바꿔야 함.
3. **하늘과 지평선 톤이 다름**: `diff/01`, `diff/02`
   - 목업: 골든아워 주황-금색 하늘, 관중석이 지평선을 가림
   - 라이브: 보라-분홍 저녁 하늘, 뾰족한 산, 그 아래 평평한 짙은 녹색 띠
   - 수정 위치:
     - 하늘 `createRaceGame.ts:339` `/track/bg/sky_v1.webp`
     - 산 `:340` `far_hills_v1.webp`
     - 녹색 띠는 `trackRenderer.ts:190` fog `0x3f4630`. 띠 대신 잔디와 관중석으로 채우기.
   - 쓸 에셋: `final/public/track/v2/sky_strip.webp`, `final/public/track/v2/stands_strip_v4.webp`(review_stage2 v4에서 승인). 지평선까지 지면 채우기는 닫힌 PR #15(aa70c9b)를 가져오기.
   - 🎨 산 배경을 빼거나 골든아워 톤으로 다시 칠해야 하면 새로 만들어야 함.

## P1
4. **관중석이 거의 안 보임**: `diff/03`, `diff/01`
   - 목업: 직선 뒤쪽에 큰 관중석 띠
   - 라이브: 원경에서 작게만 보임(`trackRenderer.ts:92-95`, `stands_main_v1.webp`)
   - 쓸 에셋: `final/public/track/v2/stands_strip_v4.webp`. 카메라 기준 높이 조정 필요.
5. **잔디와 흙 톤**: `diff/02`, `diff/03`
   - 목업: 따뜻한 연두 잔디, 주황빛 흙
   - 라이브: 채도 낮은 올리브 잔디, 회갈색 흙
   - 수정: `createRaceGame.ts:336-337` `/track/v2/ground_*.webp`에 따뜻한 색 보정(MULTIPLY 틴트) 또는 `final/public/track/v2`의 같은 파일 확인. 밉맵은 #15 f74337b.
6. **게이트 RACE PARK 간판이 안 보임**: `diff/06`
   - 목업: 게이트 위 간판
   - 라이브: 흰 프레임만 보임. `gateRenderer.ts:218/254` paintSign가 start 각도에서 화면 밖에 그려지거나 숨겨지는지 확인
   - 쓸 에셋: `stage_gate_v1/assets/gate/start/sign_text.webp`(= `public/gate/start/`)
7. **게이트 번호판과 문**: `diff/06`, `diff/07`
   - 목업: 칸마다 레인 색 번호판, 문이 순서대로 열림
   - 라이브: 번호판은 앞쪽 몇 칸만 읽힘(멀어서). 문 열림은 프레임 간격이 커서 안 보임
   - 수정: 카메라(START)를 가깝게 하면 대부분 해결. 확인할 곳은 `startGate.ts:121` openAll jitter 40ms와 `door_f0-5.webp`.
8. **카운트다운 화면 구성**: `diff/05`
   - 목업: 위에서 비스듬히 내려다보며 12칸 전체가 세로로 보이고, 노란 "3"
   - 라이브: 측면 사선 앵글에 흰 "3"
   - 수정: 앵글은 `cameraConfig.ts:82`, 숫자색은 `overlayLayout.ts`의 countdown(fontSize 112) 색을 #FFD000 계열로
9. **드론 인트로 없음**: `diff/10`
   - 목업: 관중석에서 게이트로 내려오는 드론 컷(mock_drone1/4)
   - 라이브: 0.5초에 바로 카운트다운
   - 수정: `startGate.ts:65`에 drone 각도만 있음. 인트로 연출을 `createRaceGame.ts` 카운트다운 앞에 새로 넣어야 함.

## P2: 화면 UI
10. **순위판**: `diff/08`
    - 목업: 반투명 남색 패널. 1-3위는 큰 카드로 칸 번호판(레인 색으로 채움) + 이름, 1위는 금색 테두리와 왕관. 나머지 9마리는 작은 칩
    - 라이브: 비어 있는 사각형에 레인 색 테두리만 있고 번호판 채움 없음. 이름 글자가 작고 패널 배경 없음
    - 수정: `components/RaceOverlay.tsx:215-232` RankChip(`:226` border를 laneColor로 씀), `overlayLayout.ts:43-60` ranking
    - 목업 기준: 패널 배경 #1b1030 약 80%, 카드 테두리 #5CE1FF(1위 #FFE14A), 번호판 = laneColors.ts 채움 + 글자색 `:26-27`
11. **아래쪽 바**: `diff/09`
    - 목업 순서: 스킬 배너 → 실황 중계(#5CE1FF 테두리, "실황 중계" 라벨) → 진행바(0/1200m, 말 점)
    - 라이브: 중계 박스만 있음(라벨 없음). 스킬 슬롯은 빈 박스, 진행바는 맨 위 4%에 있음
    - 수정: `overlayLayout.ts:69-95` caption/skillSlot, 진행바 위치 `:34-35`
    - 스테이지 2는 스킬 제외라서 배너는 빈 칸을 숨겨도 됨
12. **실루엣과 기수 옷**: `diff/04`
    - 목업: 단색 셀 셰이딩 기수 옷, 레인 색이 큼
    - 라이브: 멀어서 판단 불가. 카메라를 고친(2번) 뒤 다시 확인
    - farShade(`createRaceGame.ts:183`)가 가까운 거리에서 꺼지는지도 확인

## P3: 화면 구성(카메라)
13. **코너**: `diff/11`
    - 목업 v4: 무리를 중심에 두고 사선
    - 라이브: 무리가 화면 위쪽 1/3에 몰리고 아래 절반이 잔디
    - 수정: `cameraConfig.ts:85-86` CORNER_IN/OUT targetYOffset과 고도
14. **결승**: `diff/12`
    - 라이브: 거리 1800, focal 2600(`cameraConfig.ts:87`)이라 말이 작고 결승 기둥이 멂
    - 목업 기준으로 거리를 약 900으로 낮추기

## 에셋을 새로 만들어야 할 수 있는 것 (🎨)
- 골든아워 산 배경 또는 원경 띠(3번). `final/public/track/v2/sky_strip.webp`만으로 충분하면 필요 없음.
- 카메라가 가까워지면 지금 말과 기수 시트 해상도가 충분한지 확인(HORSE_PX_PER_M 96.97, `artScale.ts:25`). 목업 크기라면 화면당 약 2배 확대라서 흐리면 🎨.
