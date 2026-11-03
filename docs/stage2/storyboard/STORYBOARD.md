# Storyboard v2: 말 몸 방향 수정판

- 카메라, 프레이밍, UI는 v1과 같음(잠금). 바뀐 것은 말 시트 선택과 flip뿐이며, 규칙은 `HEADING_RULE.md`
- 신규 시트: 시트 yaw -90/-75/-60/-45/+45/+60/+75(말과 기수, 레인 틴트 마스크 포함), `sheets/`
- 캡션의 말 길이 %는 그려진 폭이라, 3/4 앞모습이나 뒷모습인 장면(02, 03, 05, 09, 10)에서는 v1보다 작게 나온다. 카메라 거리와 렌즈는 v1과 같으니 거리를 정할 때는 v1 % 값(측면 기준)을 쓸 것
- v1 대 v2 비교: `diff/NN_*.webp`, 모아 보기 `diff/00_v1_vs_v2_contact.webp`

| # | 말 길이 v2 최대/중앙 | 사용 시트 |
|---|---|---|
| 01 | 2.1% / 1.9% | straight_a0 |
| 02 | 5.1% / 4.2% | wide_a1, wide_a2, wide_a3 |
| 03 | 8.0% / 5.5% | wide_a0, wide_a1, wide_a2 |
| 04 | 9.6% / 7.8% | straight_a1 |
| 05 | 13.8% / 11.0% | straight_a0, wide_a3 |
| 06 | 26.1% / 19.5% | straight_a0, straight_a1, straight_a2, wide_a3 |
| 07 | 14.4% / 11.5% | corner_a0, corner_a1, straight_a0, straight_a1, straight_a2, straight_a3, wide_a0, wide_a1, wide_a2, wide_a3 |
| 08 | 12.2% / 3.9% | straight_a3, straight_a4, wide_a4, wide_a5, wide_a6 |
| 09 | 14.6% / 14.5% | wide_a1, wide_a2, wide_a3 |
| 10 | 23.7% / 21.4% | straight_a0, straight_a1, wide_a2, wide_a3 |
