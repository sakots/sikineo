# sikineo

sikineoは、汎用掲示板ブラウザsikiで5chのお絵かき機能にneoを使うためのプラグインです。

## 現在の機能

- Sikiのユーザーコマンドからneo描画画面を開き、300×300ピクセルの絵を描けます。起動時に描画画面は開きません。
- プラグイン起動時に`127.0.0.1:57830`で描画ページを提供し、待受完了後に`plugin:sikineo:ready`を1回発火します。
- neo本体は別途配置します。取得元は利用者指定の[neo.js](https://oekakibbs.moe/apps/neo/neo.js)と[neo.css](https://oekakibbs.moe/apps/neo/neo.css)です。描画時の外部ネットワーク接続は不要です。
- 5chへの投稿・画像の書き出しは対象外です。

Siki **0.43.12**の公式Linux版を隔離プロファイル・ヘッドレス環境で起動し、プラグイン読み込み、コマンドパレットからの起動、描画・Undo/Redoを確認しました。neoは確認時点で**1.8.12**です。通常のデスクトップ環境、Windows・macOSでは未検証です。

## 開発

TypeScriptとpnpmを使用します。検証環境はNode.js 26.12.1、pnpm 12.15.0です。

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

`pnpm test`でもビルドを実行します。成果物は`dist/index.js`です。

## Sikiへの配置

1. `pnpm build`を実行します。
2. SikiのPlugin Directory配下に`sikineo/`を作り、`package.json`と`dist/`、`public/`をコピーします。実行時の依存パッケージはありません。
3. 指定配布元の`neo.js`と`neo.css`を取得し、`sikineo/neo/`へ配置します。本体はGit・配布物に含めません。
4. Sikiの設定のプラグイン一覧で`sikineo`を有効化し、Sikiを再起動します。

```text
plugins/
└─ sikineo/
   ├─ package.json
   ├─ dist/
   ├─ public/
   └─ neo/
      ├─ neo.js
      └─ neo.css
```

配布アーカイブは`pnpm pack`で作成できます。アーカイブ内の`package/`の内容を上記の`sikineo/`へ配置してください。フォルダ名は`sikineo`に揃えます。

## 描画画面を開く

Sikiの設定の「ユーザーコマンド」で以下を追加します。

| 項目 | 値 |
| --- | --- |
| 名前 | `sikineo.open` |
| 表示名 | `neoで描く` |
| 実行コマンド | `uri:open-browserview` |
| 第1パラメータ | `http://127.0.0.1:57830/` |

コマンドパレット（標準では`Ctrl+Shift+P`）から「neoで描く」（`user:sikineo.open`）を実行します。neo本体が未配置なら配置案内を表示します。

ポート57830が使用中なら待受は失敗します。neoの一時保存は確実な保存を保証しません。同じURLを複数画面で開くと保存領域が共有されるため、描画画面は1つにしてください。

取得先・配置・制約・検証結果は[neo描画画面の資料](docs/neo-drawing.md)を参照してください。

配置先のOS別パスと読み込み契約は[実装資料](docs/plugin-loading.md)、ホスト側の仕様は[Siki公式資料](https://sikiapp.net/plugin-development/)を参照してください。

## 更新履歴

### [2026/11/05] v0.2.0

- Sikiから手動で描画画面を開くため、ループバックHTTP配信とneo描画画面の機能を追加。
- neo本体を別途配置して利用するため、指定配布元の`neo.js`・`neo.css`の配置案内を追加。
- 描画専用であることを明確にするため、投稿操作を無効化し、保存上の制約を表示するよう修正。
- 想定外のファイル配信を防ぐため、HTTPの配信境界のテストを追加。

### [2026/11/05] v0.1.0

- Sikiの汎用プラグインとして読み込むため、TypeScript製の起動処理とCommonJSビルドの機能を追加。
- 読み込み時の問題を検出するため、起動通知のテストと配布物の検証手順を追加。

### [2026/11/05] v0.0.0

- リポジトリ生やした
