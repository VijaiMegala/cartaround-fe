import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const output = join(root, "public");
await mkdir(output, { recursive: true });
for (const file of ["index.html", "styles.css", "app.js", "store-map-client.js"]) {
  await copyFile(join(root, file), join(output, file));
}
