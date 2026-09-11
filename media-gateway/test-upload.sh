#!/usr/bin/env bash
# CyberShop media gateway — end-to-end smoke test.
#
# Run this ON A PHP CAPABLE HOST (the cPanel box, or anywhere with PHP 8+):
#
#   cd media-gateway
#   cp config.example.php config.php   # set GATEWAY_SECRET (== worker's GATEWAY_SECRET)
#   WORKER_URL=http://127.0.0.1:8787 \
#   VENDOR_EMAIL=vendor@example.com VENDOR_PASSWORD=secret \
#   ./test-upload.sh
#
# What it does:
#   1. starts `php -S 127.0.0.1:8081` with this directory as docroot
#   2. logs in to the worker as a vendor and requests a real upload token
#   3. POSTs a real JPEG to the gateway (multipart token + key + file)
#   4. verifies: HTTP 200, file landed on disk, serves back over HTTP
#   5. verifies the worker FINALIZE accepts the upload (quota/ownership path)
set -euo pipefail

PORT="${PORT:-8081}"
WORKER_URL="${WORKER_URL:-http://127.0.0.1:8787}"
: "${VENDOR_EMAIL:?set VENDOR_EMAIL}"
: "${VENDOR_PASSWORD:?set VENDOR_PASSWORD}"

command -v php >/dev/null 2>&1 || { echo "PHP not found"; exit 1; }
[ -f config.php ] || { echo "missing config.php (cp config.example.php config.php)"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "python3 required (token assertions)"; exit 1; }

cd "$(dirname "$0")"

# minimal valid 1x1 JPEG
printf '\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9' > /tmp/cs-test.jpg

php -S 127.0.0.1:"$PORT" -t . >/tmp/cs-gateway.log 2>&1 &
GW_PID=$!
trap 'kill $GW_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 20); do curl -s -o /dev/null "http://127.0.0.1:$PORT/upload.php" && break; sleep 0.25; done

JAR=/tmp/cs-test-cookies.txt
curl -s -c "$JAR" -X POST -H 'content-type: application/json' \
  -d "{\"email\":\"$VENDOR_EMAIL\",\"password\":\"$VENDOR_PASSWORD\"}" \
  "$WORKER_URL/api/auth/login" >/dev/null
TOKEN_JSON=$(curl -s -b "$JAR" -H 'content-type: image/jpeg' "$WORKER_URL/api/vendor/media/token")
echo "token response: $TOKEN_JSON" | head -c 200; echo

# pathPrefix already ends with '/'
KEY="$(python3 -c 'import json,sys; d=json.loads(sys.argv[1]); print(d["pathPrefix"]+"test.jpg")' "$TOKEN_JSON")"
UPLOAD_URL="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["uploadUrl"])' "$TOKEN_JSON")"
TOKEN="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["token"])' "$TOKEN_JSON")"

echo "-- upload to gateway --"
RESP=$(curl -s -w '\n%{http_code}' -X POST "$UPLOAD_URL" \
  -F "token=$TOKEN" -F "key=$KEY" -F "file=@/tmp/cs-test.jpg;type=image/jpeg")
echo "$RESP"
CODE=$(echo "$RESP" | tail -1)
[ "$CODE" = "200" ] || { echo "GATEWAY UPLOAD FAILED ($CODE)"; exit 1; }

FILE="media/${KEY}"
[ -f "$FILE" ] || { echo "file not on disk: $FILE"; exit 1; }
SERVED=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/$FILE")
[ "$SERVED" = "200" ] || { echo "file not served ($SERVED)"; exit 1; }

echo "-- finalize with worker --"
FIN=$(curl -s -b "$JAR" -H 'content-type: application/json' -X POST \
  -d "{\"token\":\"$TOKEN\",\"storage_key\":\"$KEY\",\"mime\":\"image/jpeg\",\"size\":$(wc -c < "$FILE" | tr -d ' ')}" \
  "$WORKER_URL/api/vendor/media/finalize")
echo "$FIN"
echo "$FIN" | grep -q '"ok":true' || { echo "FINALIZE FAILED"; exit 1; }

rm -f "$FILE"
echo "PASS: gateway token -> upload -> serve -> worker finalize (all OK)"
