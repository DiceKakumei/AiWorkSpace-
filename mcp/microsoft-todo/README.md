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
Azure のアプリ登録は不要（Microsoft 公開の「Microsoft Graph Command Line Tools」クライアントでサインインする）。

### 1. インストールとサインイン（PowerShell）
```powershell
cd $HOME
git clone https://github.com/DiceKakumei/AiWorkSpace-.git
cd $HOME\AiWorkSpace-\mcp\microsoft-todo
npm install
node server.js login
```
表示された URL とコードでブラウザからサインインし、To Do へのアクセスを許可する。
トークンは `~\.microsoft-todo-mcp\token.json` に保存され、以後は自動更新。

### 2. Claude Code に登録（全プロジェクト共通）
```powershell
cd $HOME\AiWorkSpace-\mcp\microsoft-todo
claude mcp add microsoft-todo --scope user -- node "$HOME\AiWorkSpace-\mcp\microsoft-todo\server.js"
```
Claude Code を再起動し `/mcp` で `microsoft-todo` が connected なら完了。

### （任意）自前の Azure アプリを使う場合
Azure テナントがある場合のみ。アプリ登録（個人用 Microsoft アカウント対応、パブリック クライアント フロー許可、委任 `Tasks.ReadWrite`）後、`MS_TODO_CLIENT_ID` にクライアント ID を設定する。

## 環境変数
| 変数 | 既定値 | 説明 |
|---|---|---|
| `MS_TODO_CLIENT_ID` | Graph Command Line Tools | 自前 Azure アプリのクライアント ID（任意） |
| `MS_TODO_TENANT` | `consumers` | 職場アカウントなら `organizations` |
| `MS_TODO_TIMEZONE` | `Tokyo Standard Time` | 日時のタイムゾーン |
| `MS_TODO_TOKEN_FILE` | `~/.microsoft-todo-mcp/token.json` | トークン保存先 |

## トラブル
- `Not signed in` / `Token refresh failed` → `node server.js login` をやり直す
- `AADSTS50020`（Azure ポータルに入れない）→ 個人アカウントは Azure テナント未所属のため。本手順ではポータル不要
