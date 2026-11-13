#!/usr/bin/env python3
"""translation_terms.csv の構文・重複・矛盾をチェックする。

使い方: python3 scripts/check_dict.py [translation_terms.csv]
エラーがあれば終了コード 1。警告（大小文字違いで訳が異なる等）は 0 のまま表示のみ。
"""
import csv
import re
import sys
from collections import defaultdict

path = sys.argv[1] if len(sys.argv) > 1 else "translation_terms.csv"
errors, warnings = [], []
seen = {}
lower = defaultdict(set)

with open(path, encoding="utf-8", newline="") as f:
    rows = list(csv.reader(f))

if not rows or rows[0] != ["English Term", "Japanese Translation"]:
    errors.append("1行目のヘッダーが 'English Term,Japanese Translation' ではありません")

for i, row in enumerate(rows[1:], start=2):
    if not row:
        continue
    if len(row) != 2:
        errors.append(f"{i}行目: 列数が{len(row)}です（英文にカンマがある場合は \"...\" で囲む）: {row}")
        continue
    en, ja = row
    if not en.strip() or not ja.strip():
        errors.append(f"{i}行目: 空の値があります: {row}")
        continue
    if en != en.strip() or ja != ja.strip():
        errors.append(f"{i}行目: 前後に空白があります: {row}")
    if en in seen:
        kind = "重複" if seen[en][1] == ja else "訳の矛盾"
        errors.append(f"{i}行目: {kind}（{seen[en][0]}行目と同じキー）: {en} → {seen[en][1]} / {ja}")
        continue
    seen[en] = (i, ja)
    lower[en.lower()].add(ja)
    if not re.search(r"[぀-ヿ一-鿿]", ja) and ja != en:
        warnings.append(f"{i}行目: 訳に日本語が含まれていません: {en} → {ja}")

for key, jas in lower.items():
    if len(jas) > 1:
        warnings.append(f"大小文字違いで訳が異なります: {key} → {sorted(jas)}")

for w in warnings:
    print("WARN ", w)
for e in errors:
    print("ERROR", e)
print(f"\n{len(seen)} 件 / エラー {len(errors)} / 警告 {len(warnings)}")
sys.exit(1 if errors else 0)
