import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(rootDir, "dist");
const packageName = "标签栏快照";
const extensionDir = join(distDir, packageName);
const zipPath = join(distDir, `${packageName}.zip`);
const crxPath = join(distDir, `${packageName}.crx`);
const pemPath = join(distDir, `${packageName}.pem`);
const sourceFiles = ["manifest.json", "popup.html", "popup.css", "popup.js", "README.md"];
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const assetDir = join(rootDir, "assets");

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    ...options
  });
}

function copyExtensionFiles() {
  rmSync(extensionDir, { recursive: true, force: true });
  mkdirSync(extensionDir, { recursive: true });

  for (const file of sourceFiles) {
    cpSync(join(rootDir, file), join(extensionDir, file));
  }

  cpSync(assetDir, join(extensionDir, "assets"), { recursive: true });
}

function ensureIcons() {
  if (!existsSync(chromePath)) {
    throw new Error("未找到 Google Chrome，无法导出无留白 PNG 图标。");
  }

  const svgPath = join(assetDir, "icon.svg");
  const renderHtmlPath = join(distDir, "icon-render.html");
  const sizes = [16, 32, 48, 128];

  for (const size of sizes) {
    const pngPath = join(assetDir, `icon-${size}.png`);
    rmSync(pngPath, { force: true });
    writeFileSync(
      renderHtmlPath,
      `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      html, body {
        width: ${size}px;
        height: ${size}px;
        margin: 0;
        overflow: hidden;
        background: transparent;
      }

      img {
        display: block;
        width: ${size}px;
        height: ${size}px;
      }
    </style>
  </head>
  <body>
    <img src="${pathToFileURL(svgPath).href}" alt="">
  </body>
</html>
`
    );

    run(
      chromePath,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--disable-background-networking",
        "--force-device-scale-factor=1",
        "--default-background-color=00000000",
        `--window-size=${size},${size}`,
        `--screenshot=${pngPath}`,
        pathToFileURL(renderHtmlPath).href
      ],
      { stdio: "ignore" }
    );
  }

  rmSync(renderHtmlPath, { force: true });
}

function createZip() {
  rmSync(zipPath, { force: true });
  run("zip", ["-r", zipPath, "."], { cwd: extensionDir });
}

function createCrx() {
  if (!existsSync(chromePath)) {
    console.warn("未找到 Google Chrome，已跳过 .crx 打包。");
    return;
  }

  rmSync(crxPath, { force: true });

  const args = [`--pack-extension=${extensionDir}`];
  if (existsSync(pemPath)) {
    args.push(`--pack-extension-key=${pemPath}`);
  }

  run(chromePath, args);
}

mkdirSync(distDir, { recursive: true });
ensureIcons();
copyExtensionFiles();
createZip();
createCrx();

console.log("\n打包完成：");
console.log(`- ${zipPath}`);
if (existsSync(crxPath)) {
  console.log(`- ${crxPath}`);
}
if (existsSync(pemPath)) {
  console.log(`- ${pemPath}`);
}
