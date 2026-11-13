# Webflow管理画面日本語化 Chrome拡張機能

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-インストール-brightgreen)](https://chromewebstore.google.com/detail/webflow-日本語化/efenpjcceehojemnphkinocffloghhon)
![Version](https://img.shields.io/badge/version-1.1.0-blue)
![Translations](https://img.shields.io/badge/翻訳用語数-2,494件-orange)

## 概要

Webflowの管理画面（Designer/Editor等）の英語UIを、CSVで管理する用語集に基づき日本語化するChrome拡張機能です。

- 英語UIテキストを用語集に基づいて日本語へ自動置換（Dashboard・Designer・CMS・サイト設定）
- 大文字小文字・空白の違い、末尾の「:」「…」「*」やショートカット表記「(V)」を吸収して訳す
- 「5 instances」「Edited 20 minutes ago」など数字入りの定型文もパターンで翻訳
- 入力欄のヒント（placeholder）とホバー説明（title）も翻訳
- クラス名・ページ名・コンポーネント名・コレクション名などユーザーが付けた名前は翻訳しない
- 用語集（CSV）は自由に編集・拡張可能
- オプションページで用語集一覧・部分置換プレビューが可能
- **ポップアップUIで翻訳のON/OFF切り替えが可能**

## スクリーンショット

| Designer画面 | Dashboard画面 |
|:---:|:---:|
| ![Designer](store-assets/screenshot-1.png) | ![Dashboard](store-assets/screenshot-2.png) |

## インストール方法

### Chrome Web Store（推奨）

[Chrome Web Storeからインストール](https://chromewebstore.google.com/detail/webflow-日本語化/efenpjcceehojemnphkinocffloghhon)

### 開発者向け（手動インストール）

1. このリポジトリをダウンロードまたはクローンします。
2. Chromeの `chrome://extensions/` を開き、「デベロッパーモード」をONにします。
3. 「パッケージ化されていない拡張機能を読み込む」から本フォルダ（webflow-ja-extension）を選択します。
4. Webflowの管理画面を開き、日本語化が反映されているかご確認ください。

## 使い方

- Webflowの管理画面（*.webflow.com）にアクセスすると、自動で日本語化が適用されます。
- **ポップアップUI**: ツールバーの拡張機能アイコンをクリックすると、翻訳のON/OFFを切り替えられます。OFFにするとリロードなしで英語に戻ります。
- オプションページ（拡張機能の「詳細」→「オプション」）で、用語集の一覧や部分置換プレビューが利用できます。

## 翻訳用語集（CSV）の更新方法

- `translation_terms.csv` を直接編集し、英語-日本語のペアを追加・修正してください。
- 英文にカンマを含む場合は `"..."` で囲みます（例: `"If populated, this will be added to all of your pages.",入力すると…`）。
- 数字や名前が入る定型文はプレースホルダーで書けます。
  - `{n}` `{n2}` …: 数値（例: `{n} instances,{n}個のインスタンス`）
  - `{x}`: 辞書で訳せる語句、または日付・時刻など数字を含む値（例: `Edited {x},{x}に編集` → 「20分前に編集」）
  - `{s}`: 任意の文字列をそのまま埋め込む（例: `Upgrade to {s},{s}にアップグレード`）
- 編集後は `python3 scripts/check_dict.py` で構文エラー・重複・訳の矛盾がないか確認してください。
- 編集後、拡張機能を「再読み込み」すると新しい翻訳が反映されます。
- Googleスプレッドシート等で管理→CSVエクスポート→上書きも可能です。

## 開発者向け情報

### GitHub Actions自動デプロイ

このリポジトリはGitHub Actionsを使用して、タグをプッシュすると自動的にChrome Web Storeへ公開されます。

#### 設定手順

1. **Google Cloud Console設定**
   - [Google Cloud Console](https://console.cloud.google.com/)でプロジェクトを作成
   - Chrome Web Store APIを有効化
   - OAuth 2.0クライアントIDを作成（デスクトップアプリ）

2. **Refresh Token取得**

   以下のURLにアクセスしてauthorization codeを取得:
   ```
   https://accounts.google.com/o/oauth2/auth?response_type=code&scope=https://www.googleapis.com/auth/chromewebstore&client_id=YOUR_CLIENT_ID&redirect_uri=urn:ietf:wg:oauth:2.0:oob
   ```

   codeを使ってRefresh Tokenを取得:
   ```bash
   curl -X POST https://oauth2.googleapis.com/token \
     -d code=YOUR_AUTH_CODE \
     -d client_id=YOUR_CLIENT_ID \
     -d client_secret=YOUR_CLIENT_SECRET \
     -d redirect_uri=urn:ietf:wg:oauth:2.0:oob \
     -d grant_type=authorization_code
   ```

3. **GitHub Secrets設定**

   リポジトリのSettings → Secrets and variables → Actionsで以下を設定:
   - `CHROME_EXTENSION_ID`: `efenpjcceehojemnphkinocffloghhon`
   - `CHROME_CLIENT_ID`: Google CloudのClient ID
   - `CHROME_CLIENT_SECRET`: Google CloudのClient Secret
   - `CHROME_REFRESH_TOKEN`: 取得したRefresh Token

4. **デプロイ実行**
   ```bash
   git tag v1.1.0
   git push origin v1.1.0
   ```

   タグと `manifest.json` の version が一致しない場合、CI は公開せずに失敗します。

### テスト・ビルド

```bash
python3 scripts/check_dict.py      # 用語集のチェック
node --test tests/*.test.js        # 翻訳エンジンのテスト
bash scripts/build.sh              # dist/webflow-ja-extension.zip を作成（手動アップロード用）
```

### ディレクトリ構成

```
webflow-ja-extension/
├── manifest.json          # 拡張機能マニフェスト
├── content.js             # 翻訳エンジン
├── translation_terms.csv  # 翻訳用語集（2,494件）
├── options.html/js        # オプションページ
├── popup.html/js/css      # ポップアップUI
├── utils.js               # CSVパース・翻訳エンジン
├── icon16/48/128.png      # 拡張機能アイコン
├── scripts/               # 用語集チェック・ZIPビルド
├── tests/                 # 翻訳エンジンのテスト
└── store-assets/          # Chrome Web Store用画像
```

## 変更履歴

### v1.1.0（2026-11-13）

- 用語集を 2,494 件に拡充（Booost サイトの Dashboard・サイト設定・Designer・CMS を巡回して未翻訳を収集）
- CSV の壊れていた 20 行（英文中のカンマ）を修正。重複 167 件を整理し、訳の矛盾を解消
- 翻訳エンジンを Map 化して高速化。大文字小文字・空白・末尾記号・ショートカット表記を吸収
- 数字入りの定型文のパターン翻訳、placeholder / title 属性の翻訳に対応
- OFF にしたときリロードなしで英語に戻るように変更
- 分割テキストの書き換えを React 管理のノードを壊さない方式に変更
- SPA の画面遷移検知を修正（content script からは history のフックが効かなかったため）
- ページ名・CMS コレクション名・変数コレクション名・クラス名トークンを翻訳対象外に追加
- 自動公開の ZIP にポップアップが入っていなかった問題を修正。辞書チェック・テスト・版数チェックを CI に追加

## ライセンス

MIT License
