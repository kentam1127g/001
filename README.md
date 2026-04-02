# えんぴつだいあろーぐ。— フロントエンド

日本語の日記・記録共有アプリのフロントエンドリポジトリ。  
GitHub Pages でホストされ、Decap CMS で記事を管理する。

**公開URL:** `https://kentam1127g.github.io/001/`

---

## ディレクトリ構成

```
001/
├── index.html          ← アプリのエントリーポイント
├── admin/
│   ├── index.html      ← Decap CMS 管理画面（カスタマイズ済み）
│   └── config.yml      ← Decap CMS 設定
├── content/
│   └── posts/
│       ├── index.json              ← 全投稿のコンパイル済みインデックス（自動生成）
│       └── YYYY-MM-DD-HH-MM-SS.json ← 個別投稿ファイル
├── css/
│   ├── base.css
│   ├── clock.css
│   ├── cms.css
│   ├── entries.css
│   ├── loader.css
│   └── modal.css
├── js/
│   ├── main.js         ← 初期化・新着/すれ違い検知
│   ├── state.js        ← アプリ全体の共有状態
│   ├── config.js       ← 定数・APIエンドポイント
│   ├── data.js         ← データ取得・既読管理・API呼び出し
│   ├── render.js       ← DOM生成・IntersectionObserver・カウント表示
│   ├── scroll.js       ← ページネーション
│   ├── modals.js       ← モーダル開閉
│   ├── ticker.js       ← 時計・タイムスタンプ更新
│   ├── utils.js        ← 汎用ユーティリティ
│   └── cms.js          ← 管理者向けCMS連携UI
├── images/
│   └── uploads/        ← CMS からアップロードされた画像
└── scripts/
    ├── generate-post-index.mjs ← index.json 自動生成スクリプト
    └── optimize-images.mjs     ← 画像最適化スクリプト
```

---

## 投稿データ構造

個別投稿ファイル（`content/posts/YYYY-MM-DD-HH-MM-SS.json`）のフィールド：

```json
{
  "id": "2026-04-02-14-04-43",
  "author": "まつけん",
  "text": "本文",
  "image": "/images/uploads/xxx.jpg",
  "date": "2026-04-02",
  "createdAt": "2026-04-02T14:04:43+09:00",
  "viewCount": 0
}
```

> `viewCount` はCMSフィールドとして存在するが、**実際の閲覧数はバックエンド（Netlify Blobs）が正値**。このフィールドは参照しない。

---

## JavaScriptの動作概要

### 初期化フロー（`main.js`）

1. URLハッシュ（`#entry-{id}`）を解析してディープリンク対応
2. `content/posts/index.json` を取得して全投稿をロード
3. バックエンドAPIから閲覧数・最終閲覧日時を取得（`data.js`）
4. 前回訪問時との比較で「新着投稿」を検知 → モーダル表示
5. 他の閲覧者が5分以内に閲覧していた場合「読者とすれ違いました」モーダル表示

### 閲覧数カウント（`render.js`）

IntersectionObserver により以下の条件でカウント：

- 投稿が **60%以上** 表示されている
- その状態が **1.8秒以上** 継続する

条件を満たすとバックエンドAPIの `/counts/bump` を呼び出し、LocalStorage の閲覧済みリストに追加して二重カウントを防止する。

### ローカルストレージキー

| キー | 用途 |
|---|---|
| `quiet-broadcast-seen-entries-v1` | 閲覧済みエントリIDの配列（二重カウント防止） |
| `enpitu-last-latest-id` | 前回訪問時の最新投稿ID（新着検知用） |
| `enpitu-last-read-id` | 最後に閲覧したエントリID |

### 最終閲覧日時の表示フォーマット

| 経過時間 | 表示テキスト |
|---|---|
| 5分未満 | 最終表示：たった今 |
| 31分未満 | 最終表示：ちょっと前 |
| 60分未満 | 最終表示：30分くらい前 |
| 24時間未満 | 最終表示：Xh時間前 |
| 24時間以上 | 最終表示：X日前 |

---

## Decap CMS 管理画面（`admin/`）

### 認証

GitHub OAuth を使用。認証サーバーは別リポジトリ（`oath/`）が担当。

- **認証ベースURL:** `https://enpitumark-oath.netlify.app`

### 自動フィールド付与（`preSave` フック）

記事保存時に以下を自動設定：

| フィールド | 設定値 |
|---|---|
| `author` | GitHubログイン名から自動取得（`AUTHOR_MAP` で日本語名に変換） |
| `createdAt` | 保存時の現在時刻（JST: `Asia/Tokyo`） |
| `date` | `createdAt` から自動導出 |

### AUTHOR_MAP（ログイン名 → 表示名）

| GitHubログイン | 表示名 |
|---|---|
| `kentam1127g` | まつけん |
| `wakako38-dev` | わかこ |

---

## デプロイ

GitHub Actions により自動デプロイ：

1. Decap CMS で記事を保存 → GitHub にコミット
2. `scripts/generate-post-index.mjs` が `content/posts/index.json` を再生成
3. GitHub Pages へデプロイ

---

## 依存関係

| パッケージ | 用途 |
|---|---|
| `sharp` | 画像最適化（`scripts/optimize-images.mjs`） |
