import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";

const uploadsDir = path.resolve("images/uploads");
const postsDir = path.resolve("content/posts");
const MANIFEST_PATH = path.join(uploadsDir, ".film-processed.json");

const IMAGE_EXT_RE = /\.(png|webp|jpeg|jpg|heic|heif)$/i;

// パレット色数を絞ることでディザリングが際立ち、古い印刷物のような質感になる
const GIF_OPTIONS = {
  colours: 48,  // 2〜256。少ないほどディザリングが強く出る
  dither: 1.0,  // Floyd-Steinberg の強度（0=なし〜1=最大）
  effort: 7,
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

async function optimizeImage(fileName, processed) {
  const inputPath = path.join(uploadsDir, fileName);
  const ext = path.extname(fileName).toLowerCase();
  const base = path.basename(fileName, ext);
  const outputName = `${base}.gif`;
  const outputPath = path.join(uploadsDir, outputName);

  if (processed.has(outputName)) {
    return { original: fileName, converted: outputName, skipped: true };
  }

  await sharp(inputPath)
    .rotate()
    .resize({ width: 240, height: 240, fit: "inside", withoutEnlargement: true })
    .gif(GIF_OPTIONS)
    .toFile(outputPath);

  if (path.resolve(outputPath) !== path.resolve(inputPath)) {
    await fs.unlink(inputPath);
  }

  return {
    original: fileName,
    converted: outputName,
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

  if (!targets.length) {
    console.log("No images to process.");
    return;
  }

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
