---
description: CSSデザイン規約。styles.css やUIを編集するときに参照する。
---

## 配色（CSS変数）

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

## フォント
`-apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Yu Gothic UI', sans-serif`
（Mac・Windows それぞれで最適なフォントを OS が自動選択）

## 角丸
- カード・ボタン: `8px`（`--radius-sm`）
- モーダル・大きい要素: `12px`（`--radius`）

## 影・ボーダー
- 影は使わない
- `border: 0.5px solid var(--border)` で要素を区切る

## 禁止事項
- Tailwind など外部CSSフレームワークの使用禁止
