<?php
/**
 * CyberShop Media Gateway — upload endpoint for the cPanel storage host.
 *
 * Flow (see docs/architecture.md, "Media pipeline"):
 *   1. Worker issues a short-lived HMAC-signed upload token (payload.signature)
 *   2. Browser POSTs multipart {token, key, file} here
 *   3. This script verifies the token signature + expiry + MIME allowlist + size,
 *      writes the file under MEDIA_ROOT with the server-chosen key, strips EXIF and returns a signed post-write receipt
 *   4. Browser finalizes with the Worker, which enforces single-use, quotas and
 *      business ownership (the gateway is a dumb, authenticated file writer)
 */

declare(strict_types=1);

error_reporting(E_ALL);
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

function out(int $code, array $body): void {
    http_response_code($code);
    echo json_encode($body);
    exit;
}

if (!is_file(__DIR__ . '/config.php')) out(503, ['ok' => false, 'error' => 'gateway not configured']);
require __DIR__ . '/config.php';
foreach (['GATEWAY_SECRET', 'MEDIA_ROOT', 'ALLOWED_MIMES', 'MAX_UPLOAD_BYTES', 'ALLOWED_ORIGINS'] as $setting) {
    if (!defined($setting)) out(503, ['ok' => false, 'error' => 'gateway configuration incomplete']);
}
if (strlen(GATEWAY_SECRET) < 32 || str_starts_with(GATEWAY_SECRET, 'change-me')) {
    out(503, ['ok' => false, 'error' => 'gateway secret must be configured']);
}

// Cross-origin browser uploads need an explicit origin grant. No cookies are
// accepted/required: the short-lived signed token is the only upload authority.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
header('Vary: Origin');
if ($origin !== '') {
    if (!in_array($origin, ALLOWED_ORIGINS, true)) out(403, ['ok' => false, 'error' => 'origin not allowed']);
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
}
$method = $_SERVER['REQUEST_METHOD'] ?? 'POST';
if ($method === 'OPTIONS') { http_response_code(204); exit; }
if ($method !== 'POST') { header('Allow: POST, OPTIONS'); out(405, ['ok' => false, 'error' => 'method not allowed']); }

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

$expected = hash_hmac('sha256', $payloadB64, GATEWAY_SECRET);
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
$prefix = $payload['p'] ?? '';
$businessPrefix = "media/vendors/{$biz}/";
if (!is_string($prefix) || strpos($prefix, $businessPrefix) !== 0 || !str_ends_with($prefix, '/')) {
    out(403, ['ok' => false, 'error' => 'token scope missing or invalid']);
}
if (strpos($key, $prefix) !== 0) out(403, ['ok' => false, 'error' => 'key does not match token']);

// --- read + validate upload -------------------------------------------------
if (!isset($_FILES['file']) || !is_array($_FILES['file'])) out(400, ['ok' => false, 'error' => 'missing file']);
$file = $_FILES['file'];
if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) out(400, ['ok' => false, 'error' => 'upload failed']);
if ($file['size'] <= 0) out(400, ['ok' => false, 'error' => 'empty file']);
if ($file['size'] > $maxB) out(413, ['ok' => false, 'error' => 'file exceeds size limit']);
if ($file['size'] > MAX_UPLOAD_BYTES) out(413, ['ok' => false, 'error' => 'file exceeds hard limit']);

$bytes = file_get_contents($file['tmp_name']);
if ($bytes === false) out(500, ['ok' => false, 'error' => 'could not read upload']);

// magic-byte MIME detection (never trust the client)
$mime = detectMime($bytes);
if ($mime === null) out(415, ['ok' => false, 'error' => 'unrecognized file type']);
if (!in_array($mime, ALLOWED_MIMES, true)) out(415, ['ok' => false, 'error' => 'file type not allowed']);

// extension must match detected MIME
$extMap = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
$expectedExt = $extMap[$mime] ?? null;
$actualExt = strtolower(pathinfo($key, PATHINFO_EXTENSION));
if ($expectedExt !== null && $actualExt !== $expectedExt) out(415, ['ok' => false, 'error' => 'extension does not match content']);

// --- write to storage -------------------------------------------------------
$mediaRoot = rtrim(MEDIA_ROOT, '/');
$dest = $mediaRoot . '/' . $key;
$dir = dirname($dest);
if (!is_dir($dir) && !@mkdir($dir, 0755, true)) out(500, ['ok' => false, 'error' => 'cannot create directory']);

