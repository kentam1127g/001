import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";

const uploadsDir = path.resolve("images/uploads");
const postsDir = path.resolve("content/posts");

const IMAGE_EXT_RE = /\.(png|webp|jpeg|jpg)$/i;

// 調整しやすいように設定を外に出す
const EMO_FILTER = {
  enabled: true,
  resizeWidth: 1200,
  resizeHeight: 1200,
  webpQuality: 80,

  // “やりすぎない” 初期値
  brightness: 1.03, // 少し明るく
  saturation: 0.9,  // 少し彩度を落とす
  hue: 0,           // 色相はいじらない
  lightness: 0,     // 必要なら少しだけ足す

  linearA: 1.04,    // コントラスト少し上げる
  linearB: -6,      // 黒をほんの少し締める

  sharpenSigma: 1.1,
};

async function optimizeImage(fileName) {
  const inputPath = path.join(uploadsDir, fileName);
  const ext = path.extname(fileName).toLowerCase();

  // webpでも再処理したいなら skip しない
  const base = path.basename(fileName, ext);
  const outputName = `${base}.webp`;
  const outputPath = path.join(uploadsDir, outputName);

  const metadata = await sharp(inputPath).metadata();

  let pipeline = sharp(inputPath)
    .rotate()
    .resize({
      width: EMO_FILTER.resizeWidth,
      height: EMO_FILTER.resizeHeight,
      fit: "inside",
      withoutEnlargement: true,
    });

  if (EMO_FILTER.enabled) {
    pipeline = pipeline
      .modulate({
        brightness: EMO_FILTER.brightness,
        saturation: EMO_FILTER.saturation,
        hue: EMO_FILTER.hue,
        lightness: EMO_FILTER.lightness,
      })
      .linear(EMO_FILTER.linearA, EMO_FILTER.linearB);
  }

  pipeline = pipeline
    .sharpen({ sigma: EMO_FILTER.sharpenSigma })
    .webp({
      quality: EMO_FILTER.webpQuality,
    });

  await pipeline.toFile(outputPath);

  // 元画像が webp 以外なら削除
  // webp → webp の場合は outputPath が同名になるので削除しない
  if (path.resolve(outputPath) !== path.resolve(inputPath)) {
    await fs.unlink(inputPath);
  }

  return {
    original: fileName,
    converted: outputName,
    width: metadata.width,
    height: metadata.height,
    skipped: false,
  };
}