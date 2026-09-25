# Microsoft To Do MCP

Claude Code から Microsoft To Do（個人の Microsoft アカウント）を操作する MCP サーバー。
Microsoft Graph の To Do API を使う。

## できること
| ツール | 内容 |
|---|---|
| `list_task_lists` | リスト一覧 |
| `create_task_list` | リスト作成 |
| `list_tasks` | タスク一覧（既定は未完了のみ） |
| `create_task` | タスク作成（期限・リマインダー・メモ・重要度） |
| `update_task` | タスク更新 |
| `complete_task` | 完了 / 未完了に戻す |
| `delete_task` | タスク削除 |

日時は既定で東京時間（`Tokyo Standard Time`）。

## セットアップ（初回のみ）

### 1. Azure にアプリを登録（Client ID を取得）
1. https://entra.microsoft.com → **アプリの登録** → **新規登録**
2. 名前: `Claude ToDo`
3. サポートされるアカウントの種類: **個人用 Microsoft アカウントのみ**
4. 登録後、**認証** → 「パブリック クライアント フローを許可する」を **はい** → 保存
5. **API のアクセス許可** → Microsoft Graph → 委任 → `Tasks.ReadWrite` を追加
6. **概要** の「アプリケーション (クライアント) ID」をコピー

### 2. インストールとサインイン（PowerShell）
```powershell
cd $HOME
git clone https://github.com/DiceKakumei/AiWorkSpace-.git
cd $HOME\AiWorkSpace-\mcp\microsoft-todo
npm install
$env:MS_TODO_CLIENT_ID = "<コピーしたクライアントID>"
node server.js login
```
表示された URL とコードでブラウザからサインインする（Microsoft アカウント）。
トークンは `~\.microsoft-todo-mcp\token.json` に保存され、以後は自動更新。

### 3. Claude Code に登録（全プロジェクト共通）
```powershell
cd $HOME\AiWorkSpace-\mcp\microsoft-todo
claude mcp add microsoft-todo --scope user -e MS_TODO_CLIENT_ID=<コピーしたクライアントID> -- node "$HOME\AiWorkSpace-\mcp\microsoft-todo\server.js"
```
Claude Code を再起動し `/mcp` で `microsoft-todo` が connected なら完了。

## 環境変数
| 変数 | 既定値 | 説明 |
|---|---|---|
| `MS_TODO_CLIENT_ID` | （必須） | Azure アプリのクライアント ID |
| `MS_TODO_TENANT` | `consumers` | 職場アカウントなら `organizations` |
| `MS_TODO_TIMEZONE` | `Tokyo Standard Time` | 日時のタイムゾーン |
| `MS_TODO_TOKEN_FILE` | `~/.microsoft-todo-mcp/token.json` | トークン保存先 |

## トラブル
- `Not signed in` / `Token refresh failed` → `node server.js login` をやり直す
- `AADSTS700016` → クライアント ID の誤り、またはアカウント種類が「個人用」になっていない
- `AADSTS7000218` → 手順1-4（パブリック クライアント フロー）が未設定
