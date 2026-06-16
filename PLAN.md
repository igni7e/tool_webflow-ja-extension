# Webflow日本語化拡張機能 - 実装計画

## プロジェクト概要

Webflowの管理画面（Dashboard、Designer、Editor、CMS、Eコマースなど）に日本語翻訳を適用するChrome拡張機能。

## 目標

- ✅ Webflowの管理画面全般（Dashboard、Designer、Editor、CMS、Eコマースなど）に翻訳を適用
- ✅ 公開サイト（.webflow.io やカスタムドメイン）には翻訳を適用しない
- ✅ パスベース + サブドメインベースのURL判定で対象ページを正確に識別
- ✅ Webflowのアップデートにも対応できる堅牢な実装
- ✅ パフォーマンスを考慮した効率的な翻訳処理

## 現状の課題

### 1. 基本的な動作の問題
- [x] `manifest.json` で `utils.js` が読み込まれていない → 修正済み（`utils.js` → `content.js` の順）
- [x] `options.html` で `utils.js` が読み込まれていない → 修正済み（`utils.js` → `options.js` の順）
- [x] `parseTranslationCSV` 関数が利用できない状態 → 修正済み（上記読み込み順の修正で解消）

### 2. URL判定の問題
- [x] `*.webflow.com/*` に全て適用されている → 実装側で管理画面関連のみ動作するようゲート追加
- [x] `https://webflow.com/*`（サブドメイン無し）には現状マッチしない可能性 → `host_permissions` / `matches` に `https://webflow.com/*` を追加
- [x] 管理画面“関連”に限定する必要 → `content.js` の `isWebflowAdminUI()` で限定（Dashboard / Designer / Editor / CMS / Eコマース / Memberships / Preview）

### 3. パフォーマンス・堅牢性の問題
- [x] 辞書のループ処理が非効率 → 最適化（長いキー優先のペア配列で置換）
- [x] 重複翻訳の防止機能がない → 対応（ノードキャッシュ/最終値キャッシュ + 日本語を含む場合はスキップ）
- [x] デバッグ機能がない → 対応（デバッグONで未翻訳候補を統計に記録）
- [x] エラーハンドリングが不十分 → 最低限のガード/try-catch追加（storage読み書き等）

### 4. 翻訳マッピング保持の問題
- [x] `nodeValue` を直接置換しているため、元の英語テキストが失われる → デバッグ用にノードの元テキストをWeakMapで保持
- [x] 英語→日本語のマッピングを記録していない → 用語単位（CSVキー単位）の統計として記録
- [x] どの英語テキストがどの日本語に翻訳されたかの履歴がない → `chrome.storage.local` に累積保存
- [x] デバッグや翻訳の確認が困難 → オプションで統計表示 + CSV出力
- [x] 新しい翻訳用語を発見しにくい → 未翻訳候補（`__untranslated__:`）を別枠で収集/表示/CSV出力
- [x] 翻訳統計を取れない → 対応（回数を累積保存）

## 実装計画

### Phase 1: 基本動作の修正（最優先）

#### 1.1 `manifest.json` の修正
- [x] `content_scripts` に `utils.js` を追加
- [x] 読み込み順序を `["utils.js", "content.js"]` に設定
- [x] `matches` / `host_permissions` に `https://webflow.com/*` も含める

#### 1.2 `options.html` の修正
- [x] `utils.js` を `options.js` の前に読み込むように追加

#### 1.3 動作確認
- [x] 拡張機能を再読み込みして動作確認
- [x] オプションページで用語集が表示されるか確認
- [x] プレビュー機能が動作するか確認

### Phase 2: URL判定機能の実装

#### 2.1 WebflowのURL構造の調査
- [ ] 管理画面（Dashboard）のURLパターンを確認
  - 例: `https://webflow.com/dashboard/*`
  - 例: `https://*.webflow.com/dashboard/*`
- [ ] デザイナー画面（Designer）のURLパターンを確認
  - 例: `https://webflow.com/design/*`
  - 例: `https://*.webflow.com/design/*`
