# Testing Guide

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