// never overwrite existing files (key contains a fresh UUID, but be safe)
if (file_exists($dest)) out(409, ['ok' => false, 'error' => 'file already exists']);

// Inspect dimensions before allocating a GD bitmap. Fail closed: never publish
// malformed images or silently retain EXIF when the decoder is unavailable.
$info = @getimagesizefromstring($bytes);
if (!$info || $info[0] <= 0 || $info[1] <= 0 || $info[0] > 10000 || $info[1] > 10000 || $info[0] * $info[1] > 16000000) {
    out(415, ['ok' => false, 'error' => 'invalid or oversized image dimensions']);
}
if (!function_exists('imagecreatetruecolor')) out(503, ['ok' => false, 'error' => 'image processing unavailable']);
$bytes = stripExif($bytes, $mime);
if ($bytes === null) out(415, ['ok' => false, 'error' => 'image decoding failed']);
if (strlen($bytes) > min($maxB, MAX_UPLOAD_BYTES)) out(413, ['ok' => false, 'error' => 'processed image exceeds size limit']);
// Exclusive creation closes the file_exists / write overwrite race.
$handle = @fopen($dest, 'xb');
if ($handle === false) out(file_exists($dest) ? 409 : 500, ['ok' => false, 'error' => 'cannot create file']);
$offset = 0;
while ($offset < strlen($bytes)) {
    $written = @fwrite($handle, substr($bytes, $offset));
    if ($written === false || $written === 0) { fclose($handle); @unlink($dest); out(500, ['ok' => false, 'error' => 'write failed']); }
    $offset += $written;
}
if (!@fflush($handle)) { fclose($handle); @unlink($dest); out(500, ['ok' => false, 'error' => 'write failed']); }
fclose($handle);
@chmod($dest, 0644);

// dimensions for the finalize call
$w = $h = null;
if (function_exists('getimagesizefromstring')) {
    $info = @getimagesizefromstring($bytes);
    if ($info) { $w = (int)$info[0]; $h = (int)$info[1]; }
}

$receiptPayload = [
    'v' => 1, 't' => $payload['t'], 'b' => $biz, 'key' => $key,
    'mime' => $mime, 'size' => strlen($bytes), 'width' => $w, 'height' => $h,
    'sha256' => hash('sha256', $bytes), 'expires_at' => $expire,
];
$receiptB64 = rtrim(strtr(base64_encode(json_encode($receiptPayload, JSON_UNESCAPED_SLASHES)), '+/', '-_'), '=');
$receipt = $receiptB64 . '.' . hash_hmac('sha256', 'media-receipt.v1:' . $receiptB64, GATEWAY_SECRET);
out(200, [
    'ok' => true,
    'receipt' => $receipt,
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

/** Best-effort EXIF/metadata stripping + downscale: vendor phone photos
 *  arrive at 4–8 MB; buyers are on mobile data. Max dimension 1600 px,
 *  re-encoded (quality 85) — never upscales; failure is rejected. */
function stripExif(string $bytes, string $mime): ?string {
    if (!function_exists('imagecreatetruecolor')) return null;
    try {
        $img = match ($mime) {
            'image/jpeg' => @imagecreatefromstring($bytes),
            'image/png'  => @imagecreatefromstring($bytes),
            'image/webp' => @imagecreatefromstring($bytes),
            default => false,
        };
        if ($img === false || $img === null) return null;

        // downscale to sane web dimensions (largest edge ≤ 1600)
        $w = imagesx($img);
        $h = imagesy($img);
        $max = 1600;
        if ($w > $max || $h > $max) {
            $scale = $max / max($w, $h);
            $nw = max(1, (int) round($w * $scale));
            $nh = max(1, (int) round($h * $scale));
            $resized = imagecreatetruecolor($nw, $nh);
            if ($mime === 'image/png') {
                imagealphablending($resized, false);
                imagesavealpha($resized, true);
            }
            imagecopyresampled($resized, $img, 0, 0, 0, 0, $nw, $nh, $w, $h);
            imagedestroy($img);
            $img = $resized;
        }

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
        return null;
    } catch (Throwable) {
        return null;
    }
}