- [ ] エディター（Editor）のURLパターンを確認
  - 例: `https://webflow.com/editor/*`
- [ ] プレビュー画面のURLパターンを確認
  - 例: `https://preview.webflow.com/*`
- [ ] 公開サイトのURLパターンを確認
  - 例: `https://*.webflow.io/*`
  - 例: カスタムドメイン

#### 2.2 URL判定関数の実装
- [x] `isWebflowAdminUI()` 関数を作成（管理画面全般を意味する）
- [x] 管理画面のパスを判定
  - `/dashboard/*`
  - `/sites/*`
  - `/account/*`
  - `/settings/*`
- [x] デザイナー画面のパスを判定
  - `/design/*`
  - `/designer/*`
- [x] エディター画面のパスを判定
  - `/editor/*`
- [x] CMS管理画面のパスを判定
  - `/cms/*`
- [x] Eコマース管理画面のパスを判定
  - `/ecommerce/*`
- [x] メンバーシップ管理画面のパスを判定
  - `/memberships/*`
- [x] サブドメインベースの判定
  - `preview.webflow.com` → プレビュー画面（対象）
  - その他の `*.webflow.com` サブドメインも確認
- [x] 公開サイトの除外
  - `.webflow.io` ドメインを除外
  - カスタムドメイン（webflow.com 以外）を除外
- [x] `content.js` の初期化処理でURL判定を追加
- [x] **二段構え**: `manifest.json` の `matches` + JS側の判定で確実にブロック

#### 2.3 SPA対応
- [x] ページ遷移時のURL変更を監視（history API + popstate）
- [x] URL変更時に再判定を実行
- [x] 管理画面でない場合は翻訳を停止
- [x] 管理画面に戻った場合は翻訳を再開

### Phase 3: パフォーマンス・堅牢性の向上

#### 3.1 `utils.js` の機能追加
- [x] 辞書を長さ順にソート（`optimizeTranslationPairs()`）
- [x] `isAlreadyTranslated()` - 既に翻訳済みか判定
- [x] 翻訳関数（`translateTextWithStats()`）- 置換後テキスト + 用語ごとの置換回数を返す
- [x] `escapeRegex()` - 正規表現のエスケープ
- [x] `containsEnglishText()` - 英語テキスト検出（デバッグ用）

#### 3.4 翻訳マッピング保持機能の実装
- [x] 用語単位の統計（英語キー→日本語/回数）を記録
  - キー: 英語テキスト
  - 値: 日本語テキスト（または翻訳情報オブジェクト）
- [x] `nodeOriginalTextMap` - WeakMapでノードと元のテキストのマッピングを保存（デバッグ用）
- [x] 翻訳実行時に統計を記録（`chrome.storage.local` に累積保存）
- [x] 翻訳統計の記録（各英語テキストが何回置換されたか）
- [x] デバッグモードで未翻訳候補を統計に記録（`__untranslated__:`）
- [x] オプションページで翻訳統計を表示
- [x] オプションページで統計をCSVエクスポート
- [x] オプションページで未翻訳候補を別枠表示 + CSVエクスポート

#### 3.2 `content.js` の改善
- [x] 処理済みノードのキャッシュ（WeakSet）
- [x] スクリプト・スタイルタグの除外
- [x] エラーハンドリングの追加（storage読み書き等）
- [x] デバッグモードの実装（未翻訳候補を統計に記録）
- [x] バッチ処理によるパフォーマンス向上（MutationObserverでまとめて処理）
- [x] 元のテキストをWeakMapに保存する機能

#### 3.3 設定機能の追加
- [x] デバッグモードのON/OFF設定
- [x] 設定の保存・読み込み（`chrome.storage.sync`）
- [x] オプションページに設定UIを追加

#### 3.5 オプションページの拡張
- [x] 翻訳統計の表示（英語キー/日本語/回数）
- [x] よく使われる用語のランキング（回数降順で表示）
- [x] 統計のエクスポート機能（CSV）
- [x] 未翻訳候補の表示（別枠）
- [x] 未翻訳候補のエクスポート機能（CSV）
- [x] 統計リセット（このブラウザ）

