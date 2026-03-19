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

async function main() {
  await fs.mkdir(postsDir, { recursive: true });

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
      const created = stat.mtime;

      posts.push({
        id: path.basename(file, ".json"),
        date: formatDate(created),
        author: data.author ?? "",
        image: data.image ?? "",
        text: data.text ?? "",
        caption: data.caption ?? "",
        createdAt: created.toISOString(),
        viewCount: 0,
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