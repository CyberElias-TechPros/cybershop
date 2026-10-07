#!/usr/bin/env bash
#
# Dump the CyberShop D1 database.
#
#   ./scripts/backup-d1.sh            # the live (remote) database
#   ./scripts/backup-d1.sh --local    # the local dev database
#
# Dumps land in ./backups/ as cybershop-<utc timestamp>.sql and are pruned to
# the newest 30. Add to cron for a daily dump:
#
#   17 3 * * *  cd /path/to/cybershop && ./scripts/backup-d1.sh >> backups/cron.log 2>&1
#
# A dump on the same machine as the database is a copy, not a backup — rsync or
# upload backups/ somewhere else too.
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET=remote
[ "${1:-}" = "--local" ] && TARGET=local

DB=cybershop
DIR=backups
KEEP=30
mkdir -p "$DIR"

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="$DIR/$DB-$TARGET-$STAMP.sql"

echo "→ dumping $DB ($TARGET) → $OUT"
( cd worker && npx wrangler d1 export "$DB" $([ "$TARGET" = remote ] && echo --remote || echo --local) --output "../$OUT" ) 

if [ ! -s "$OUT" ]; then
  echo "error: dump is empty — refusing to count that as a backup" >&2
  rm -f "$OUT"
  exit 1
fi

gzip -f "$OUT"
echo "✓ $(du -h "$OUT.gz" | cut -f1)  $OUT.gz"

# prune old dumps (keep the newest $KEEP, including the one just written)
ls -1t "$DIR"/"$DB"-"$TARGET"-*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r f; do
  rm -f "$f"
  echo "   pruned $(basename "$f")"
done