### Phase 4: テスト・検証

#### 4.1 動作確認
- [ ] 管理画面で翻訳が適用されるか確認
- [ ] デザイナー画面で翻訳が適用されるか確認
- [ ] 公開サイトで翻訳が適用されないか確認
- [ ] ページ遷移時に翻訳が継続するか確認

#### 4.2 パフォーマンステスト
- [ ] 大量のDOM要素がある場合の動作確認
- [ ] 動的に追加される要素の翻訳確認
- [ ] メモリリークの確認

#### 4.3 エッジケースの確認
- [ ] 特殊な文字が含まれるテキストの翻訳
- [ ] HTMLエンティティの処理
- [ ] 既に日本語が含まれるテキストの処理

## 技術的な検討事項

### URL判定の方法（確定）

**採用方針: パスベース + サブドメインベースの組み合わせ判定**

#### 実装ロジック

```javascript
function isWebflowAdminUI() {
  const hostname = window.location.hostname;
  const pathname = window.location.pathname;
  
  // 1. webflow.com ドメインでない場合は false
  if (!hostname.includes('webflow.com')) {
    return false;
  }
  
  // 2. 公開サイト（.webflow.io）を除外
  if (hostname.includes('.webflow.io')) {
    return false;
  }
  
  // 3. サブドメインベース判定（対象）
  if (hostname.includes('preview.webflow.com')) {
    return true; // プレビュー画面
  }
  
  // 4. パスベース判定（対象）
  const adminPaths = [
    '/dashboard',
    '/design',
    '/designer',
    '/editor',
    '/cms',
    '/ecommerce',
    '/memberships',
    '/sites',
    '/account',
    '/settings'
  ];
  
  for (const path of adminPaths) {
    if (pathname.startsWith(path)) {
      return true;
    }
  }
  
  // 5. その他の管理画面関連パス（要確認・追加）
  // 例: /workspace, /team など
  
  return false;
}
```

#### パスベース判定（対象）
```
- /dashboard/* → 管理画面（Dashboard）
- /design/* → デザイナー（Designer）
- /designer/* → デザイナー（Designer）
- /editor/* → エディター（Editor）
- /cms/* → CMS管理画面
- /ecommerce/* → Eコマース管理画面
- /memberships/* → メンバーシップ管理画面
- /sites/* → サイト管理
- /account/* → アカウント設定
- /settings/* → 設定
```

#### サブドメインベース判定（対象）
```
- preview.webflow.com → プレビュー画面
- *.webflow.com → その他の管理画面関連サブドメイン（要確認）
```

#### 除外パターン
```
- *.webflow.io/* → 公開サイト（除外）
- カスタムドメイン（webflow.com 以外） → 公開サイト（除外）
```

### 除外すべきURLパターン

- `*.webflow.io/*` - 公開サイト
- カスタムドメイン（webflow.com 以外のドメイン）
- `/` ルートパス（公開サイトの可能性が高い）

### パフォーマンス最適化の方針

1. **辞書の最適化**
   - 長い文字列から先にマッチング
   - 正規表現のキャッシュ

2. **DOM処理の最適化**
   - WeakSetで処理済みノードをキャッシュ
   - バッチ処理でMutationObserverの呼び出しを減らす

3. **翻訳判定の最適化**
   - 既に日本語が含まれるテキストはスキップ
   - 空のテキストノードはスキップ

4. **翻訳マッピング保持**
   - Map/オブジェクトで英語→日本語のマッピングをグローバルに記録
   - WeakMapでノード単位の元テキストを保持（デバッグ用）
   - メモリリークを防ぎつつ、デバッグや翻訳確認が可能
   - 翻訳統計を記録して新しい翻訳用語の発見に活用

## 翻訳の動作方法

### 現在の実装（問題点）
- `node.nodeValue` を直接置換しているため、元の英語テキストが失われる
- 英語→日本語のマッピングを記録していない
- 翻訳後は元のテキストを確認できない
- デバッグや新しい翻訳用語の発見が困難
- 翻訳統計を取れない

