import { existsSync, mkdirSync, rmSync, readdirSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { simpleGit } from "simple-git";

const PUBLIC_DIR = "public";
const DIST_DIR = "public/dist";
const COMMIT_HASH_FILE = path.join(DIST_DIR, ".commit-hash");

/**
 * Recursively copy static assets.
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
      // Exclude only .ts and .css files, as they will be built and minified by Bun.
      if (
        entry.name.endsWith(".ts") ||
        entry.name.endsWith(".css")
      ) {
        continue;
      }
      copyFileSync(srcPath, destPath);
    }
  }
}

const git = simpleGit();
const status = await git.status();
const isDirty = status.files.length > 0;

if (!isDirty) {
  const commitHash = await git.revparse(["HEAD"]);

  if (existsSync(COMMIT_HASH_FILE)) {
    const storedHash = readFileSync(COMMIT_HASH_FILE, "utf-8").trim();
    if (storedHash === commitHash) {
      console.log(`Commit ${commitHash} already built. Skipping.`);
      process.exit(0);
    }
    console.log(`Commit changed from ${storedHash} to ${commitHash}. Rebuilding.`);
  } else {
    console.log("No previous build hash found. Building fresh.");
  }
} else {
  console.log("Working tree is dirty. Cleaning and rebuilding.");
}

if (existsSync(DIST_DIR)) {
  rmSync(DIST_DIR, { recursive: true, force: true });
}
mkdirSync(DIST_DIR, { recursive: true });

console.log("Cleaning and copying static assets (including HTML templates)...");
copyRecursiveSync(PUBLIC_DIR, DIST_DIR);

const entrypoints = [
  ...new Bun.Glob("public/**/*.ts").scanSync(),
  ...new Bun.Glob("public/**/*.css").scanSync(),
];

console.log("Building, bundling, and minifying scripts and styles...");
const result = await Bun.build({
  entrypoints,
  outdir: DIST_DIR,
  root: PUBLIC_DIR,
  external: [
    "http",
    "https",
    "url",
    "fs",
    "JSZip",
    "*.png",
    "*.jpg",
    "*.jpeg",
    "*.gif",
    "*.svg",
    "*.webp",
    "*.woff",
    "*.woff2",
    "*.ttf",
    "*.eot"
  ],
  sourcemap: "linked",
  splitting: true,
  format: "esm",
  minify: false,
});

if (!result.success) {
  console.error("Build failed:");
  for (const message of result.logs) {
    console.error(message);
  }
  process.exit(1);
} else {
  console.log(`Build completed successfully! Generated ${result.outputs.length} files.`);

  if (!isDirty) {
    const commitHash = await git.revparse(["HEAD"]);
    writeFileSync(COMMIT_HASH_FILE, commitHash, "utf-8");
    console.log(`Stored build commit hash: ${commitHash}`);
  }
}
