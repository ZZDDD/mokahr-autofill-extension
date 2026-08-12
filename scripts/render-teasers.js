#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { spawn } = require("node:child_process");
const { JSDOM } = require("jsdom");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "docs", "images");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "mokahr-teasers-"));
const packageVersion = require(path.join(root, "package.json")).version;
const browserCandidates = [
  process.env.CHROME_BIN,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Chromium.app/Contents/MacOS/Chromium"
].filter(Boolean);
const browser = browserCandidates.find((candidate) => fs.existsSync(candidate));

if (!browser) throw new Error("Chrome, Edge, or Chromium is required to render screenshots");

function writeTemporary(name, html) {
  const file = path.join(temporary, name);
  fs.writeFileSync(file, html, "utf8");
  return file;
}

function render(htmlFile, destination, width, height) {
  const profile = path.join(temporary, `profile-${path.basename(destination, ".png")}`);
  fs.rmSync(destination, { force: true });
  return new Promise((resolve, reject) => {
    const child = spawn(browser, [
      "--headless=new",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-sync",
      "--no-first-run",
      "--hide-scrollbars",
      `--user-data-dir=${profile}`,
      `--window-size=${width},${height}`,
      "--force-device-scale-factor=1",
      "--virtual-time-budget=1500",
      `--screenshot=${destination}`,
      pathToFileURL(htmlFile).href
    ], { stdio: "ignore" });
    const deadline = Date.now() + 15000;
    let previousSize = 0;
    let screenshotReady = false;
    let terminationTimer = null;
    let renderError = null;
    let settled = false;
    function finish(error) {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    }
    const check = setInterval(() => {
      const size = fs.existsSync(destination) ? fs.statSync(destination).size : 0;
      if (size > 1000 && size === previousSize) {
        screenshotReady = true;
        clearInterval(check);
        child.kill("SIGTERM");
        terminationTimer = setTimeout(() => child.kill("SIGKILL"), 2000);
      } else if (Date.now() > deadline) {
        clearInterval(check);
        renderError = new Error(`Timed out rendering ${destination}`);
        child.kill("SIGTERM");
        terminationTimer = setTimeout(() => child.kill("SIGKILL"), 2000);
      }
      previousSize = size;
    }, 200);
    child.once("error", (error) => {
      clearInterval(check);
      if (terminationTimer) clearTimeout(terminationTimer);
      finish(error);
    });
    child.once("close", () => {
      clearInterval(check);
      if (terminationTimer) clearTimeout(terminationTimer);
      const renderedSize = fs.existsSync(destination) ? fs.statSync(destination).size : 0;
      if (screenshotReady || renderedSize > 1000) finish();
      else finish(renderError || new Error(`Browser exited before rendering ${destination}`));
    });
  });
}

function persistControlValues(document) {
  for (const input of document.querySelectorAll("input")) input.setAttribute("value", input.value);
  for (const textarea of document.querySelectorAll("textarea")) textarea.textContent = textarea.value;
}

const popupHtml = fs.readFileSync(path.join(root, "popup.html"), "utf8")
  .replace(/\s*<script[^>]+><\/script>/g, "")
  .replace("正在检查当前页面…", `已识别当前招聘申请页 · v${packageVersion}`)
  .replace('<div id="result" class="result" role="status" aria-live="polite"></div>',
    '<div id="result" class="result" role="status" aria-live="polite">资料已准备，可以开始填写当前页面。</div>');

const demoStorage = {
  profile: {
    version: 1,
    basic: {
      name: "示例用户",
      email: "hello@example.com",
      currentCity: "示例市",
      expectedLocation: "示例市"
    },
    education: [
      { school: "示例大学", degree: "本科", major: "计算机科学", startDate: "2022-09", endDate: "2026-06" },
      { school: "示例中学", degree: "高中", startDate: "2019-09", endDate: "2022-06" }
    ],
    work: [],
    internship: [
      { company: "示例科技公司", title: "软件工程实习生", startDate: "2025-03", endDate: "2025-08" }
    ],
    projects: [
      { nameOfItem: "课程助手", role: "开发者", startDate: "2024-10", endDate: "2025-02" },
      { nameOfItem: "校园检索工具", role: "项目负责人", startDate: "2025-03", endDate: "2025-07" }
    ],
    works: [],
    awards: [{ nameOfItem: "示例奖项", date: "2025" }],
    languages: [{ language: "英语", proficiency: "熟练" }],
    selfEvaluation: "关注工程质量，善于把复杂问题拆解成稳定、可验证的实现。",
    social: [],
    custom: {}
  },
  attachment: { name: "example-resume.pdf", type: "application/pdf", data: "AA==" },
  profileMetadata: {
    revision: 3,
    lastSavedAt: "2026-08-12T08:00:00.000Z",
    lastSaveMethod: "manual",
    lastSourceUrl: "https://example.jobs.feishu.cn/apply",
    lastSourceTitle: "示例算法工程师职位",
    lastSourceAt: "2026-08-12T07:30:00.000Z",
    counts: { education: 2, work: 0, internship: 1, projects: 2, works: 0, awards: 1, languages: 1, social: 0 }
  }
};
async function buildOptionsHtml() {
  const dom = new JSDOM(fs.readFileSync(path.join(root, "options.html"), "utf8"), {
    runScripts: "outside-only",
    url: "https://example.invalid/options.html"
  });
  const { window } = dom;
  window.chrome = {
    storage: {
      onChanged: { addListener() {}, removeListener() {} },
      local: {
        get: async () => demoStorage,
        set: async () => {},
        remove: async () => {}
      }
    },
    downloads: {
      download: async () => 1,
      search: async () => [],
      onChanged: { addListener() {}, removeListener() {} }
    }
  };
  window.eval(fs.readFileSync(path.join(root, "lib", "core.js"), "utf8"));
  window.eval(fs.readFileSync(path.join(root, "lib", "profile-schema.js"), "utf8"));
  window.eval(fs.readFileSync(path.join(root, "options.js"), "utf8"));
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  persistControlValues(window.document);
  window.document.getElementById("resume-status").remove();
  window.document.querySelector('.sidebar a[href="#resume-status"]').remove();
  window.document.querySelectorAll("script").forEach((script) => script.remove());
  return dom.serialize();
}

fs.mkdirSync(output, { recursive: true });
fs.copyFileSync(path.join(root, "styles.css"), path.join(temporary, "styles.css"));
(async () => {
  try {
    await render(writeTemporary("popup.html", popupHtml), path.join(output, "popup-teaser.png"), 350, 360);
    await render(writeTemporary("options.html", await buildOptionsHtml()), path.join(output, "options-teaser.png"), 1280, 900);
    console.log(`Created ${path.relative(root, path.join(output, "popup-teaser.png"))}`);
    console.log(`Created ${path.relative(root, path.join(output, "options-teaser.png"))}`);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