### 改善後の実装（提案）

#### 1. 英語→日本語マッピングの記録
- **Map/オブジェクトで翻訳マッピングを保持**
  - キー: 英語テキスト（元のテキスト）
  - 値: 日本語テキスト（翻訳後のテキスト）または翻訳情報オブジェクト
  - グローバルに保持して、ページ全体の翻訳履歴を記録

#### 2. ノード単位の元テキスト保持（デバッグ用）
- **WeakMapでノードと元のテキストのマッピングを保持**
  - ノードが削除されれば自動的にガベージコレクションされる（メモリリークなし）
  - 特定のノードから元のテキストを取得可能

#### 3. 翻訳処理の流れ
1. テキストノードを発見
2. 元の英語テキストを取得
3. 翻訳を実行
4. **英語→日本語のマッピングを記録**（グローバル）
5. ノードと元のテキストをWeakMapに保存（デバッグ用）
6. `nodeValue` を翻訳後のテキストに更新

#### 4. 活用方法
- **翻訳マッピングの確認**
  - オプションページで「英語→日本語」の一覧を表示
  - どの英語がどの日本語に翻訳されたかを確認
- **翻訳統計**
  - 各英語テキストが何回翻訳されたかを記録
  - よく使われる用語を特定
- **デバッグ**
  - 特定のノードから元のテキストを取得
  - 翻訳が正しく適用されているか確認
- **新しい翻訳用語の発見**
  - マッピングにない英語テキストを検出
  - CSVに追加すべき用語を特定

#### マッピング粒度（ここを先に決めるのがおすすめ）
- **A: 用語単位（CSVのキー単位）で記録（推奨）**
  - 例: `"Delete" -> "削除"` が何回置換されたか、どの画面で出たか、などを集計しやすい
  - テキストノード全文を保存しないので、プライバシー面でも安全
- **B: テキストノード全文（originalText）単位で記録**
  - 例: `"Are you sure you want to Delete?" -> "本当に削除しますか？"` のような全文マッピング
  - 文言のバリエーションに弱く、データが増えやすい（ログ用途向け）
- **C: A + 未翻訳テキスト検出（別枠で収集）**
  - 未翻訳の英語フレーズだけを「候補」として収集し、CSVに追加していく運用に向く

### 実装例

```javascript
// グローバルな翻訳マッピング（英語→日本語）
const translationMapping = new Map();
// または
const translationMapping = {}; // { "English": "日本語", ... }

// 翻訳統計（オプション）
const translationStats = new Map(); // { "English": count, ... }

// WeakMapでノード単位の元テキストを保持（デバッグ用）
const nodeOriginalTextMap = new WeakMap();

function replaceTextNode(node) {
  const originalText = node.nodeValue;
  
  // 翻訳実行
  const translated = translateText(originalText, sortedDict);
  
  if (translated) {
    // 1. 英語→日本語のマッピングを記録（グローバル）
    if (!translationMapping.has(originalText)) {
      translationMapping.set(originalText, translated);
      translationStats.set(originalText, 0);
    }
    translationStats.set(originalText, translationStats.get(originalText) + 1);
    
    // 2. ノード単位の元テキストを保存（デバッグ用）
    nodeOriginalTextMap.set(node, originalText);
    
    // 3. 翻訳後のテキストを設定
    node.nodeValue = translated;
  }
}

// マッピングを取得
function getTranslationMapping() {
  return Object.fromEntries(translationMapping);
}

// 特定のノードから元のテキストを取得（デバッグ用）
function getOriginalText(node) {
  return nodeOriginalTextMap.get(node) || node.nodeValue;
}
```

## 確定事項

### 1. 対象ページの範囲 ✅
- ✅ **エディター（Editor）も含める**
- ✅ **CMS管理画面も含める**
- ✅ **Eコマース管理画面も含める**
- ✅ **メンバーシップ管理画面も含める**
- ✅ **管理画面全般を対象とする**

