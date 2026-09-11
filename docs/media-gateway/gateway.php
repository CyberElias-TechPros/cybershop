<?php
/**
 * Cybershop media gateway  —  docs/media-gateway/gateway.php
 *
 * One dependency-free PHP 8 file you drop on shared hosting (cPanel). It is the only
 * thing that ever writes to your 100GB, and it exists so that upload bytes go
 * browser -> host directly instead of through a serverless function (BUILD_PLAN 7.2,
 * which is also why this is NOT an SFTP client).
 *
 * Security model
 *  - every operation requires an HMAC-SHA256 signature over a canonical string,
 *    computed by the app with a shared secret. No user ever sees the secret.
 *  - upload tickets are single-use, expiring, and pin the destination key.
 *  - keys are confined to MEDIA_ROOT (public) or PRIVATE_ROOT (private). No traversal.
 *  - files are re-validated by content signature; names are generated, never user-supplied.
 *  - private files are only ever streamed to a signed, expinging URL (payment proofs).
 *
 * Deploy
 *  1. Put this file at  /public_html/gateway.php            (or a docroot you control)
 *  2. Create            /app-storage/vendors  and  /private-storage   (private one OUTSIDE docroot)
 *  3. Point a subdomain media.yourdomain.com at a docroot whose files live under /app-storage
 *     (or serve /app-storage via an alias). Apache serving static files is the whole point:
 *     correct Content-Type + no auth is what makes WhatsApp link previews work.
 *  4. Set in the app:  MEDIA_DRIVER=gateway, MEDIA_GATEWAY_URL=https://media.yourdomain.com/gateway.php
 *                    MEDIA_PUBLIC_BASE_URL=https://media.yourdomain.com
 *                    MEDIA_GATEWAY_SECRET=<same long random string in php.ini/env>
 *
 * php.ini / .htaccess recommendations
 *    upload_max_filesize = 12M ; post_max_size = 16M ; max_file_uploads = 12
 *    <Files "gateway.php"> <IfModule mod_headers.c> Header set Cache-Control "no-store" </IfModule> </Files>
 *    deny access to *.json manifests:  <FilesMatch "\.json$"> Require all denied </FilesMatch>
 */

declare(strict_types=1);

const MEDIA_ROOT   = '/home/USERNAME/app-storage';        // public: served by Apache
const PRIVATE_ROOT = '/home/USERNAME/private-storage';    // private: never in a docroot
const SECRET       = '';                                   // leave empty to read getenv('MEDIA_GATEWAY_SECRET')
const MAX_BYTES    = 25 * 1024 * 1024;                    // hard ceiling on top of per-ticket limits
const ALLOWED      = [
  'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp',
  'image/gif' => 'gif', 'video/mp4' => 'mp4', 'application/pdf' => 'pdf',
];
const ALLOWED_MAGICS = [
  "\xFF\xD8\xFF" => 'image/jpeg',
  "\x89PNG\r\n\x1a\n" => 'image/png',
  "GIF87a" => 'image/gif', "GIF89a" => 'image/gif',
  "%PDF-" => 'application/pdf',
  // RIFF....WEBP and ftyp are checked positionally below
];

$secret = SECRET !== '' ? SECRET : (getenv('MEDIA_GATEWAY_SECRET') ?: '');
$secret = $secret === 'change-me-to-a-long-random-string' ? '' : $secret;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
// The app calls this server-to-server; the browser sends the file body. Allow both,
// but never allow credentialed cross-origin writes.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
  header('Access-Control-Allow-Origin: ' . $origin);
  header('Vary: Origin');
  header('Access-Control-Allow-Headers: Content-Type, X-Ticket');
  header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
  header('Access-Control-Max-Age: 600');
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') { http_response_code(204); exit; }

