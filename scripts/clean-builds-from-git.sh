#!/usr/bin/env bash
# Убирает builds/*.apk из индекса Git (файлы остаются на диске, .gitignore их игнорирует).
# Для полного удаления из истории используйте git filter-repo --path builds/ --invert-paths

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TRACKED="$(git ls-files 'builds/' 2>/dev/null || true)"
if [[ -z "$TRACKED" ]]; then
  echo "builds/ не отслеживается в Git — ничего делать не нужно."
  exit 0
fi

echo "Следующие файлы будут убраны из индекса Git (остаются на диске):"
echo "$TRACKED"
echo ""
read -r -p "git rm --cached -r builds/? (yes/no): " CONFIRM
if [[ "$CONFIRM" != "yes" ]]; then
  echo "Отменено."
  exit 0
fi

git rm -r --cached builds/ 2>/dev/null || git rm --cached builds/*.apk 2>/dev/null || true
echo ""
echo "Готово. Закоммитьте: git commit -m \"chore: stop tracking builds/ APK artifacts\""
echo "Если APK был в старой истории — запустите filter-repo для builds/ отдельно."
