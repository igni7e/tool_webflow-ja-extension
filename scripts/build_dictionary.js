// scripts/build_dictionary.js
// translation_terms.csv のメンテナンス用スクリプト。
//   1. 重複キーの除去（最初の出現を優先）
//   2. 訳語の前後空白の除去・空行/不正行の除去
//   3. 新規用語（ADDITIONS）の追記（既存キーはスキップ）
// 実行: node scripts/build_dictionary.js   （--check で書き込みせず差分件数のみ表示）

const fs = require("fs");
const path = require("path");
const { parseCSVRow, escapeCSVCell } = require("../src/csv.js");

const CSV_PATH = path.join(__dirname, "..", "translation_terms.csv");
const HEADER = "English Term,Japanese Translation";

// 追記する新規用語（既に存在するキーは自動でスキップされる）。
// Webflowの Designer / Dashboard / CMS / Ecommerce / 共通UI でよく使われる文言を中心に収録。
const ADDITIONS = [
  // --- 共通アクション ---
  ["Move to", "移動先"],
  ["Move up", "上へ移動"],
  ["Move down", "下へ移動"],
  ["Move to top", "先頭へ移動"],
  ["Move to bottom", "末尾へ移動"],
  ["Open", "開く"],
  ["Reload", "再読み込み"],
  ["Got it", "了解"],
  ["Dismiss", "閉じる"],
  ["Download", "ダウンロード"],
  ["Apply changes", "変更を適用"],
  ["Save changes", "変更を保存"],
  ["Save and close", "保存して閉じる"],
  ["Save and publish", "保存して公開"],
  ["Show password", "パスワードを表示"],
  ["Hide password", "パスワードを非表示"],
  ["Reorder", "並べ替え"],
  ["Drag to reorder", "ドラッグして並べ替え"],
  ["No results found", "結果が見つかりません"],
  ["No results", "結果なし"],
  ["No items", "アイテムがありません"],
  ["Nothing here yet", "まだ何もありません"],
  ["Coming soon", "近日公開"],
  ["Read more", "続きを読む"],
  ["Show details", "詳細を表示"],
  ["Hide details", "詳細を非表示"],
  ["View details", "詳細を表示"],
  ["More options", "その他のオプション"],
  ["Deselect", "選択解除"],
  ["Select none", "選択を解除"],
  ["Clear all", "すべてクリア"],
  ["Remove all", "すべて削除"],
  ["Add all", "すべて追加"],
  ["Confirm delete", "削除の確認"],
  ["Are you sure?", "よろしいですか？"],
  ["This action cannot be undone.", "この操作は取り消せません。"],
  ["Yes", "はい"],
  ["No", "いいえ"],
  ["Close panel", "パネルを閉じる"],
  ["Open in new tab", "新しいタブで開く"],
  ["Copy link", "リンクをコピー"],
  ["Copy to clipboard", "クリップボードにコピー"],
  ["Copied", "コピーしました"],
  ["Copied to clipboard", "クリップボードにコピーしました"],
  ["Link copied", "リンクをコピーしました"],
  ["Try again", "もう一度試す"],

  // --- ステータス / バッジ ---
  ["Beta", "ベータ"],
  ["New", "新規"],
  ["Free", "無料"],
  ["Pro", "プロ"],
  ["Offline", "オフライン"],
  ["Online", "オンライン"],
  ["Connected", "接続済み"],
  ["Disconnected", "切断済み"],
  ["Not connected", "未接続"],
  ["Pending", "保留中"],
  ["In progress", "進行中"],
  ["Completed", "完了"],
  ["Failed", "失敗"],
  ["Success", "成功"],
  ["Warning", "警告"],
  ["Unsaved changes", "未保存の変更"],
  ["All changes saved", "すべての変更を保存しました"],
  ["Last saved", "最終保存"],
  ["Just now", "たった今"],
  ["Today", "今日"],
  ["Yesterday", "昨日"],
  ["Expires", "有効期限"],
  ["Expired", "期限切れ"],

  // --- Designer: スタイルパネル / プロパティ ---
  ["Layout", "レイアウト"],
  ["Spacing", "スペーシング"],
  ["Sizing", "サイズ"],
  ["Position", "位置"],
  ["Backgrounds", "背景"],
  ["Borders", "枠線"],
  ["Effects", "エフェクト"],
  ["Transitions", "トランジション"],
  ["Transforms", "変形"],
  ["Flexbox", "フレックスボックス"],
  ["Display", "表示形式"],
  ["Float", "フロート"],
  ["Overflow", "オーバーフロー"],
  ["Opacity", "不透明度"],
  ["Cursor", "カーソル"],
  ["Margin", "マージン"],
  ["Padding", "パディング"],
  ["Min width", "最小幅"],
  ["Max width", "最大幅"],
  ["Min height", "最小高さ"],
  ["Max height", "最大高さ"],
  ["Font size", "フォントサイズ"],
  ["Font weight", "フォントウェイト"],
  ["Line height", "行の高さ"],
  ["Letter spacing", "字間"],
  ["Text align", "テキスト揃え"],
  ["Text color", "テキストカラー"],
  ["Background color", "背景色"],
  ["Background image", "背景画像"],
  ["Box shadow", "ボックスシャドウ"],
  ["Text shadow", "テキストシャドウ"],

  // --- Designer: 要素追加パネル ---
  ["Add elements", "要素を追加"],
  ["Add element", "要素を追加"],
  ["Elements", "要素"],
  ["Sections", "セクション"],
  ["Containers", "コンテナ"],
  ["Div block", "Divブロック"],
  ["Section", "セクション"],
  ["Container", "コンテナ"],
  ["Columns", "カラム"],
  ["Heading", "見出し"],
  ["Paragraph", "段落"],
  ["Text link", "テキストリンク"],
  ["List item", "リスト項目"],
  ["Link block", "リンクブロック"],
  ["Text input", "テキスト入力"],
  ["Text area", "テキストエリア"],
  ["Checkbox", "チェックボックス"],
  ["Radio button", "ラジオボタン"],
  ["Submit button", "送信ボタン"],
  ["Navbar", "ナビバー"],
  ["Dropdown", "ドロップダウン"],
  ["Tabs", "タブ"],
  ["Lightbox", "ライトボックス"],
  ["Embed", "埋め込み"],
  ["Custom code", "カスタムコード"],

  // --- CMS ---
  ["Collection", "コレクション"],
  ["Collections", "コレクション"],
  ["Collection list", "コレクションリスト"],
  ["Collection page", "コレクションページ"],
  ["Add collection", "コレクションを追加"],
  ["Create collection", "コレクションを作成"],
  ["Field type", "フィールドタイプ"],
  ["Add field", "フィールドを追加"],
  ["Plain text", "プレーンテキスト"],
  ["Rich text", "リッチテキスト"],
  ["Number", "数値"],
  ["Date/Time", "日時"],
  ["Reference", "参照"],
  ["Multi-reference", "複数参照"],
  ["Multi-image", "複数画像"],

  // --- Ecommerce ---
  ["Products", "商品"],
  ["Product", "商品"],
  ["Categories", "カテゴリー"],
  ["Category", "カテゴリー"],
  ["Customers", "顧客"],
  ["Inventory", "在庫"],
  ["Price", "価格"],
  ["Quantity", "数量"],
  ["Add to cart", "カートに追加"],
  ["Checkout", "チェックアウト"],
  ["Cart", "カート"],
  ["Shipping", "配送"],
  ["Discount", "割引"],
  ["Discounts", "割引"],
  ["Coupon", "クーポン"],
  ["Subtotal", "小計"],
  ["Total", "合計"],
  ["Refund", "返金"],
  ["Fulfillment", "フルフィルメント"],

  // --- Dashboard / アカウント ---
  ["Workspace", "ワークスペース"],
  ["Workspaces", "ワークスペース"],
  ["Members", "メンバー"],
  ["Member", "メンバー"],
  ["Invite", "招待"],
  ["Invite member", "メンバーを招待"],
  ["Role", "役割"],
  ["Permissions", "権限"],
  ["Plan", "プラン"],
  ["Plans", "プラン"],
  ["Usage", "使用状況"],
  ["Activity", "アクティビティ"],
  ["Notifications", "通知"],
  ["Profile", "プロフィール"],
  ["Sign in", "サインイン"],
  ["Sign up", "サインアップ"],
  ["Sign out", "サインアウト"],
  ["Log in", "ログイン"],
  ["Log out", "ログアウト"],
  ["Email address", "メールアドレス"],
  ["Password", "パスワード"],
  ["Confirm password", "パスワードの確認"],
  ["Forgot password?", "パスワードをお忘れですか？"],
  ["Remember me", "ログイン状態を保持"],
  ["Two-factor authentication", "二段階認証"],
  ["Change password", "パスワードを変更"],
  ["Delete account", "アカウントを削除"],

  // --- 共通ラベル ---
  ["Name", "名前"],
  ["Title", "タイトル"],
  ["Description", "説明"],
  ["Type", "タイプ"],
  ["Status", "ステータス"],
  ["Date", "日付"],
  ["Time", "時刻"],
  ["Actions", "操作"],
  ["Details", "詳細"],
  ["Options", "オプション"],
  ["General", "一般"],
  ["Custom", "カスタム"],
  ["Default", "デフォルト"],
  ["None", "なし"],
  ["Other", "その他"],
  ["Optional", "任意"],
];

