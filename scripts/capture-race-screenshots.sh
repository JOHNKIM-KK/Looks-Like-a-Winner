#!/bin/bash

# 레이스 스크린샷 촬영 스크립트
mkdir -p /opt/cursor/artifacts

echo "서버 확인 중..."
curl -s http://localhost:3000 > /dev/null || {
    echo "서버가 실행되지 않았습니다"
    exit 1
}

echo "Chrome으로 레이스 페이지 열기..."
# 관상 선택 화면 스킵하고 직접 레이스로
DISPLAY=:1 google-chrome \
    --headless \
    --disable-gpu \
    --no-sandbox \
    --window-size=1080,2340 \
    --virtual-time-budget=10000 \
    --screenshot=/opt/cursor/artifacts/race-screenshot.png \
    "http://localhost:3000" \
    2>/dev/null &

CHROME_PID=$!
sleep 12

# 프로세스 확인
if ps -p $CHROME_PID > /dev/null; then
    echo "Chrome 아직 실행 중, 대기..."
    wait $CHROME_PID
fi

ls -lh /opt/cursor/artifacts/race-screenshot.png 2>/dev/null || echo "스크린샷 실패"
