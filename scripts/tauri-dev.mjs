import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 5174;
const devUrl = `http://${host}:${port}/`;

function exists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function latestDirectory(parent) {
  if (!exists(parent)) return null;
  const dirs = fs
    .readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  return dirs[0] ? path.join(parent, dirs[0]) : null;
}

function withWindowsBuildEnv(baseEnv) {
  if (process.platform !== "win32") return baseEnv;

  const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  const userProfile = process.env.USERPROFILE;
  const vsTools = latestDirectory(
    path.join(programFilesX86, "Microsoft Visual Studio", "2022", "BuildTools", "VC", "Tools", "MSVC"),
  );
  const sdkRoot = path.join(programFilesX86, "Windows Kits", "10");
  const sdkVersion = latestDirectory(path.join(sdkRoot, "Lib"));

  if (!vsTools || !sdkVersion) return baseEnv;

  const env = { ...baseEnv };
  const sdkVer = path.basename(sdkVersion);
  const sdkBin = path.join(sdkRoot, "bin", sdkVer, "x64");

  env.PATH = [
    path.join(vsTools, "bin", "Hostx64", "x64"),
    sdkBin,
    path.join(sdkRoot, "bin", "x64"),
    userProfile ? path.join(userProfile, ".cargo", "bin") : null,
    path.dirname(process.execPath),
    env.PATH,
  ]
    .filter(Boolean)
    .join(path.delimiter);

  env.LIB = [
    path.join(vsTools, "lib", "x64"),
    path.join(sdkRoot, "Lib", sdkVer, "um", "x64"),
    path.join(sdkRoot, "Lib", sdkVer, "ucrt", "x64"),
    env.LIB,
  ]
    .filter(Boolean)
    .join(path.delimiter);

  env.LIBPATH = [
    path.join(vsTools, "lib", "x64"),
    path.join(sdkRoot, "UnionMetadata", sdkVer),
    path.join(sdkRoot, "References", sdkVer),
    env.LIBPATH,
  ]
    .filter(Boolean)
    .join(path.delimiter);

  env.INCLUDE = [
    path.join(vsTools, "include"),
    path.join(sdkRoot, "Include", sdkVer, "ucrt"),
    path.join(sdkRoot, "Include", sdkVer, "um"),
    path.join(sdkRoot, "Include", sdkVer, "shared"),
    path.join(sdkRoot, "Include", sdkVer, "winrt"),
    path.join(sdkRoot, "Include", sdkVer, "cppwinrt"),
    env.INCLUDE,
  ]
    .filter(Boolean)
    .join(path.delimiter);

  return env;
}

function canReachDevServer() {
  return new Promise((resolve) => {
    const request = http.get(devUrl, (response) => {
      response.resume();
      resolve(true);
    });
    request.on("error", () => resolve(false));
    request.setTimeout(800, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForDevServer() {
  for (let i = 0; i < 60; i += 1) {
    if (await canReachDevServer()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Vite dev server did not become ready at ${devUrl}`);
}

function spawnChild(command, args, options = {}) {
  return spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    ...options,
  });
}

const nodeBin = process.execPath;
let viteProcess = null;

if (!(await canReachDevServer())) {
  const viteCli = path.join(root, "node_modules", "vite", "bin", "vite.js");
  viteProcess = spawnChild(nodeBin, [viteCli, "--host", host, "--port", String(port)]);
  await waitForDevServer();
}

const tauriCli = path.join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");
const tauriProcess = spawnChild(nodeBin, [tauriCli, "dev"], {
  env: withWindowsBuildEnv(process.env),
});

function cleanup() {
  if (viteProcess && !viteProcess.killed) viteProcess.kill();
}

process.on("SIGINT", () => {
  cleanup();
  tauriProcess.kill("SIGINT");
});

process.on("SIGTERM", () => {
  cleanup();
  tauriProcess.kill("SIGTERM");
});

tauriProcess.on("exit", (code) => {
  cleanup();
  process.exit(code ?? 0);
});
