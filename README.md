# 吾輩は猫である × グリーンスクリーン猫

> **"吾輩は猫である。名前はまだ無い。"**

夏目漱石の小説テキストが画面を埋め尽くし、グリーンスクリーンの子猫の輪郭をリアルタイムで避けて流れる Canvas デモ。

## デモ

https://github.com/user-attachments/assets/demo.mp4

（動画は差し替え予定）

## 仕組み

```
毎フレーム (requestAnimationFrame):
  1. <video> の現フレームをオフスクリーン Canvas に drawImage
  2. getImageData → 緑ピクセルを検出して透明化（クロマキー除去）
  3. 猫シルエット (非緑ピクセル) を列スキャンして blocked intervals を生成
  4. carveSlots() で空き横スロットを算出
  5. @chenglou/pretext の layoutNextLine() で各スロットにテキストを流し込み
  6. 黒背景 → テキスト → 猫の順で重ね描画
```

```
Canvas (1280×720)
┌──────────────────────────────────────────────────────┐
│ 吾輩わがはいは猫である。名前はまだ無い。どこで生れ │
│ たかとんと見当がつかぬ。何でも薄暗いじめじめした  │
│ 所でニャーニャー泣いて ╔══════╗ 事だけは記憶して  │
│ いる。吾輩はここで始め ║  🐱  ║ というものを見た。│
│ しかもあとで聞くとそれ ╚══════╝ 間中で一番獰悪な  │
│ 種族であったそうだ。この書生というのは時々我々を  │
└──────────────────────────────────────────────────────┘
```

## セットアップ

### 1. 動画素材を用意

Pixabay からグリーンスクリーンの猫動画をダウンロードし、`neko.mp4` という名前でこのディレクトリに置いてください。

- 推奨: ["Cat" green screen videos on Pixabay](https://pixabay.com/videos/search/cat%20green%20screen/)
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

| 技術 | 用途 |
|------|------|
| [Bun](https://bun.sh) | ランタイム・バンドラー・開発サーバー |
| [Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API) | 描画・グリーンスクリーン除去 |
| [@chenglou/pretext](https://www.npmjs.com/package/@chenglou/pretext) | 多言語対応テキスト計測・ライン単位レイアウト |

### @chenglou/pretext について

DOM に依存しない純粋な JS テキストレイアウトライブラリ（2026年公開）。
`prepareWithSegments()` でテキストを解析し、`layoutNextLine(cursor, maxWidth)` で
任意の幅に合わせた次の行を取得できる。これにより各行ごとに異なる幅（=猫の輪郭に合わせた幅）を渡せる。

```js
// 使用例（障害物を避けてテキストを流す）
const prepared = prepareWithSegments(text, font);
let cursor = { segmentIndex: 0, graphemeIndex: 0 };

for (const slot of freeSlots) {
  const line = layoutNextLine(prepared, cursor, slot.width);
  if (line) {
    ctx.fillText(line.text, slot.x, y);
    cursor = line.end; // カーソルを進める
  }
}
```

## テキスト

夏目漱石「吾輩は猫である」(1905–1906)
著作権保護期間終了（パブリックドメイン）。
テキストは [青空文庫](https://www.aozora.gr.jp/) 準拠。

## ライセンス

- **コード**: MIT
- **テキスト「吾輩は猫である」**: パブリックドメイン（夏目漱石 1867–1916）
- **動画素材**: [Pixabay ライセンス](https://pixabay.com/service/license-summary/)（別途ダウンロードが必要）
