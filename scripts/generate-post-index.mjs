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

function safeDate(value, fallback) {
  if (!value) return fallback;
  const d = new Date(value);
  return isNaN(d.getTime()) ? fallback : formatDate(d);
}

function safeISO(value, fallback) {
  if (!value) return fallback;
  const d = new Date(value);
  return isNaN(d.getTime()) ? fallback : d.toISOString();
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
  const existingMap = new Map(existingIndex.map(p => [p.id, p]));

  const files = await fs.readdir(postsDir);
  const postFiles = files.filter(
    f => f.endsWith(".json") && f !== "index.json"
  );

  const posts = [];

  for (const file of postFiles) {
    const fullPath = path.join(postsDir, file);

    try {
      const raw = await fs.readFile(fullPath, "utf8");
      const data = JSON.parse(raw);
      const stat = await fs.stat(fullPath);

      const id = path.basename(file, ".json");
      const existing = existingMap.get(id);

      const fallbackDate = formatDate(stat.mtime);
      const fallbackCreated = stat.mtime.toISOString();

      const date = existing?.date ?? safeDate(data.date || data.createdAt, fallbackDate);
      const createdAt = existing?.createdAt ?? safeISO(data.createdAt, fallbackCreated);

      const image = typeof data.image === "string" ? data.image : "";

      posts.push({
        id,
        date,
        author: data.author || "",
        image, // ← WebPでもそのまま通す
        text: data.text || "",
        caption: data.caption || "",
        createdAt,
        viewCount: existing?.viewCount ?? Number(data.viewCount || 0)
      });

    } catch (err) {
      console.warn(`⚠️ skip: ${file}`, err.message);
    }
  }

  // 並び替え（古い→新しい）
  posts.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });

  await fs.writeFile(
    indexPath,
    JSON.stringify(posts, null, 2) + "\n",
    "utf8"
  );

  console.log(`✅ index.json updated (${posts.length} posts)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});