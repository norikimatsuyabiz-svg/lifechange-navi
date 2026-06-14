# CLAUDE.md — ライフチェンジ手続きナビ

## 技術スタック

- HTML / JavaScript（vanilla、フレームワークなし）
- CSS は `styles.css` に自前のCSS変数で記述
- データは Supabase に保存（匿名認証を使用）
- ビルドツールは Vite（`npm run dev` で開発サーバー起動）
- 環境変数は `.env` で管理（`.gitignore` 対象）
- ファイルは index.html / app.js / styles.css の3枚で完結

## ディレクトリ構成

```
index.html           HTMLの骨格・3画面の構造
app.js               状態管理・画面切替・タスク生成・Supabase操作
styles.css           色・余白・フォント・CSS変数定義
supabase_schema.sql  Supabaseテーブル定義・RLSポリシー
.env                 Supabase接続キー（gitignore対象）
CLAUDE.md            開発規約（本ファイル）
spec.md              仕様書
.claude/rules/       詳細ルール集（下記参照）
```

## 詳細ルール

詳細は `.claude/rules/` の各ファイルを参照すること。

| ファイル | 内容 |
|---|---|
| [code-style.md](.claude/rules/code-style.md) | JS規約・画面切替・関数設計・コメント方針 |
| [design.md](.claude/rules/design.md) | CSS変数・配色・フォント・角丸・影 |
| [data.md](.claude/rules/data.md) | データ構造・Supabaseテーブル・接続規約 |
