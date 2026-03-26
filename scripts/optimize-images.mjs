import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";

const uploadsDir = path.resolve("images/uploads");
const postsDir = path.resolve("content/posts");
const MANIFEST_PATH = path.join(uploadsDir, ".film-processed.json");

const IMAGE_EXT_RE = /\.(png|webp|jpeg|jpg|heic|heif)$/i;

// フィルム風フィルター設定
const FILM = {
  saturation: 0.52,       // 彩度を落とす（くすんだ色味）
  linearA: 0.82,          // 黒の持ち上げ幅（フィルムのフェード感）
  linearB: 28,            // 黒の持ち上げオフセット
  recomb: [
    [0.85, 0.00, 0.00],   // 赤: わずかに増加
    [0.00, 0.90, 0.00],   // 緑: わずかに減少
    [0.00, 0.00, 0.87],   // 青: 削減（ウォームトーン）
  ],
};

async function loadManifest() {
  try {
    return new Set(JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8")));
  } catch {
    return new Set();
  }
}

async function saveManifest(processed) {
  await fs.writeFile(
    MANIFEST_PATH,
    JSON.stringify([...processed].sort(), null, 2),
    "utf8"
  );
}

function applyFilmFilter(pipeline) {
  return pipeline
    .modulate({ saturation: FILM.saturation })
    .linear(FILM.linearA, FILM.linearB)
    .recomb(FILM.recomb)
    .sharpen()
    .webp({ quality: 80 });
}

async function optimizeImage(fileName, processed) {
  const inputPath = path.join(uploadsDir, fileName);
  const ext = path.extname(fileName).toLowerCase();
  const base = path.basename(fileName, ext);
  const outputName = `${base}.webp`;
  const outputPath = path.join(uploadsDir, outputName);

  if (ext === ".webp") {
    // 処理済みならスキップ（二重適用防止）
    if (processed.has(fileName)) {
      return { original: fileName, converted: fileName, skipped: true };
    }
    // 未処理のwebp：一時ファイルに書き出してから置き換え
    const tmpPath = inputPath + ".tmp.webp";
    await applyFilmFilter(
      sharp(inputPath)
        .rotate()
        .resize({ width: 240, height: 240, fit: "inside", withoutEnlargement: true })
    ).toFile(tmpPath);
    await fs.rename(tmpPath, inputPath);
    console.log(`Filtered (webp): ${fileName}`);
    return { original: fileName, converted: fileName, skipped: false };
  }

  // 非webp：変換 + フィルター適用
  const image = sharp(inputPath);
  const metadata = await image.metadata();
  await applyFilmFilter(
    image
      .rotate()
      .resize({ width: 240, height: 240, fit: "inside", withoutEnlargement: true })
  ).toFile(outputPath);

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

async function rewritePostJsonImagePaths(rewrites) {
  const files = await fs.readdir(postsDir);

  for (const file of files) {
    if (!file.endsWith(".json") || file === "index.json") continue;

    const fullPath = path.join(postsDir, file);
    const raw = await fs.readFile(fullPath, "utf8");
    const data = JSON.parse(raw);

    if (!data.image) continue;

    let nextImage = data.image;

    for (const { original, converted } of rewrites) {
      const originalRelative = `images/uploads/${original}`;
      const originalAbsolute = `/images/uploads/${original}`;
      const originalDotRelative = `./images/uploads/${original}`;
      const convertedRelative = `images/uploads/${converted}`;

      if (data.image === originalRelative) nextImage = convertedRelative;
      if (data.image === originalAbsolute) nextImage = convertedRelative;
      if (data.image === originalDotRelative) nextImage = convertedRelative;

      if (
        typeof data.image === "string" &&
        data.image.endsWith(`/images/uploads/${original}`)
      ) {
        nextImage = convertedRelative;
      }
    }

    if (nextImage !== data.image) {
      data.image = nextImage;
      await fs.writeFile(fullPath, JSON.stringify(data, null, 2) + "\n", "utf8");
      console.log(`Updated image path in ${file}: ${nextImage}`);
    }
  }
}

async function main() {
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.mkdir(postsDir, { recursive: true });

  const processed = await loadManifest();
  const files = await fs.readdir(uploadsDir);
  const targets = files.filter((file) => IMAGE_EXT_RE.test(file));

  const rewrites = [];

  for (const file of targets) {
    const result = await optimizeImage(file, processed);
    rewrites.push(result);

    if (result.skipped) {
      console.log(`Skipped (already processed): ${result.original}`);
    } else {
      processed.add(result.converted);
      console.log(`Optimized: ${result.original} -> ${result.converted}`);
    }
  }

  await saveManifest(processed);
  await rewritePostJsonImagePaths(rewrites);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
