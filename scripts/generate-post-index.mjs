import { promises as fs } from "fs";
import path from "path";

const postsDir = path.resolve("content/posts");
const indexPath = path.join(postsDir, "index.json");

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

    try {
      const data = JSON.parse(raw);

      posts.push({
        id: data.id ?? "",
        date: data.date ?? "",
        author: data.author ?? "",
        image: data.image ?? "",
        text: data.text ?? "",
        caption: data.caption ?? "",
        createdAt: data.createdAt ?? "",
        viewCount: Number(data.viewCount ?? 0),
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