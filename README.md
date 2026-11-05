# sikineo

sikineoは、汎用掲示板ブラウザsikiで5chのお絵かき機能にneoを使うためのプラグインです。

## 現在の機能

- Sikiの汎用`startup`プラグインとして読み込めます。
- 起動時に`plugin:sikineo:ready`イベントを1回発火します。
- neoの描画画面・5chへの投稿は未実装です。

API参照基準はSiki **0.43.6**です。CommonJSでの読み込みと起動通知をNode.js上で検証しています。Siki実機での設定画面・起動確認は未実施です。

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
2. SikiのPlugin Directory配下に`sikineo/`を作り、`package.json`と`dist/`をコピーします。実行時の依存パッケージはありません。
3. Sikiの設定のプラグイン一覧で`sikineo`を有効化し、Sikiを再起動します。

```text
plugins/
└─ sikineo/
   ├─ package.json
   └─ dist/
      └─ index.js
```

配布アーカイブは`pnpm pack`で作成できます。アーカイブ内の`package/`の内容を上記の`sikineo/`へ配置してください。フォルダ名は`sikineo`に揃えます。

配置先のOS別パスと読み込み契約は[実装資料](docs/plugin-loading.md)、ホスト側の仕様は[Siki公式資料](https://sikiapp.net/plugin-development/)を参照してください。

## 更新履歴

### [2026/11/05] v0.1.0

- Sikiの汎用プラグインとして読み込むため、TypeScript製の起動処理とCommonJSビルドの機能を追加。
- 読み込み時の問題を検出するため、起動通知のテストと配布物の検証手順を追加。

### [2026/11/05] v0.0.0

- リポジトリ生やした
