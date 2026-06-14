# CLAUDE.md — ライフチェンジ手続きナビ

## 1. 技術スタック

- HTML / JavaScript（vanilla、フレームワークなし）
- CSSは `styles.css` に自前のCSS変数で記述（外部CSSフレームワークは使わない）
- データは localStorage に保存（サーバー・DB・外部API は使わない）
- ビルドツール・npm は使わない
- ファイルは index.html / app.js / styles.css の3枚で完結

## 2. ディレクトリ構成

```
index.html    HTMLの骨格・3画面の構造
app.js        状態管理・画面切替・タスク生成・localStorage操作
styles.css    色・余白・フォント・CSS変数定義
CLAUDE.md     開発規約（本ファイル）
spec.md       仕様書
```

## 3. コーディング規約

### 画面切替方式
- 画面は `<div id="screen-*" class="screen">` で定義する
- アクティブな画面だけ `.screen.active { display: flex; }` で表示する
- `showScreen(id)` 関数で全画面を非表示にしてから対象を active にする

### 関数の長さ
- 1関数は1つの責務のみ持つ
- 目安として50行を超えたら分割を検討する

### 変数宣言
- `const` を優先する
- 値が変わるものだけ `let` を使う
- `var` は使わない

### グローバル汚染禁止
- スクリプト全体を即時実行関数 `(function() { })()` で包む
- HTMLから呼ぶ必要がある関数だけ `window.xxx = xxx` で公開する

### コメント方針
- コメントは日本語で書く
- セクション区切りは `// ===== セクション名 =====` 形式を使う
- 「なぜそうしているか」が非自明な箇所にのみ書く。自明な処理には書かない

## 4. データ構造

### ヒアリング回答（answers）

```js
{
  kasei:    'yes' | 'no',            // 妻の改姓有無
  hikkoshi: 'yes' | 'no',            // 引っ越し有無
  kuruma:   'yes' | 'no',            // 自動車保有
  passport: 'yes' | 'no',            // 妻のパスポート保有（改姓時のみ）
  fuyou:    'yes' | 'no',            // 扶養追加有無
  banks:    'few' | 'some' | 'many'  // 口座・カード数の目安
}
```

### タスク1件

```js
{
  id:       string,    // 一意のキー（例: 'kon', 'bank_main'）
  name:     string,    // タスク名（例: '婚姻届を提出する'）
  cat:      string,    // カテゴリ（'役所' | '銀行・金融' | '保険' | '免許' | '住居' | '会社' | 'カード・通信'）
  who:      string,    // 担当（'本人' | '妻' | '二人'）
  deps:     string[],  // 先に完了すべきタスクのIDリスト
  priority: number,    // 優先度（1=高 / 2=中 / 3=低）
  note:     string,    // 補足メモ（任意）
  deadline: string,    // 期限・ISO文字列（任意）例: '2026-07-31'
  memo:     string,    // 窓口情報・持ち物など（任意）
  url:      string,    // 手続きの公式サイトURL（任意）
}
```

### localStorageの保存形式

```js
// キー: 'lifechange_v1'
{
  event:   string,    // 選択したイベント（例: 'marriage'）
  answers: object,    // ヒアリング回答
  done:    string[],  // 完了済みタスクのIDリスト
  tasks:   object[]   // タスクの配列
}
```

## 5. デザイン規約

### 配色（CSS変数）

| 変数 | 値（ライトモード） | 用途 |
|---|---|---|
| `--bg` | `#f9f8f6` | ページ背景 |
| `--surface` | `#ffffff` | カード・ヘッダー背景 |
| `--surface2` | `#f2f1ee` | メトリクス・バッジ背景 |
| `--text` | `#1a1a18` | 本文 |
| `--text2` | `#6b6b67` | 補足テキスト |
| `--text3` | `#9e9e9a` | プレースホルダー・ヒント |
| `--accent` | `#7B6FAB` | ラベンダー（チェック・進捗バー） |
| `--accent-light` | `#EEEDFE` | ホバー・バッジ背景 |
| `--accent-dark` | `#3C3489` | バッジテキスト |

ダークモードは `@media (prefers-color-scheme: dark)` で自動切替。

### フォント
`-apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Yu Gothic UI', sans-serif`
（Mac・Windows それぞれで最適なフォントを OS が自動選択）

### 角丸
- カード・ボタン: `8px`（`--radius-sm`）
- モーダル・大きい要素: `12px`（`--radius`）

### 影
- 影は使わない
- `border: 0.5px solid var(--border)` で要素を区切る

## 6. やってはいけないこと

- `npm install` などnpmコマンドの使用禁止
- webpack / vite などビルドツールの使用禁止
- Express / FastAPI などサーバーサイド処理の使用禁止
- 外部API呼び出し禁止
- Tailwind など外部CSSフレームワークの使用禁止
- `var` の使用禁止
- カレンダーなど大きな機能追加は別タスクとして切り出し、このファイルに追記する
