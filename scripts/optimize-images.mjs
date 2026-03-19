import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";

const uploadsDir = path.resolve("images/uploads");
const postsDir = path.resolve("content/posts");

const IMAGE_EXT_RE = /\.(png|webp|jpeg|jpg)$/i;

function toPosix(p) {
  return p.split(path.sep).join("/");
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function optimizeImage(fileName) {
  const inputPath = path.join(uploadsDir, fileName);
  const ext = path.extname(fileName).toLowerCase();
  const base = path.basename(fileName, ext);
  const outputName = `${base}.jpg`;
  const outputPath = path.join(uploadsDir, outputName);

  const image = sharp(inputPath);
  const metadata = await image.metadata();

  await image
    .rotate()
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({
      quality: 82,
      mozjpeg: true,
    })
    .toFile(outputPath);

  // 元画像が jpg 以外なら削除
  if (outputPath !== inputPath) {
    await fs.unlink(inputPath);
  }

  return {
    original: fileName,
    converted: outputName,
    width: metadata.width,
    height: metadata.height,
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
      const convertedRelative = `images/uploads/${converted}`;
      const convertedAbsolute = `/images/uploads/${converted}`;

      if (data.image === originalRelative) nextImage = convertedRelative;
      if (data.image === originalAbsolute) nextImage = convertedRelative;
      if (data.image === `./${originalAbsolute}`) nextImage = convertedRelative;

      // すでに relative の場合にも対応
      if (data.image.endsWith(`/images/uploads/${original}`)) {
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
  const files = await fs.readdir(uploadsDir);
  const targets = files.filter((file) => IMAGE_EXT_RE.test(file));

  const rewrites = [];

  for (const file of targets) {
    // すでに .jpg でも縮小圧縮し直す
    const result = await optimizeImage(file);
    rewrites.push(result);
    console.log(`Optimized: ${result.original} -> ${result.converted}`);
  }

  await rewritePostJsonImagePaths(rewrites);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});