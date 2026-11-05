# Sikiプラグインの読み込み

## 対象

Sikiの汎用プラグインとしてsikineoを認識・読み込みできるようにする。neoの描画画面、5chへの投稿、通信フックは今回の対象外。

## 参照仕様

- [Siki 汎用プラグイン開発](https://sikiapp.net/plugin-development/)
- APIの参照基準はSiki 0.43.6。`needVersion`にもこの値を記載する。ただし、これはSikiによる互換性の自動判定でも、実機動作確認済みの表明でもない。

## 読み込み契約

- 配置先はSikiのPlugin Directory配下の`sikineo/`とする。
- `package.json`の`name`と`meta.name`は`sikineo`で統一する。
- `package.json`の`main`は`dist/index.js`を指す。
- TypeScriptをCommonJSにコンパイルする。実行時の外部依存は不要。
- トップレベルに`type = 'startup'`、`meta`、`mainScript(settings, tools)`を公開する。
- `meta`には名前、説明、バージョン、API参照基準の`needVersion`を含める。名前・説明・バージョンは`package.json`を参照し、二重管理しない。
- `mainScript`は、Sikiから渡されたイベントエミッターで`plugin:sikineo:ready`を引数なしで1回発火する。これを最小の起動処理とする。設定やプロファイルには書き込まず、通信しない。

## 開発と検証

1. `pnpm install`で開発依存を導入する。
2. ビルド成果物をCommonJSで読み込み、Node.jsの実イベントエミッターで起動通知を観測するテストを先に書く。
3. `pnpm build`でコンパイルし、`pnpm test`で読み込み契約を確認する。
4. `pnpm pack`の配布物を別ディレクトリへ展開し、開発環境への依存なしで同じ読み込み・起動を確認する。
5. Sikiの実機では設定のプラグイン一覧で有効化し、再起動して確認する。Node.js上の検証だけで設定画面や実機互換性を確認済みとは扱わない。

## 配置

`pnpm build`後、`package.json`と`dist/`を`sikineo/`フォルダへコピーする。開発用の`src/`、テスト、`node_modules/`は不要。`pnpm pack`で作成するアーカイブにも実行に必要なファイルを含める。

デフォルトの配置先:

- Windows: `%APPDATA%\siki\profile\plugins\sikineo\`
- macOS: `~/Library/Application Support/siki/profile/plugins/sikineo/`
- Linux: `~/.config/siki/profile/plugins/sikineo/`

Siki側でPlugin Directoryを変更している場合は、その設定を優先する。配置・コード変更後はSikiを再起動する。
