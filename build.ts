import { existsSync, mkdirSync, rmSync, readdirSync, copyFileSync } from "node:fs";
import path from "node:path";

const PUBLIC_DIR = "public";
const DIST_DIR = "public/dist";

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

if (existsSync(DIST_DIR)) {
  rmSync(DIST_DIR, { recursive: true, force: true });
}
mkdirSync(DIST_DIR, { recursive: true });

console.log("Cleaning and copying static assets...");
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
});

if (!result.success) {
  console.error("Build failed:");
  for (const message of result.logs) {
    console.error(message);
  }
  process.exit(1);
} else {
  console.log(`Build completed successfully! Generated ${result.outputs.length} files.`);
}
