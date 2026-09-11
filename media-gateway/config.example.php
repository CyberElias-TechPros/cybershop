<?php
/**
 * Media Gateway config — copy to config.php and adjust.
 * config.php is git-ignored (contains the shared secret).
 *
 * Production (cPanel) layout — deploy the media-gateway files in the
 * media subdomain's document root, e.g. /home/USERNAME/public_html:
 *   public_html/upload.php        <- this gateway
 *   public_html/.htaccess         <- from media-gateway/.htaccess
 *   public_html/media/…           <- uploaded files, served as /media/…
 *   public_html/media/.htaccess   <- from media-htaccess.txt (denies scripts)
 *
 * PHP ini requirements (cPanel: "MultiPHP INI Editor" or php.ini):
 *   upload_max_filesize = 10M
 *   post_max_size       = 12M
 * Requires PHP 8.0+ (uses match / strict types). GD is optional
 * (without it, EXIF stripping is skipped and dimensions are still reported).
 */

// Must match the Worker's GATEWAY_SECRET (same value, both sides).
const GATEWAY_SECRET = 'change-me-shared-secret-at-least-32-chars';

// Absolute path of the directory that becomes /media/… in URLs.
// With the layout above (docroot == this directory) __DIR__ is correct:
// files land in <docroot>/media/vendors/{id}/… and serve at /media/…
const MEDIA_ROOT = __DIR__;

// Hard upload cap regardless of token (defense in depth).
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
