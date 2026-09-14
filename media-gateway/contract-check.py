#!/usr/bin/env python3
"""Contract check: worker-issued upload tokens vs the PHP gateway's verification.

The sandbox has no PHP runtime, so this verifies the most failure-prone part of
the worker<->gateway coupling: a REAL token from the running Worker (src/lib/media.ts)
checked by a line-by-line port of media-gateway/upload.php's validation (token
format, HMAC-SHA256 over the base64url payload, payload fields b/e/m, key
prefix/segment rules). Run with the local worker up:

    python3 media-gateway/contract-check.py
"""
import base64
import hashlib
import hmac
import json
import re
import sys
import time
import urllib.request

WORKER = "http://127.0.0.1:8787"
DEV = "/home/user/cybershop/worker/.dev.vars"


def env(name):
    for line in open(DEV):
        if line.startswith(name + "="):
            return line.strip().split("=", 1)[1].strip().strip('"')
    sys.exit(f"{name} not in {DEV}")


def call(method, path, data=None, jar=None, ctype="application/json"):
    req = urllib.request.Request(WORKER + path, method=method)
    req.add_header("x-internal-secret", env("INTERNAL_SECRET"))
    if data is not None:
        req.add_header("content-type", ctype)
        req.data = json.dumps(data).encode()
    if jar:
        req.add_header("cookie", f"cs_session={jar}")
    try:
        with urllib.request.urlopen(req) as r:
            body = r.read().decode()
            setc = r.headers.get("set-cookie")
            return r.status, body, setc
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(), None


# --- port of upload.php verification -----------------------------------------
def gateway_verify(token, key, secret, now=None):
    """Returns (http_code, error_or_None) exactly as upload.php would."""
    now = now or int(time.time())
    parts = token.split(".")
    if len(parts) != 2:
        return 400, "bad token"
    payload_b64, signature = parts
    expected = hmac.new(secret.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        return 403, "invalid token signature"
    payload = json.loads(base64.urlsafe_b64decode(payload_b64 + "=" * (-len(payload_b64) % 4)))
    if not isinstance(payload, dict):
        return 403, "bad token payload"
    biz = int(payload.get("b", 0))
    expire = int(payload.get("e", 0))
    maxb = int(payload.get("m", 0))
    if biz <= 0 or maxb <= 0:
        return 403, "bad token payload"
    if expire < now:
        return 410, "token expired"
    if len(key) > 255:
        return 400, "key too long"
    for seg in key.split("/"):
        if seg in ("", ".", "..") or not re.fullmatch(r"[A-Za-z0-9._-]+", seg):
            return 400, "invalid key"
    if not key.startswith(f"media/vendors/{biz}/"):
        return 403, "key does not match token"
    return 200, None


def check(name, cond):
    print(("PASS  " if cond else "FAIL  ") + name)
    return bool(cond)


def main():
    secret = env("GATEWAY_SECRET")
    _, _, jar = call("POST", "/api/auth/login",
                     {"email": "cea@test.ng", "password": "Passw0rd123"})
    if not jar:
        sys.exit("login failed — is the demo vendor present?")
    cookie = jar.split("cs_session=")[1].split(";")[0]

    status, body, _ = call("POST", "/api/vendor/media/token", {}, jar=cookie,
                           ctype="image/jpeg")
    assert status == 200, f"token request failed: {status} {body[:200]}"
    t = json.loads(body)
    token, prefix = t["token"], t["pathPrefix"]
    key = prefix + "deadbeef-0000-4000-8000-000000000000.jpg"

    results = [
        check("worker token format is payload.signature (b64url, no padding)",
              re.fullmatch(r"[A-Za-z0-9_-]+\.[0-9a-f]{64}", token) is not None),
        check("gateway accepts real worker token + worker-chosen key",
              gateway_verify(token, key, secret) == (200, None)),
    ]
    payload = json.loads(base64.urlsafe_b64decode(token.split(".")[0] + "==="))
    results.append(check("payload fields b/e/m match worker contract "
                         f"(biz int, ~10min expiry, 8MiB cap)",
                         isinstance(payload["b"], int)
                         and abs(payload["e"] - int(time.time())) < 660
                         and payload["m"] == 8 * 1024 * 1024))

    # negative cases — the PHP side must reject these
    tampered = token[:-1] + ("0" if token[-1] != "0" else "1")
    results.append(check("tampered signature rejected (403)",
                         gateway_verify(tampered, key, secret)[0] == 403))
    # a properly-signed-but-expired token (as a delayed request would look)
    expired_payload = base64.urlsafe_b64encode(
        json.dumps({**payload, "e": int(time.time()) - 60}).encode()).decode().rstrip("=")
    expired_sig = hmac.new(secret.encode(), expired_payload.encode(), hashlib.sha256).hexdigest()
    results.append(check("expired (but validly signed) token rejected (410)",
                         gateway_verify(expired_payload + "." + expired_sig, key, secret)[0] == 410))
    other_biz_key = key.replace(f"vendors/{payload['b']}/", "vendors/999/", 1)
    results.append(check("key for a different business rejected (403)",
                         gateway_verify(token, other_biz_key, secret)[0] == 403))
    results.append(check("path traversal in key rejected (400)",
                         gateway_verify(token, f"media/vendors/{payload['b']}/../x.jpg", secret)[0] == 400))
    results.append(check("missing dot rejected (400)",
                         gateway_verify(token.replace(".", "", 1), key, secret)[0] == 400))

    # wrong secret (misconfigured host) must be rejected
    results.append(check("token fails under a different GATEWAY_SECRET",
                         gateway_verify(token, key, "some-other-secret-32-chars-long-xx")[0] == 403))

    # worker side must reject a GATEWAY-forged finalize (defense in depth)
    forged = base64.urlsafe_b64encode(
        json.dumps({**payload, "b": 99999}).encode()).decode().rstrip("=")
    forged_sig = hmac.new(secret.encode(), forged.encode(), hashlib.sha256).hexdigest()
    status, body, _ = call("POST", "/api/vendor/media/finalize",
                           {"token": forged + "." + forged_sig,
                            "storage_key": "media/vendors/99999/x.jpg",
                            "mime": "image/jpeg", "size": 10},
                           jar=cookie)
    results.append(check("worker finalize rejects a key outside the token's prefix "
                         f"(got {status}: {body.strip()[:80]})",
                         status in (400, 403)))

    print()
    if all(results):
        print(f"ALL {len(results)} CONTRACT CHECKS PASSED")
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