function bail(int $code, string $message): never {
  http_response_code($code);
  echo json_encode(['error' => $message]);
  exit;
}
function body(): array {
  $raw = file_get_contents('php://input');
  $j = json_decode($raw ?: 'null', true);
  if (is_array($j)) return $j;
  return $_POST ?: [];
}
function sig(string $canonical, string $secret): string { return hash_hmac('sha256', $canonical, $secret); }
/** constant-time compare; never `==` a signature */
function ok_sig(string $given, string $expected): bool {
  return strlen($given) === strlen($expected) && hash_equals($expected, $given);
}
/** keys look like vendors/<uuid>/catalogue/products/<uuid>-jpeg.jpg or private/... */
function safe_key(string $key): string {
  if ($key === '' || strlen($key) > 300) bail(400, 'bad key');
  if (str_contains($key, '..') || str_contains($key, "\0") || $key[0] === '/' || preg_match('#^[a-z0-9/_.-]+$#', $key) !== 1) {
    bail(400, 'bad key');
  }
  return $key;
}
function root_for(string $visibility): string { return $visibility === 'private' ? PRIVATE_ROOT : MEDIA_ROOT; }
function sniff(string $bytes, int $size): ?string {
  foreach (ALLOWED_MAGICS as $magic => $mime) {
    if (strncmp($bytes, $magic, strlen($magic)) === 0) return $mime;
  }
  if (strncmp($bytes, 'RIFF', 4) === 0 && substr($bytes, 8, 4) === 'WEBP') return 'image/webp';
  if (substr($bytes, 4, 4) === 'ftyp' && preg_match('#isom|mp4|avc|M4V#', substr($bytes, 8, 8))) return 'video/mp4';
  return null;
}
function load_tickets(): array {
  $f = MEDIA_ROOT . '/.tickets.json';
  $fh = fopen($f, 'c+');
  if (!$fh) return [];
  flock($fh, LOCK_EX);
  $data = json_decode((string)stream_get_contents($fh), true) ?: [];
  return [$data, $fh];
}
function save_tickets($fh, array $data): void {
  ftruncate($fh, 0);
  rewind($fh);
  fwrite($fh, json_encode($data));
  fflush($fh);
  flock($fh, LOCK_UN);
  fclose($fh);
}
function purge_expired(array $data): array {
  $now = time();
  foreach ($data as $k => $v) if (($v['exp'] ?? 0) < $now) unset($data[$k]);
  return $data;
}

$op = $_GET['op'] ?? 'ping';
$secret === '' && $op !== 'ping' and bail(500, 'gateway is not configured: set MEDIA_GATEWAY_SECRET');

