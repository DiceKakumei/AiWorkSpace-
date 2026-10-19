# Claude Code デザイン強化セットアップ(リール紹介の5点)
# 実行: powershell -ExecutionPolicy Bypass -File .\setup-claude-design.ps1
param([string]$TwentyFirstApiKey = $env:TWENTYFIRST_API_KEY)

$ErrorActionPreference = "Continue"

function Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }

# 前提チェック
foreach ($c in "node","npm","git","claude") {
  if (-not (Get-Command $c -ErrorAction SilentlyContinue)) {
    Write-Host "未インストール: $c" -ForegroundColor Red; exit 1
  }
}

# 1. Taste Skill
Step "1. Taste Skill"
$skills = Join-Path $HOME ".claude\skills"
npx -y skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend" -g -y

# 2. Web Design Guidelines (Vercel)
Step "2. Web Design Guidelines"
npx -y skills add vercel-labs/agent-skills --skill web-design-guidelines -g -y

# 3. デザインシステムスキル(リールに名称なし。URLを $dsRepo に入れる)
Step "3. Design System skill"
$dsRepo = ""   # 例: https://github.com/<owner>/<repo>
if ($dsRepo) {
  $ds = Join-Path $skills "design-system"
  if (-not (Test-Path $ds)) { git clone $dsRepo $ds } else { git -C $ds pull }
} else { Write-Host "スキップ: `$dsRepo 未設定" -ForegroundColor Yellow }

# 4. 21st Dev Magic MCP
Step "4. 21st Dev MCP"
if ($TwentyFirstApiKey) {
  claude mcp add magic --scope user --env API_KEY="$TwentyFirstApiKey" -- npx -y @21st-dev/magic@latest
} else { Write-Host "スキップ: APIキー未指定 (-TwentyFirstApiKey)。21st.dev で取得" -ForegroundColor Yellow }

# 5. Playwright CLI
Step "5. Playwright CLI"
npm install -g @playwright/cli@latest
npx -y playwright install chromium

Step "完了。Claude Code を再起動してください"
