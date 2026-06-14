---
description: データ構造とSupabase規約。データ操作・DB設計を扱うときに参照する。
---

## ヒアリング回答（answers）

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

## タスク1件

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

## Supabaseのテーブル構成

| テーブル | 役割 |
|---|---|
| `projects` | プロジェクト1件（event・answers） |
| `project_tasks` | タスク一覧（依存関係・編集可能項目を含む） |
| `project_done` | 完了済みタスクの記録 |

詳細は `supabase_schema.sql` を参照。

## Supabase利用規約
- 匿名認証（anon key）のみ使用する
- `service_role` キーをフロントエンドに含めない
- `.env` ファイルで接続キーを管理し、git にコミットしない
