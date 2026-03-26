import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";

const uploadsDir = path.resolve("images/uploads");
const postsDir = path.resolve("content/posts");

const IMAGE_EXT_RE = /\.(png|webp|jpeg|jpg|heic|heif)$/i;

async function optimizeImage(fileName) {
  const inputPath = path.join(uploadsDir, fileName);
  const ext = path.extname(fileName).toLowerCase();

  // すでに webp なら再変換しない
  if (ext === ".webp") {
    console.log(`Skip (already webp): ${fileName}`);
    return {
      original: fileName,
      converted: fileName,
      skipped: true,
    };
  }

  const base = path.basename(fileName, ext);
  const outputName = `${base}.webp`;
  const outputPath = path.join(uploadsDir, outputName);

  const image = sharp(inputPath);
  const metadata = await image.metadata();

  await image
    .rotate()
    .resize({
      width: 240,
      height: 240,
      fit: "inside",
      withoutEnlargement: true,
    })
    .sharpen()
    .webp({
      quality: 80,
    })
    .toFile(outputPath);

  // 元画像が別形式なら削除
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

  const files = await fs.readdir(uploadsDir);
  const targets = files.filter((file) => IMAGE_EXT_RE.test(file));

  const rewrites = [];

  for (const file of targets) {
    const result = await optimizeImage(file);
    rewrites.push(result);

    if (result.skipped) {
      console.log(`Skipped: ${result.original}`);
    } else {
      console.log(`Optimized: ${result.original} -> ${result.converted}`);
    }
  }

  await rewritePostJsonImagePaths(rewrites);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});