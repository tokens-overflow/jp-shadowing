#!/bin/bash
# 每日一课：抓取 → 改写 → 合成 → 索引 → push
set -euo pipefail
cd "$(dirname "$0")/.."
# nvm の node を優先（/usr/local/bin の古い node を掴まないように）
NVM_NODE=$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -1)
export PATH="${NVM_NODE:-}:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
echo "  node $(node -v) / python $("$PWD/.venv/bin/python" -V 2>&1 | cut -d' ' -f2) (venv)"

DATE="${1:-$(date +%F)}"
DOW=$(date -j -f %F "$DATE" +%u 2>/dev/null || date -d "$DATE" +%u)
[ "$DOW" -ge 6 ] && [ -z "${FORCE:-}" ] && { echo "週末はスキップ（FORCE=1 で強制）"; exit 0; }
[ -f "content/$DATE/lesson.json" ] && { echo "$DATE は既にあります"; exit 0; }

case "$DOW" in 1|3|5) TYPE=news;; *) TYPE=deep;; esac
echo "▶ $DATE ($TYPE)"

echo "① 記事を取得"
node tools/fetch.mjs "$TYPE" > /tmp/sh_article.json

echo "② 口語稿に書き換え"
node tools/build.mjs "$DATE" < /tmp/sh_article.json > /dev/null

echo "③ 音声合成"
"$PWD/.venv/bin/python" tools/tts.py "content/$DATE"

echo "④ 索引更新"
node tools/reindex.mjs

# 90日より古い教材は削除（リポジトリを軽く保つ）
find content -maxdepth 1 -type d -name '20*-*-*' -mtime +90 -exec rm -rf {} + 2>/dev/null || true
node tools/reindex.mjs > /dev/null

echo "⑤ push"
git add -A
git commit -q -m "教材 $DATE: $(node -p "require('./content/$DATE/lesson.json').title")" || true
git push -q origin main 2>/dev/null || git push -q origin master 2>/dev/null || echo "  (push スキップ)"
echo "✓ 完了"
