const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");
const plain = (value) => JSON.parse(JSON.stringify(value));

async function setup(stored = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(ROOT, "options.html"), "utf8"), {
    runScripts: "outside-only",
    url: "chrome-extension://test/options.html"
  });
  const { window } = dom;
  const writes = [];
  const removed = [];
  const downloadRequests = [];
  const storageListeners = [];
  window.__MOKAHR_TEST__ = true;
  window.chrome = {
    storage: {
      onChanged: {
        addListener: (listener) => storageListeners.push(listener),
        removeListener: (listener) => {
          const index = storageListeners.indexOf(listener);
          if (index >= 0) storageListeners.splice(index, 1);
        }
      },
      local: {
        get: async () => stored,
        set: async (value) => { writes.push(value); },
        remove: async (key) => { removed.push(key); }
      }
    },
    downloads: {
      download: async (request) => { downloadRequests.push(request); return 1; },
      search: async () => [{ id: 1, state: "complete", filename: "/Users/test/Downloads/mokahr-profile.json" }],
      onChanged: { addListener() {}, removeListener() {} }
    }
  };
  window.URL.createObjectURL = () => "blob:test";
  window.URL.revokeObjectURL = () => {};
  window.__testState = {
    writes,
    removed,
    downloadRequests,
    dispatchStorageChanges(changes, areaName = "local") {
      for (const listener of storageListeners) listener(changes, areaName);
    }
  };
  window.eval(fs.readFileSync(path.join(ROOT, "lib/core.js"), "utf8"));
  window.eval(fs.readFileSync(path.join(ROOT, "lib/profile-schema.js"), "utf8"));
  window.eval(fs.readFileSync(path.join(ROOT, "options.js"), "utf8"));
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  return window;
}

test("structured editor renders and collects every repeatable resume section", async () => {
  const profile = {
    basic: { name: "Ada", email: "ada@example.com" },
    education: [{ school: "School A", degree: "硕士" }, { school: "School B", degree: "本科" }],
    internship: [{ company: "Company A", title: "实习生" }],
    projects: [{ nameOfItem: "Project A" }, { nameOfItem: "Project B" }],
    works: [{ link: "https://example.com/work" }],
    awards: [{ nameOfItem: "Award" }],
    languages: [{ language: "英语", proficiency: "熟练" }],
    social: [{ platform: "GitHub", link: "https://github.com/ada" }],
    selfEvaluation: "可靠",
    custom: { "可入职时间": "随时" }
  };
  const window = await setup({ profile });
  const api = window.__MOKAHR_OPTIONS_TEST_API__;

  assert.equal(window.document.querySelectorAll('[data-section="education"] .resume-entry').length, 2);
  assert.equal(window.document.querySelectorAll('[data-section="projects"] .resume-entry').length, 2);
  assert.equal(window.document.querySelectorAll(".repeat-section").length, 8);
  assert.deepEqual(plain(api.collect()), plain(window.MokahrCore.mergeProfile(profile)));
});

test("save receipt names the internal destination and persists metadata", async () => {
  const window = await setup({ profile: { basic: { name: "Before" } } });
  const name = window.document.querySelector('[name="name"]');
  name.value = "After";
  name.dispatchEvent(new window.Event("input", { bubbles: true }));
  window.document.getElementById("save").click();
  await new Promise((resolve) => window.setTimeout(resolve, 0));

  const write = window.__testState.writes.at(-1);
  assert.equal(write.profile.basic.name, "After");
  assert.equal(write.profileMetadata.lastSaveMethod, "manual");
  assert.match(window.document.getElementById("receipt-detail").textContent, /chrome\.storage\.local \/ profile/);
  assert.equal(window.document.getElementById("save-state").textContent, "本地简历已保存");
});

