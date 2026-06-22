#!/usr/bin/env bash
# Удаляет .env из всей истории Git и force-push в origin.
# ВНИМАНИЕ: переписывает историю — все, кто клонировал репозиторий, должны сделать fresh clone или reset.
#
# Требования: git, git-filter-repo (pip install git-filter-repo)
# Использование: ./scripts/clean-env-history.sh [branch]
# По умолчанию branch=master

set -euo pipefail

BRANCH="${1:-master}"
REPO_URL="$(git remote get-url origin 2>/dev/null || true)"
WORK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/pvz-filter-repo.XXXXXX")"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

if ! command -v git-filter-repo >/dev/null 2>&1; then
  echo "Ошибка: git-filter-repo не найден."
  echo "Установите: pip install git-filter-repo"
  exit 1
fi

if [[ -z "$REPO_URL" ]]; then
  echo "Ошибка: remote origin не настроен."
  exit 1
fi

echo "=============================================="
echo " Очистка .env из истории Git"
echo "=============================================="
echo " Remote:  $REPO_URL"
echo " Branch:  $BRANCH"
echo " Temp:    $TMP_DIR"
echo ""
echo "ВНИМАНИЕ: будет выполнен git push --force. Убедитесь, что:"
echo "  - все секреты из .env ротированы (новые ключи в Supabase/EAS);"
echo "  - команда предупреждена о переписывании истории."
echo ""
read -r -p "Продолжить? (yes/no): " CONFIRM
if [[ "$CONFIRM" != "yes" ]]; then
  echo "Отменено."
  exit 0
fi

echo ""
echo "[1/4] Клонирование во временную папку..."
git clone --branch "$BRANCH" "$REPO_URL" "$TMP_DIR/repo"
cd "$TMP_DIR/repo"

if ! git rev-list --all -- ".env" | grep -q .; then
  echo "Файл .env не найден в истории — очистка не требуется."
  exit 0
fi

echo "[2/4] git filter-repo --path .env --invert-paths ..."
git filter-repo --path .env --invert-paths --force

echo "[3/4] Проверка: .env в истории после фильтра..."
if git rev-list --all -- ".env" | grep -q .; then
  echo "Ошибка: .env всё ещё присутствует в истории."
  exit 1
fi
echo "OK: .env удалён из истории."

echo "[4/4] git push origin ${BRANCH} --force"
read -r -p "Выполнить force push? (yes/no): " PUSH_CONFIRM
if [[ "$PUSH_CONFIRM" != "yes" ]]; then
  echo "История переписана локально в: $TMP_DIR/repo"
  echo "Для push вручную: cd $TMP_DIR/repo && git push origin $BRANCH --force"
  trap - EXIT
  exit 0
fi

git push origin "$BRANCH" --force

echo ""
echo "Готово. Локальный клон в $WORK_ROOT не изменён."
echo "Рекомендуется: git fetch origin && git reset --hard origin/$BRANCH"
