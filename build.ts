import { existsSync, mkdirSync, rmSync, readdirSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const PUBLIC_DIR = "public";
const DIST_DIR = "public/dist";
const HASH_FILE = path.join(DIST_DIR, ".build_hash");

/**
 *
 * @param src
 * @param dest
 */
function copyRecursiveSync(src: string, dest: string) {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }

  const entries = readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "dist") continue;
      copyRecursiveSync(srcPath, destPath);
    } else {
      if (entry.name.endsWith(".ts")) continue;
      copyFileSync(srcPath, destPath);
    }
  }
}

/**
 *
 */
async function calculatePublicHash(): Promise<string> {
  const files = [...new Bun.Glob("public/**/*").scanSync()].filter(f => !f.startsWith(`${DIST_DIR}/`));
  files.sort();

  const hash = crypto.createHash("sha256");
  for (const file of files) {
    const content = Bun.file(file);
    if (await content.exists()) {
      const text = await content.text();
      hash.update(file);
      hash.update(text);
    }
  }
  return hash.digest("hex");
}

const currentHash = await calculatePublicHash();
if (existsSync(HASH_FILE)) {
  const storedHash = readFileSync(HASH_FILE, "utf8");
  if (storedHash === currentHash) {
    console.log("No changes detected in public folder. Skipping build.");
    process.exit(0);
  }
}

if (existsSync(DIST_DIR)) {
  rmSync(DIST_DIR, { recursive: true, force: true });
}
mkdirSync(DIST_DIR, { recursive: true });

console.log("Changes detected. Cleaning and copying static assets...");
copyRecursiveSync(PUBLIC_DIR, DIST_DIR);

const entrypoints = [...new Bun.Glob("public/**/*.ts").scanSync()];

console.log("Building TypeScript files...");
const result = await Bun.build({
  entrypoints,
  outdir: DIST_DIR,
  root: PUBLIC_DIR,
  external: ["http", "https", "url", "fs", "JSZip"],
  sourcemap: "linked",
  splitting: true,
  format: "esm",
  minify: true,
  target: "bun",
  bytecode: true,
});

if (!result.success) {
  console.error("Build failed:");
  for (const message of result.logs) {
    console.error(message);
  }
  process.exit(1);
} else {
  writeFileSync(HASH_FILE, currentHash);
  console.log(`Build completed successfully! Generated ${result.outputs.length} files.`);
}
