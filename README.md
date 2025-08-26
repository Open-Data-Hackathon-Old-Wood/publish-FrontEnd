## License
This repository is published only for hackathon evaluation purposes.  
Currently, **All Rights Reserved** by the authors.

このリポジトリはハッカソン審査用に一時公開しています。  
**All Rights Reserved（再利用不可）**。審査終了後に非公開化またはアーカイブ化します。

---

## 0. 前提

- OS: macOS / Linux / Windows（WSL推奨）
- 必須ツール:
  - **Git**
  - **Node.js (v18 以降推奨)**
  - **npm**（Node.js に同梱）

---

## 1. Node.js / npm の導入

### macOS / Linux
```bash
# Homebrew を利用する場合
brew install node

# バージョン確認
node -v
npm -v
```

または、バージョン管理ツール [nvm](https://github.com/nvm-sh/nvm) を利用すると便利です。

```bash
# nvm の導入後
nvm install 18
nvm use 18
```

### Windows
- [Node.js 公式サイト](https://nodejs.org/) から LTS 版をインストール  
- インストール後に PowerShell で確認:
```powershell
node -v
npm -v
```

---

## 2. .env の作成

プロジェクトルートに `.env` を作成します。  
以下は例です（必要に応じて修正してください）。

```dotenv
# API (BackEnd)のエンドポイント
REACT_APP_API_BASE_URL=http://localhost:8000
# Backendの有無。オンにするとBackendと接続し、オフだとフロントのみで動作します。フロントのみの時はDBを使用しないので、データの書き出し読み込みは行えません
REACT_APP_USE_REAL_DB=true
```

---

## 3. 依存関係のインストール

初回のみ実行します。

```bash
npm install
```

---

## 4. 開発サーバーの起動

```bash
npm start
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開くとフロントエンドが表示されます。

---

## 5. トラブルシューティング

- **npm: command not found**
  - Node.js / npm が正しくインストールされているか確認してください
  - `node -v`, `npm -v` がエラーなく動作する必要があります

- **依存関係エラー**
  ```bash
  rm -rf node_modules package-lock.json
  npm install
  ```

- **ポート競合 (3000 が使用中)**
  - 別のアプリが既に 3000 番ポートを使用している可能性があります
  - `.env` に `PORT=3001` を追加するなどで回避できます

---