test("import and export receipts expose the available source and destination", async () => {
  const window = await setup({ profile: { basic: { name: "Stored" } } });
  const input = window.document.getElementById("import-file");
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [{ name: "source-profile.json", text: async () => JSON.stringify({ basic: { name: "Imported" } }) }]
  });
  input.dispatchEvent(new window.Event("change", { bubbles: true }));
  await new Promise((resolve) => window.setTimeout(resolve, 0));

  assert.equal(window.__testState.writes.at(-1).profile.basic.name, "Imported");
  assert.match(window.document.getElementById("receipt-detail").textContent, /source-profile\.json/);
  assert.match(window.document.getElementById("receipt-detail").textContent, /源文件夹路径不可读取/);

  window.document.getElementById("export").click();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  assert.equal(window.__testState.downloadRequests.at(-1).saveAs, true);
  assert.match(window.document.getElementById("receipt-detail").textContent, /\/Users\/test\/Downloads\/mokahr-profile\.json/);
  assert.equal(window.__testState.writes.at(-1).profileMetadata.lastExportPath, "/Users/test/Downloads/mokahr-profile.json");
});

test("add and remove controls keep repeat entries independent", async () => {
  const window = await setup({ profile: { education: [{ school: "School A" }] } });
  const section = window.document.querySelector('[data-section="education"]');

  section.querySelector(".add-entry").click();
  const entries = section.querySelectorAll(".resume-entry");
  entries[1].querySelector('[data-field="school"]').value = "School B";
  assert.deepEqual(plain(window.__MOKAHR_OPTIONS_TEST_API__.collect().education), [
    { school: "School A" },
    { school: "School B" }
  ]);

  entries[0].querySelector(".remove-entry").click();
  assert.deepEqual(plain(window.__MOKAHR_OPTIONS_TEST_API__.collect().education), [{ school: "School B" }]);
  assert.equal(section.querySelector(".section-count").textContent, "1 条");
});

test("status panel exposes storage, source, attachment and section counts", async () => {
  const window = await setup({
    profile: { education: [{ school: "School A" }], projects: [{ nameOfItem: "P" }] },
    attachment: { name: "resume.pdf", data: "AA==" },
    profileMetadata: {
      revision: 5,
      lastSavedAt: "2026-08-12T08:00:00.000Z",
      lastSaveMethod: "capture",
      lastSourceUrl: "https://tenant.jobs.feishu.cn/apply",
      lastSourceTitle: "算法工程师",
      lastImportFileName: "source.json",
      lastExportFileName: "mokahr-profile.json",
      lastExportPath: "/Users/test/Downloads/mokahr-profile.json"
    }
  });

  assert.equal(window.document.getElementById("revision-badge").textContent, "版本 5");
  assert.match(window.document.getElementById("last-source").textContent, /算法工程师/);
  assert.match(window.document.getElementById("last-export").textContent, /\/Users\/test\/Downloads\/mokahr-profile\.json/);
  assert.equal(window.document.getElementById("status-attachment").textContent, "resume.pdf");
  assert.match(window.document.getElementById("section-counts").textContent, /教育经历 1/);
  assert.match(window.document.getElementById("section-counts").textContent, /项目经历 1/);
});

test("complete structured profile survives an editor round trip", async () => {
  const profile = {
    basic: { name: "Example User", email: "user@example.com" },
    education: [{ school: "Example University", degree: "本科", major: "计算机科学" }],
    work: [{ company: "Example Technology", title: "工程师" }],
    internship: [{ company: "Example Laboratory", title: "研究实习生" }],
    projects: [{ nameOfItem: "Example Project", role: "负责人" }],
    works: [{ link: "https://example.com/portfolio" }],
    awards: [{ nameOfItem: "Example Award", date: "2025" }],
    languages: [{ language: "英语", proficiency: "熟练" }],
    social: [{ platform: "GitHub", link: "https://github.com/example-user" }],
    selfEvaluation: "Example profile for automated testing.",
    custom: { "可入职时间": "一个月内" }
  };
  const window = await setup({ profile });
  const collected = plain(window.__MOKAHR_OPTIONS_TEST_API__.collect());

  assert.deepEqual(collected, plain(window.MokahrCore.mergeProfile(profile)));
  assert.equal(collected.education.length, 1);
  assert.equal(collected.internship.length, 1);
  assert.equal(collected.projects.length, 1);
});

