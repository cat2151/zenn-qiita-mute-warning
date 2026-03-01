# Zenn/Qiita Mute Warning

ZennやQiitaでミュートしたユーザーの記事を開いたとき、画面上部に警告バナーを表示するChrome拡張です。

ZennはミュートしたユーザーをTLから非表示にしてくれますが、記事URLを直接踏んだ場合はそのまま表示されてしまいます。Qiitaも同様にミュートユーザーの記事が開けてしまうため、この拡張で気付けるようにします。

## 動作イメージ

ミュートしたユーザーの記事を開くと、以下のような警告バナーが表示されます。

- **「← 戻る」**: 直前のページに戻る
- **「このまま読む」**: バナーを閉じて記事を読み続ける

## 対応ページ

- 通常の記事ページ（`/username/articles/slug`）
- Publication（組織）経由の記事ページ（URLはOrg slugだが、実際の著者を正しく検出）
- 本ページ（`/username/books/slug`）
- Qiitaの記事ページ（`/username/items/slug`）
- SPA遷移（ページ内リンクからの遷移も検出）

## Debugモード

拡張機能のオプションページに「Debug Mode」トグルがあります。ONにするとconsoleへのデバッグログが有効になります。デフォルトはOFFなので、問題調査時だけONにしてください。

## 仕組み

Zennは公式API `GET /api/me/mutes` でミュートリストを取得し、`chrome.storage.local` に24時間キャッシュします。QiitaはGraphQL `GetMutingUsers` をcontent scriptから呼び出し（CSRFトークンを利用）、同様にローカルにだけ保持します。外部サーバーへのデータ送信は一切ありません。

## インストール（開発者モード）

Chrome Web Storeには未公開のため、手動でのインストールが必要です。

**1. リポジトリをクローン**

```bash
git clone https://github.com/YOUR_USERNAME/zenn-mute-warning.git
```

**2. Chromeの拡張機能ページを開く**

アドレスバーに以下を入力します。

```
chrome://extensions
```

**3. デベロッパーモードを有効化**

右上のトグル「デベロッパーモード」をONにします。

**4. 拡張機能を読み込む**

「パッケージ化されていない拡張機能を読み込む」をクリックし、クローンした `zenn-mute-warning` フォルダを選択します。

**5. Zennにログイン**

Zennにログインした状態でご利用ください。未ログイン時はミュートリストを取得できないため、バナーは表示されません。

## ミュートリストの更新

ミュートリストは初回アクセス時に自動取得され、以降24時間キャッシュされます。即時更新したい場合は `chrome://extensions` から拡張機能を一度「更新」してください。

## ファイル構成

```
zenn-mute-warning/
├── manifest.json   # 拡張機能の設定
├── background.js   # ミュートリストの取得・キャッシュ
├── content.js      # 著者検出・警告バナー表示
└── README.md
```

## 注意事項

- ZennのAPIの仕様変更により動作しなくなる可能性があります
- Chrome Web Store未公開のため、Chromeのアップデート時に拡張機能が無効化される場合があります
- 本拡張はPoCです。動作の保証はありません

## License

MIT