function loadRows(csvText) {
  const lines = csvText.split(/\r?\n/);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    if (!row) continue;
    const cols = parseCSVRow(row);
    if (!cols || cols.length < 2) continue;
    const en = (cols[0] ?? "").trim();
    const ja = (cols[1] ?? "").trim();
    if (!en || !ja) continue;
    rows.push([en, ja]);
  }
  return rows;
}

function build(csvText) {
  const seen = new Set();
  const out = [];
  let removedDup = 0;

  for (const [en, ja] of loadRows(csvText)) {
    if (seen.has(en)) {
      removedDup++;
      continue;
    }
    seen.add(en);
    out.push([en, ja]);
  }

  let added = 0;
  for (const [en, ja] of ADDITIONS) {
    const key = en.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([key, ja.trim()]);
    added++;
  }

  const body = out
    .map(([en, ja]) => `${escapeCSVCell(en)},${escapeCSVCell(ja)}`)
    .join("\n");
  return { text: `${HEADER}\n${body}\n`, removedDup, added, total: out.length };
}

function main() {
  const check = process.argv.includes("--check");
  const csvText = fs.readFileSync(CSV_PATH, "utf8");
  const { text, removedDup, added, total } = build(csvText);
  console.log(`重複除去: ${removedDup} 行 / 新規追加: ${added} 件 / 合計: ${total} 件`);
  if (!check) {
    fs.writeFileSync(CSV_PATH, text, "utf8");
    console.log(`書き込み完了: ${CSV_PATH}`);
  }
}

if (require.main === module) main();

module.exports = { build, ADDITIONS };
