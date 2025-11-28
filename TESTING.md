# Testing Guide

Set `BASE` to your running Pages dev server (e.g., `http://localhost:8788` when using `npm run pages:dev`).

## Auth
- Invalid token (expects 401):
  ```bash
  curl -i -X POST "$BASE/api/login/google" \
    -H "Content-Type: application/json" \
    -d '{"idToken":"invalid"}'
  ```

- Valid token (expects 200):
  ```bash
  curl -i -X POST "$BASE/api/login/google" \
    -H "Content-Type: application/json" \
    -d '{"idToken":"<valid_id_token>"}'
  ```

## Quantum RNG consumption
- Issue simultaneous requests and confirm returned `value` entries differ:
  ```bash
  # After creating a session (SESSION_ID) and joining (PARTICIPANT_ID)
  parallel -j2 "curl -s -X POST $BASE/api/sessions/$SESSION_ID/messages -H 'Content-Type: application/json' -d '{\"participantId\":\"'$PARTICIPANT_ID'\",\"text\":\"1d100\"}'" ::: 1 2
  ```
  Both responses should carry distinct dice outcomes when quantum mode is enabled.

## Stopwatch time control
- Pause and resume propagate the shared game clock:
  ```bash
  # Pause at the current game time
  curl -s -X POST "$BASE/api/sessions/$SESSION_ID/kp" \
    -H "Content-Type: application/json" \
    -d '{"password":"<kp_password>","mode":"system","action":"pause"}'

  # Resume the stopwatch
  curl -s -X POST "$BASE/api/sessions/$SESSION_ID/kp" \
    -H "Content-Type: application/json" \
    -d '{"password":"<kp_password>","mode":"system","action":"resume"}'
  ```
  Fetch `/api/sessions/$SESSION_ID/info` between calls to confirm `last_resumed_at` toggles between `null` (paused) and a millisecond timestamp (running), while `game_time_elapsed` increases only when running.

- Set an arbitrary game timestamp and verify dice reproducibility when paused:
  ```bash
  TARGET_TIME=$(date -d '2024-06-01T12:00:00Z' +%s000)
  curl -s -X POST "$BASE/api/sessions/$SESSION_ID/kp" \
    -H "Content-Type: application/json" \
    -d '{"password":"<kp_password>","mode":"system","setTime":'$TARGET_TIME',"action":"pause"}'

  # Roll twice while paused – the results should match because the seed is fixed
  curl -s -X POST "$BASE/api/sessions/$SESSION_ID/messages" -H "Content-Type: application/json" -d '{"text":"1d100"}'
  curl -s -X POST "$BASE/api/sessions/$SESSION_ID/messages" -H "Content-Type: application/json" -d '{"text":"1d100"}'
  ```

## Time-seeded RNG determinism
- With System mode active, the same integer-second timestamp yields identical seeds. After setting `setTime` to a known value and pausing, re-running identical dice commands should return the same outcomes even after a page reload. Switching to Quantum mode should break that determinism but consume queued quantum numbers instead.