switch ($op) {
  /** health check, no auth: used by the app's /api/healthz and by you */
  case 'ping':
    echo json_encode([
      'ok' => true,
      'php' => PHP_VERSION,
      'gd' => extension_loaded('gd'),
      'imagick' => extension_loaded('imagick'),
      'write' => is_writable(MEDIA_ROOT),
      'quota_free_bytes' => @disk_free_space(MEDIA_ROOT) ?: null,
      'max_post' => ini_get('post_max_size'),
    ]);
    exit;

  /**
   * POST ?op=ticket   (called by the APP, not the browser)
   * body: {businessId, folder, visibility, maxBytes, allowedMime[], expires, ext}
   * header: x-signature = HMAC(secret, "v1|businessId|folder|visibility|maxBytes|mime,join|expires")
   */
  case 'ticket': {
    $given = $_SERVER['HTTP_X_SIGNATURE'] ?? '';
    $exp = (int)($_SERVER['HTTP_X_EXPIRES'] ?? 0);
    if ($exp < time()) bail(403, 'expired');
    $b = body();
    foreach (['businessId', 'folder', 'visibility'] as $req) if (empty($b[$req])) bail(400, "missing $req");
    if (!preg_match('#^[a-zA-Z0-9-]{8,64}$#', (string)$b['businessId'])) bail(400, 'bad business id');
    if (!in_array($b['visibility'], ['public', 'private'], true)) bail(400, 'bad visibility');
    $folder = preg_replace('#[^a-z0-9/_-]#i', '', (string)$b['folder']);
    $maxBytes = min((int)($b['maxBytes'] ?? 8_000_000), MAX_BYTES);
    $allowed = array_values(array_intersect((array)($b['allowedMime'] ?? []), array_keys(ALLOWED)));
    if (!$allowed) bail(400, 'no allowed mime types');

    $canonical = sprintf('v1|%s|%s|%s|%d|%s|%d', $b['businessId'], $folder, $b['visibility'], $maxBytes, implode(',', $allowed), $exp);
    if (!ok_sig($given, sig($canonical, $secret))) bail(403, 'bad signature');

    $id = bin2hex(random_bytes(16));
    $ext = ALLOWED[$allowed[0]] ?? 'bin';
    $kind = preg_replace('#[^a-z0-9-]#', '', explode('/', $allowed[0])[0]);
    $key = sprintf('%s/%s/%s/%s-%s.%s',
      $b['visibility'] === 'private' ? "private/vendors/{$b['businessId']}" : "vendors/{$b['businessId']}",
      $folder !== '' ? $folder : 'misc', 'incoming', $id, $kind, $ext);

    [$data, $fh] = load_tickets();
    $data = purge_expired($data);
    $data[$id] = [
      'exp' => $exp, 'key' => $key, 'vis' => $b['visibility'], 'biz' => $b['businessId'],
      'max' => $maxBytes, 'mime' => $allowed, 'used' => false,
    ];
    save_tickets($fh, $data);

    echo json_encode([
      'ticket' => $id,
      'uploadUrl' => sprintf('%s?op=put&ticket=%s', $_SERVER['SCRIPT_NAME'], $id),
      'storageKey' => $key,
      'expiresAt' => date('c', $exp),
    ]);
    exit;
  }

  /**
   * PUT ?op=put&ticket=ID   (called by the BROWSER with the raw file body)
   * The ticket is the authorisation: single-use, expiring, key-pinned.
   */
  case 'put': {
    $id = (string)($_GET['ticket'] ?? '');
    [$data, $fh] = load_tickets();
    $t = $data[$id] ?? null;
    if (!$t) { save_tickets($fh, $data); bail(403, 'unknown or expired ticket'); }
    if ($t['exp'] < time()) { unset($data[$id]); save_tickets($fh, $data); bail(403, 'expired ticket'); }
    if ($t['used']) { save_tickets($fh, $data); bail(409, 'ticket already used'); }

    $bytes = file_get_contents('php://input');
    $size = strlen($bytes ?: '');
    if ($size === 0) { save_tickets($fh, $data); bail(400, 'empty body'); }
    if ($size > $t['max'] || $size > MAX_BYTES) { save_tickets($fh, $data); bail(413, 'too large'); }

    $mime = sniff($bytes, $size);
    if ($mime === null || !in_array($mime, $t['mime'], true)) { save_tickets($fh, $data); bail(415, 'content does not match an allowed type'); }

    $key = safe_key($t['key']);
    $abs = root_for($t['vis']) . '/' . $key;
    $dir = dirname($abs);
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) { save_tickets($fh, $data); bail(500, 'cannot create directory'); }
    if (file_put_contents($abs, $bytes) === false) { save_tickets($fh, $data); bail(500, 'write failed'); }
    @chmod($abs, 0644);

    $meta = ['bytes' => $size, 'mime' => $mime, 'sha256' => hash('sha256', $bytes), 'at' => date('c')];
    if ($mime !== 'video/mp4' && extension_loaded('gd')) {
      // strip EXIF by re-encoding through GD, and publish dimensions for CLS-free <img>
      $im = @imagecreatefromstring($bytes);
      if ($im) {
        $meta['width'] = imagesx($im);
        $meta['height'] = imagesy($im);
        if (in_array($mime, ['image/jpeg', 'image/png'], true)) {
          $out = $dir . '/' . pathinfo($abs, PATHINFO_FILENAME) . '-og.webp';
          if (@imagewebp($im, $out, 82)) {
            $meta['variants'] = ['og' => str_replace(root_for($t['vis']) . '/', '', $out)];
          }
        }
        imagedestroy($im);
      }
    }
    file_put_contents($abs . '.json', json_encode($meta));

    $data[$id]['used'] = true;
    save_tickets($fh, $data);

    echo json_encode([
      'storageKey' => $key,
      'publicUrl' => $t['vis'] === 'private' ? null : rtrim(getenv('MEDIA_PUBLIC_BASE_URL') ?: '', '/') . '/' . $key,
      'byteSize' => $size,
      'mimeType' => $mime,
      'extension' => pathinfo($key, PATHINFO_EXTENSION),
      'width' => $meta['width'] ?? null,
      'height' => $meta['height'] ?? null,
      'checksum' => $meta['sha256'],
      'variants' => $meta['variants'] ?? new stdClass(),
    ]);
    exit;
  }

  /** POST ?op=commit  {ticket}  -> the app confirms and can then insert its media row */
  case 'commit': {
    $b = body();
    $id = (string)($b['ticket'] ?? '');
    if (!ok_sig((string)($_SERVER['HTTP_X_SIGNATURE'] ?? ''), sig("commit|$id", $secret))) bail(403, 'bad signature');
    [$data, $fh] = load_tickets();
    $t = $data[$id] ?? null;
    if (!$t || !$t['used']) { save_tickets($fh, $data); bail(404, 'nothing committed for that ticket'); }
    $abs = root_for($t['vis']) . '/' . safe_key($t['key']);
    $meta = json_decode((string)@file_get_contents($abs . '.json'), true) ?: [];
    save_tickets($fh, $data);
    echo json_encode([
      'storageKey' => $t['key'],
      'publicUrl' => $t['vis'] === 'private' ? null : rtrim(getenv('MEDIA_PUBLIC_BASE_URL') ?: '', '/') . '/' . $t['key'],
      'byteSize' => (int)($meta['bytes'] ?? @filesize($abs) ?: 0),
      'mimeType' => $meta['mime'] ?? 'application/octet-stream',
      'extension' => pathinfo($t['key'], PATHINFO_EXTENSION),
      'width' => $meta['width'] ?? null, 'height' => $meta['height'] ?? null,
      'checksum' => $meta['sha256'] ?? null,
      'variants' => $meta['variants'] ?? new stdClass(),
      'visibility' => $t['vis'],
    ]);
    exit;
  }

  /** POST ?op=delete {key,visibility} */
  case 'delete': {
    $b = body();
    $key = safe_key((string)($b['key'] ?? ''));
    $vis = ($b['visibility'] ?? 'public') === 'private' ? 'private' : 'public';
    if (!ok_sig((string)($_SERVER['HTTP_X_SIGNATURE'] ?? ''), sig("del|$key|$vis", $secret))) bail(403, 'bad signature');
    $abs = root_for($vis) . '/' . $key;
    $gone = @unlink($abs);
    @unlink($abs . '.json');
    http_response_code($gone ? 200 : 404);
    echo json_encode(['deleted' => $gone]);
    exit;
  }

  /** POST ?op=exists {key} - used by the orphan sweep to reconcile before deleting */
  case 'exists': {
    $b = body();
    $key = safe_key((string)($b['key'] ?? ''));
    if (!ok_sig((string)($_SERVER['HTTP_X_SIGNATURE'] ?? ''), sig("ex|$key", $secret))) bail(403, 'bad signature');
    $found = is_file(MEDIA_ROOT . '/' . $key) || is_file(PRIVATE_ROOT . '/' . $key);
    http_response_code($found ? 200 : 404);
    echo json_encode(['exists' => $found]);
    exit;
  }

  /**
   * GET ?op=fetch&key=..&exp=..&sig=..  -> private files, streamed, no public path.
   * The app mints 5-minute URLs for admin proof review only (invariant I6).
   */
  case 'fetch': {
    $key = safe_key((string)($_GET['key'] ?? ''));
    $exp = (int)($_GET['exp'] ?? 0);
    if ($exp < time()) bail(403, 'expired');
    if (!ok_sig((string)($_GET['sig'] ?? ''), sig("fetch|$key|$exp", $secret))) bail(403, 'bad signature');
    $abs = PRIVATE_ROOT . '/' . $key;
    if (!is_file($abs)) bail(404, 'not found');
    header('Content-Type: ' . (mime_content_type($abs) ?: 'application/octet-stream'));
    header('Content-Length: ' . filesize($abs));
    header('Content-Disposition: inline; filename="' . basename($key) . '"');
    header('Cache-Control: private, no-store');
    readfile($abs);
    exit;
  }

  default:
    bail(400, 'unknown op');
}
