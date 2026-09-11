<?php
/**
 * CyberShop Media Gateway — upload endpoint for the cPanel storage host.
 *
 * Flow (see docs/architecture.md, "Media pipeline"):
 *   1. Worker issues a short-lived HMAC-signed upload token (payload.signature)
 *   2. Browser POSTs multipart {token, key, file} here
 *   3. This script verifies the token signature + expiry + MIME allowlist + size,
 *      writes the file under MEDIA_ROOT with the server-chosen key, strips EXIF
 *      (best effort), and returns JSON
 *   4. Browser finalizes with the Worker, which enforces single-use, quotas and
 *      business ownership (the gateway is a dumb, authenticated file writer)
 */

declare(strict_types=1);

error_reporting(E_ALL);
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

function out(int $code, array $body): void {
    http_response_code($code);
    echo json_encode($body);
    exit;
}

require __DIR__ . '/config.php'; // defines GATEWAY_SECRET, MEDIA_ROOT, ALLOWED_MIMES

// --- read payload -----------------------------------------------------------
$token = isset($_POST['token']) ? trim((string)$_POST['token']) : '';
$key   = isset($_POST['key']) ? trim((string)$_POST['key']) : '';

if ($token === '' || $key === '') {
    out(400, ['ok' => false, 'error' => 'missing token or key']);
}

// --- verify signed token ----------------------------------------------------
$parts = explode('.', $token);
if (count($parts) !== 2) out(400, ['ok' => false, 'error' => 'bad token']);
[$payloadB64, $signature] = $parts;

$expected = hash_hmac('sha256', $payloadB64, $GATEWAY_SECRET);
if (!hash_equals($expected, $signature)) out(403, ['ok' => false, 'error' => 'invalid token signature']);

$payload = json_decode(base64_decode(strtr($payloadB64, '-_', '+/')), true);
if (!is_array($payload)) out(403, ['ok' => false, 'error' => 'bad token payload']);
$biz    = (int)($payload['b'] ?? 0);
$expire = (int)($payload['e'] ?? 0);
$maxB   = (int)($payload['m'] ?? 0);
if ($biz <= 0 || $maxB <= 0) out(403, ['ok' => false, 'error' => 'bad token payload']);
if ($expire < time()) out(410, ['ok' => false, 'error' => 'token expired']);

// --- validate storage key ---------------------------------------------------
if (strlen($key) > 255) out(400, ['ok' => false, 'error' => 'key too long']);
$segments = explode('/', $key);
foreach ($segments as $seg) {
    if ($seg === '' || $seg === '.' || $seg === '..') out(400, ['ok' => false, 'error' => 'invalid key']);
    if (!preg_match('/^[A-Za-z0-9._-]+$/', $seg)) out(400, ['ok' => false, 'error' => 'invalid key']);
}
$prefix = "media/vendors/{$biz}/";
if (strpos($key, $prefix) !== 0) out(403, ['ok' => false, 'error' => 'key does not match token']);

// --- read + validate upload -------------------------------------------------
if (!isset($_FILES['file']) || !is_array($_FILES['file'])) out(400, ['ok' => false, 'error' => 'missing file']);
$file = $_FILES['file'];
if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) out(400, ['ok' => false, 'error' => 'upload failed']);
if ($file['size'] <= 0) out(400, ['ok' => false, 'error' => 'empty file']);
if ($file['size'] > $maxB) out(413, ['ok' => false, 'error' => 'file exceeds size limit']);
if ($file['size'] > $MAX_UPLOAD_BYTES) out(413, ['ok' => false, 'error' => 'file exceeds hard limit']);

$bytes = file_get_contents($file['tmp_name']);
if ($bytes === false) out(500, ['ok' => false, 'error' => 'could not read upload']);

// magic-byte MIME detection (never trust the client)
$mime = detectMime($bytes);
if ($mime === null) out(415, ['ok' => false, 'error' => 'unrecognized file type']);
if (!in_array($mime, $ALLOWED_MIMES, true)) out(415, ['ok' => false, 'error' => 'file type not allowed']);

// extension must match detected MIME
$extMap = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
$expectedExt = $extMap[$mime] ?? null;
$actualExt = strtolower(pathinfo($key, PATHINFO_EXTENSION));
if ($expectedExt !== null && $actualExt !== $expectedExt) out(415, ['ok' => false, 'error' => 'extension does not match content']);

// --- write to storage -------------------------------------------------------
$mediaRoot = rtrim($MEDIA_ROOT, '/');
$dest = $mediaRoot . '/' . $key;
$dir = dirname($dest);
if (!is_dir($dir) && !@mkdir($dir, 0755, true)) out(500, ['ok' => false, 'error' => 'cannot create directory']);

// never overwrite existing files (key contains a fresh UUID, but be safe)
if (file_exists($dest)) out(409, ['ok' => false, 'error' => 'file already exists']);

$bytes = stripExif($bytes, $mime);
if (@file_put_contents($dest, $bytes) === false) out(500, ['ok' => false, 'error' => 'write failed']);
@chmod($dest, 0644);

// dimensions for the finalize call
$w = $h = null;
if (function_exists('getimagesizefromstring')) {
    $info = @getimagesizefromstring($bytes);
    if ($info) { $w = (int)$info[0]; $h = (int)$info[1]; }
}

out(200, [
    'ok' => true,
    'storage_key' => $key,
    'mime' => $mime,
    'size_bytes' => strlen($bytes),
    'width' => $w,
    'height' => $h,
]);

function detectMime(string $bytes): ?string {
    if (strlen($bytes) >= 3 && substr($bytes, 0, 3) === "\xFF\xD8\xFF") return 'image/jpeg';
    if (strlen($bytes) >= 8 && substr($bytes, 0, 8) === "\x89PNG\r\n\x1A\n") return 'image/png';
    if (strlen($bytes) >= 12 && substr($bytes, 0, 4) === 'RIFF' && substr($bytes, 8, 4) === 'WEBP') return 'image/webp';
    return null;
}

/** Best-effort EXIF/metadata stripping by decoding + re-encoding via GD. */
function stripExif(string $bytes, string $mime): string {
    if (!function_exists('imagecreatetruecolor')) return $bytes; // GD unavailable → keep original
    try {
        $img = match ($mime) {
            'image/jpeg' => @imagecreatefromstring($bytes),
            'image/png'  => @imagecreatefromstring($bytes),
            'image/webp' => function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($bytes) : false,
            default => false,
        };
        if ($img === false || $img === null) return $bytes;
        ob_start();
        $ok = match ($mime) {
            'image/jpeg' => imagejpeg($img, null, 85),
            'image/png'  => imagepng($img, null, 6),
            'image/webp' => function_exists('imagewebp') ? imagewebp($img, null, 85) : false,
            default => false,
        };
        $result = ob_get_clean();
        imagedestroy($img);
        if ($ok && $result !== false && $result !== '') return $result;
        return $bytes;
    } catch (Throwable) {
        return $bytes;
    }
}
