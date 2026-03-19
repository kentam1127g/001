import { promises as fs } from "fs";
import path from "path";

const postsDir = path.resolve("content/posts");
const indexPath = path.join(postsDir, "index.json");

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeDate(value, fallbackDate) {
  if (!value) return fallbackDate;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallbackDate;
  return formatDate(d);
}

function normalizeCreatedAt(value, fallbackIso) {
  if (!value) return fallbackIso;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallbackIso;
  return d.toISOString();
}

async function readExistingIndex() {
  try {
    const raw = await fs.readFile(indexPath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function main() {
  await fs.mkdir(postsDir, { recursive: true });

  const existingIndex = await readExistingIndex();
  const existingMap = new Map(existingIndex.map((post) => [post.id, post]));

  const files = await fs.readdir(postsDir);
  const postFiles = files.filter(
    (file) => file.endsWith(".json") && file !== "index.json"
  );

  const posts = [];

  for (const file of postFiles) {
    const fullPath = path.join(postsDir, file);
    const raw = await fs.readFile(fullPath, "utf8");
    const stat = await fs.stat(fullPath);

    try {
      const data = JSON.parse(raw);
      const id = path.basename(file, ".json");
      const existing = existingMap.get(id);

      const fallbackCreatedAt = stat.mtime.toISOString();
      const fallbackDate = formatDate(stat.mtime);

      const createdAt =
        existing?.createdAt ??
        normalizeCreatedAt(data.createdAt, fallbackCreatedAt);

      const date =
        existing?.date ??
        normalizeDate(data.date || data.createdAt, fallbackDate);

      posts.push({
        id,
        date,
        author: data.author ?? existing?.author ?? "",
        image: data.image ?? existing?.image ?? "",
        text: data.text ?? existing?.text ?? "",
        caption: data.caption ?? existing?.caption ?? "",
        createdAt,
        viewCount: existing?.viewCount ?? Number(data.viewCount ?? 0),
      });
    } catch (error) {
      console.warn(`Skipping invalid JSON: ${file}`);
      console.warn(error);
    }
  }

  posts.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  await fs.writeFile(indexPath, JSON.stringify(posts, null, 2) + "\n", "utf8");
  console.log(`Wrote ${indexPath} with ${posts.length} posts.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});