test("external reverse capture replaces stale editor state before the next save", async () => {
  const window = await setup({
    profile: { basic: { name: "Stored Name" }, education: [{ school: "Stored School" }] },
    profileMetadata: { revision: 1, lastSaveMethod: "manual" }
  });
  const staleName = window.document.querySelector('[name="name"]');
  staleName.value = "Unsaved Stale Name";
  staleName.dispatchEvent(new window.Event("input", { bubbles: true }));

  const capturedProfile = window.MokahrCore.mergeProfile({
    basic: { name: "Captured Name" },
    education: [{ school: "Captured School" }, { school: "New School" }]
  });
  const capturedMetadata = {
    revision: 2,
    lastSavedAt: "2026-08-12T09:00:00.000Z",
    lastSaveMethod: "capture",
    lastSourceUrl: "https://example.jobs.feishu.cn/apply",
    lastSourceTitle: "Example Role"
  };
  window.__testState.dispatchStorageChanges({
    profile: { oldValue: {}, newValue: capturedProfile },
    profileMetadata: { oldValue: {}, newValue: capturedMetadata }
  });

  assert.equal(window.document.querySelector('[name="name"]').value, "Captured Name");
  assert.equal(window.document.querySelectorAll('[data-section="education"] .resume-entry').length, 2);
  assert.deepEqual(plain(window.__MOKAHR_OPTIONS_TEST_API__.collect()), plain(capturedProfile));
  assert.match(window.document.getElementById("receipt-detail").textContent, /未保存编辑已被替换/);
  assert.equal(window.document.getElementById("revision-badge").textContent, "版本 2");

  window.document.getElementById("save").click();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  assert.equal(window.__testState.writes.at(-1).profile.basic.name, "Captured Name");
  assert.equal(window.__testState.writes.at(-1).profile.education[0].school, "Captured School");
});

test("management-page writes do not trigger an external-sync refresh", async () => {
  const window = await setup({ profile: { basic: { name: "Before" } } });
  const name = window.document.querySelector('[name="name"]');
  name.value = "After";
  name.dispatchEvent(new window.Event("input", { bubbles: true }));
  window.document.getElementById("save").click();
  await new Promise((resolve) => window.setTimeout(resolve, 0));

  const write = window.__testState.writes.at(-1);
  window.__testState.dispatchStorageChanges({
    profile: { oldValue: {}, newValue: write.profile },
    profileMetadata: { oldValue: {}, newValue: write.profileMetadata }
  });
  assert.equal(window.document.getElementById("receipt-title").textContent, "保存完成");
});

test("capture metadata refreshes stale edits when the stored profile value did not change", async () => {
  const window = await setup({
    profile: { basic: { name: "Stored Name" } },
    profileMetadata: { revision: 1, lastSaveMethod: "manual" }
  });
  const name = window.document.querySelector('[name="name"]');
  name.value = "Unsaved Stale Name";
  name.dispatchEvent(new window.Event("input", { bubbles: true }));

  window.__testState.dispatchStorageChanges({
    profileMetadata: {
      oldValue: { revision: 1, lastSaveMethod: "manual" },
      newValue: { revision: 2, lastSaveMethod: "capture", lastSavedAt: "2026-08-12T09:00:00.000Z" }
    }
  });

  assert.equal(window.document.querySelector('[name="name"]').value, "Stored Name");
  assert.match(window.document.getElementById("receipt-detail").textContent, /未保存编辑已被替换/);
  assert.equal(window.document.getElementById("revision-badge").textContent, "版本 2");
});

test("repeat section navigation uses a dedicated vertical grid", async () => {
  const window = await setup();
  const repeatNav = window.document.getElementById("repeat-nav");
  const stylesheet = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

  assert.equal(repeatNav.querySelectorAll("a").length, 8);
  assert.match(stylesheet, /\.sidebar #repeat-nav\s*\{\s*display:\s*grid;\s*gap:\s*4px;/);
});