### 2. URL判定の詳細 ✅
- ✅ **パスベース判定を採用**
  - `/dashboard/*`, `/design/*`, `/editor/*`, `/cms/*`, `/ecommerce/*`, `/memberships/*` など
- ✅ **サブドメインベース判定も採用**
  - `preview.webflow.com` など
- ✅ **公開サイトは除外**
  - `.webflow.io` ドメインを除外
  - カスタムドメイン（webflow.com 以外）を除外

### 3. デバッグ機能（検討中）
✅ 実装済み
- デバッグモード（ON/OFF）で **未翻訳候補** を統計に記録（`__untranslated__:`）
- 翻訳実行回数（用語単位の置換回数）を累積保存

### 4. 設定機能（検討中）
✅ 実装済み（最小）
- デバッグモードのON/OFF（`chrome.storage.sync`）
- 翻訳統計/未翻訳候補の閲覧・CSV出力・リセット（`chrome.storage.local`）

（未対応・必要なら）
- 翻訳のON/OFF
- 特定ページでの翻訳除外
- カスタム翻訳ルール

## 次のステップ

1. **動作確認（Phase 4）**
   - 管理画面（Dashboard / Designer / Editor / CMS / Eコマース / Memberships）で翻訳が適用されるか確認
   - プレビュー画面（preview.webflow.com）で翻訳が適用されるか確認
   - 公開サイト（.webflow.io）で翻訳が適用されないか確認
   - オプションで統計が増える/CSV出力できる/リセットできるか確認

2. **辞書運用**
   - オプションの「未翻訳候補」から英語を拾って `translation_terms.csv` に追加
   - 追加後、拡張機能を再読み込みして反映

3. **必要なら改善**
   - 未翻訳候補のCSVを `English,Japanese`（Japanese空欄）形式でも出せるようにする
   - 未翻訳候補の「除外（無視）リスト」機能

## v1.1.0 アップデート内容

### リファクタリング（保守性向上）
- [x] 単一の `content.js` / `utils.js` を責務ごとに `src/` へ分割
  - `src/constants.js` … 除外セレクタ・対象属性・動的パターン等の設定
  - `src/csv.js` … CSVパース／シリアライズ
  - `src/translator.js` … 翻訳エンジン（完全一致＋動的パターン）
  - `src/dom.js` … DOM走査・テキスト/属性翻訳・MutationObserver
  - `src/content.js` … エントリポイント（設定・統計・URL判定・初期化）
- [x] `globalThis.WFJA` 名前空間でモジュール間連携（Node からも require 可能でテスト容易）
- [x] DOM処理のキャッシュ（処理済みノード・属性）をクロージャに閉じ込め

### 翻訳カバレッジの拡張
- [x] 属性翻訳に対応（`title` / `aria-label` / `placeholder` / `alt`）→ ツールチップ等も日本語化
- [x] 動的パターン翻訳に対応（`5 minutes ago` → `5分前`、`12 items` → `12個のアイテム`、`Page 2 of 5` 等）
- [x] 用語集を整理（重複168行を除去）し新規83件を追加（合計2,019件）

### 機能追加
- [x] ポップアップUIを実装（翻訳のON/OFF切り替え、切替時に対象タブを自動リロード）
- [x] オプションに翻訳プレビュー（完全一致＋パターン）と用語数表示

### 品質
- [x] DOM走査中の `textContent` 書き換えでTreeWalkerが壊れ後続ノードを取りこぼすバグを修正（収集→処理の二段構え）
- [x] Node標準テストランナーによるテストを追加（`node --test`、依存なし）
- [x] 用語集の正規化・重複検査を行うメンテナンススクリプトとCIを追加

## 参考情報

- [Chrome Extensions - Content Scripts](https://developer.chrome.com/docs/extensions/mv3/content_scripts/)
- [Chrome Extensions - Storage API](https://developer.chrome.com/docs/extensions/reference/storage/)
- [MutationObserver API](https://developer.mozilla.org/ja/docs/Web/API/MutationObserver)
