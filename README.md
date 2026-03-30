# 吾輩は猫である × グリーンスクリーン猫

> *"吾輩は猫である。名前はまだ無い。"*

夏目漱石の小説テキストが画面を埋め尽くし、グリーンスクリーンの子猫のシルエットをリアルタイムで避けて流れる Canvas デモ。

## デモ

https://github.com/user-attachments/assets/demo.mp4

## 仕組み

毎フレーム、次の処理をおこなっています。

```
1. <video> の現フレームをオフスクリーン Canvas に drawImage（フルサイズ 1280×720）
2. getImageData でピクセルを走査
   - 緑ピクセル → alpha=0（クロマキー除去）
   - 非緑ピクセル → catMask に記録 + グリーンスピル補正
   - 同時に猫のバウンディングボックス（上下左右の端）を算出
3. バウンディングボックスを 1/3 に縮小した領域を、元の中心位置に配置
4. 縮小後の座標から逆引きしてメインキャンバス用の障害物マスクを生成
5. キャンバス全体をテキストで埋める
   - 各テキスト行のバンドで blocked intervals を計算
   - carveSlots() で空きスロットを算出
   - @chenglou/pretext の layoutNextLine() で各スロットに流し込み
6. 縮小した猫を drawImage で上に重ねる
```

```
Canvas (1280×720)
┌──────────────────────────────────────────────────────────┐
│ 吾輩は猫である                夏目漱石                  │
│ ────────────────────────────────────────────── 一 ──── │
│ 吾輩は猫である。名前はまだ無い。どこで生れたかとんと   │
│ 見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー │
│ 泣いていた事だけは記憶している。吾輩はここで始めて    │
│ 人間というものを見た。しかもあとで ╔══════╗ 聞くと  │
│ それは書生という人間中で一番獰悪な ║  🐱  ║ 種族で  │
│ あったそうだ。この書生というのは  ╚══════╝ 時々我々 │
│ を捕まえて煮て食うという話である。しかしその当時は何  │
└──────────────────────────────────────────────────────────┘
```

## セットアップ

### 1. 動画素材を用意

Pixabay からグリーンスクリーンの猫動画をダウンロードし、`neko.mp4` という名前でこのディレクトリに置いてください。

- 推奨: [Pixabay — "cat green screen" videos](https://pixabay.com/videos/search/cat%20green%20screen/)
- ファイル名: `neko.mp4`
- 推奨解像度: 1280×720 以上

> **注意**: `neko.mp4` は Pixabay ライセンスのため、このリポジトリには含まれていません。

### 2. 依存パッケージをインストール

```bash
bun install
```

### 3. 開発サーバーを起動

```bash
bun dev
```

`http://localhost:3000` をブラウザで開くとデモが動作します。

## 技術スタック

| | 用途 |
|---|---|
| [Bun](https://bun.sh) | ランタイム・バンドラー・開発サーバー |
| [Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API) | 描画・グリーンスクリーン除去・ピクセル操作 |
| [@chenglou/pretext](https://www.npmjs.com/package/@chenglou/pretext) | DOM 不要の多言語テキスト計測・ライン単位レイアウト |

### @chenglou/pretext でテキストを障害物に沿わせる

`layoutNextLine(prepared, cursor, maxWidth)` は「このカーソル位置から幅 N px に収まる次の1行」を返します。幅を行ごとに変えられるので、猫の輪郭形状に合わせた幅を毎行渡すことでテキストを自然に回り込ませられます。

```js
const prepared = prepareWithSegments(text, font);
let cursor = { segmentIndex: 0, graphemeIndex: 0 };

for (const slot of freeSlotsOnThisLine) {
  const line = layoutNextLine(prepared, cursor, slot.width);
  if (line) {
    ctx.fillText(line.text, slot.x, y);
    cursor = line.end; // 次の行へカーソルを進める
  }
}
```

### グリーンスクリーン除去とスピル補正

```js
// クロマキー除去
if (g > 90 && (g - r) > 35 && (g - b) > 35) {
  alpha = 0; // 完全に透明化
}

// フリンジのグリーンスピル補正（エッジの緑かぶりを除去）
const spill = g - Math.max(r, b);
if (spill > 5) g = Math.round(Math.max(r, b) + spill * 0.15);
```

### 猫のバウンディングボックス切り出し

動画フレーム全体を処理して猫ピクセルの上下左右端を算出し、その矩形だけを 1/3 縮小でメインキャンバスへ合成。元のグリーン背景だった領域すべてにテキストを流し込めます。

## テキスト

夏目漱石「吾輩は猫である」(1905–1906)
著作権保護期間終了（パブリックドメイン）。テキストは[青空文庫](https://www.aozora.gr.jp/)準拠。

## ライセンス

- **コード**: MIT
- **テキスト「吾輩は猫である」**: パブリックドメイン（夏目漱石 1867–1916）
- **動画素材**: [Pixabay ライセンス](https://pixabay.com/service/license-summary/)（別途ダウンロードが必要）
