# /new-screen — 新しい画面を追加する

このプロジェクトは画面を `<div id="screen-*" class="screen">` で管理している。
新しい画面を追加するときは以下の手順で行う。

## 手順

1. `.claude/rules/code-style.md` の画面切替方式を確認する
2. `index.html` を読み、既存の画面構造（`screen-*`）を把握する
3. `app.js` を読み、`showScreen()` 関数と画面遷移ロジックを把握する
4. `styles.css` を読み、`.screen` と `.screen.active` のスタイルを確認する
5. 以下を追加する：
   - `index.html` に `<div id="screen-[名前]" class="screen">` を追加
   - `app.js` に必要な初期化処理・イベントリスナーを追加
   - `styles.css` に画面固有のスタイルを追加（CSS変数を使うこと）
6. 既存の画面遷移フローに新画面への導線・戻り先を組み込む

## 追加する画面の情報

$ARGUMENTS
