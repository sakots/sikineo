# Sikiプラグインの読み込み

## 対象

Sikiの汎用プラグインとしてsikineoを認識・読み込みできるようにする。現在は[neo描画画面の手動起動](neo-drawing.md)も提供する。5chへの投稿と通信フックは対象外。

## 参照仕様

- [Siki 汎用プラグイン開発](https://sikiapp.net/plugin-development/)
- APIの参照基準はSiki 0.43.12。`needVersion`にもこの値を記載する。ただし、これはSikiによる互換性の自動判定でも、実機動作確認済みの表明でもない。

## 読み込み契約

- 配置先はSikiのPlugin Directory配下の`sikineo/`とする。
- `package.json`の`name`と`meta.name`は`sikineo`で統一する。
- `package.json`の`main`は`dist/index.js`を指す。
- TypeScriptをCommonJSにコンパイルする。実行時の外部依存は不要。
- トップレベルに`type = 'startup'`、`meta`、`mainScript(settings, tools)`を公開する。
- `meta`には名前、説明、バージョン、API参照基準の`needVersion`を含める。名前・説明・バージョンは`package.json`を参照し、二重管理しない。
- `mainScript`はループバックHTTPサーバーを起動し、待受完了後にSikiから渡されたイベントエミッターで`plugin:sikineo:ready`を引数なしで1回発火する。描画画面はユーザーコマンドから開く。設定やプロファイルには書き込まない。

## 開発と検証

1. `pnpm install`で開発依存を導入する。
2. 未配置時の案内とHTTPの配信境界を確認するテストを先に書く。
3. `pnpm build`でコンパイルし、`pnpm test`で読み込み契約を確認する。
4. `pnpm pack`の配布物を別ディレクトリへ展開し、開発依存なしで待受と描画画面を確認する。neo本体は配布物には含めず、別途配置する。
5. Sikiの実機では設定のプラグイン一覧で有効化し、再起動して確認する。Node.js上の検証だけで設定画面や実機互換性を確認済みとは扱わない。

## 配置

`pnpm build`後、`package.json`と`dist/`、`public/`を`sikineo/`フォルダへコピーする。neo本体は[手動起動の資料](neo-drawing.md)に従って別途配置する。開発用の`src/`、テスト、`node_modules/`は不要。`pnpm pack`で作成するアーカイブにもプラグインの実行に必要なファイルを含める。

デフォルトの配置先:

- Windows: `%APPDATA%\siki\profile\plugins\sikineo\`
- macOS: `~/Library/Application Support/siki/profile/plugins/sikineo/`
- Linux: `~/.config/siki/profile/plugins/sikineo/`

Siki側でPlugin Directoryを変更している場合は、その設定を優先する。配置・コード変更後はSikiを再起動する。
