const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");

async function setup() {
  const dom = new JSDOM(fs.readFileSync(path.join(ROOT, "popup.html"), "utf8"), {
    runScripts: "outside-only",
    url: "chrome-extension://test/popup.html"
  });
  const { window } = dom;
  window.__MOKAHR_TEST__ = true;
  const writes = [];
  const stored = {
    profile: {
      basic: { name: "Stored Name", email: "old@example.com" },
      education: [{ school: "Old School" }],
      work: [{ company: "Stale Company" }],
      internship: [{ company: "Keep Company" }],
      projects: [{ nameOfItem: "Keep Project" }]
    },
    profileMetadata: { revision: 2 }
  };
  window.chrome = {
    runtime: {
      getManifest: () => ({ version: "0.7.0" }),
      onMessage: { addListener() {} },
      openOptionsPage() {}
    },
    tabs: {
      query: async () => [{ id: 42, url: "https://tenant.jobs.feishu.cn/resume/1/apply" }],
      sendMessage: async (_id, message) => {
        if (message.type === "ping") return { ok: true, version: "0.7.0" };
        if (message.type === "capture") return {
          profile: {
            basic: { name: "", email: "new@example.com" },
            education: [{ school: "New School" }, { school: "Second School" }],
            work: [],
            internship: [],
            projects: []
          },
          capturedSections: ["education", "work", "internship"],
          clearedSections: ["work"],
          sourceUrl: "https://tenant.jobs.feishu.cn/resume/1/apply",
          sourceTitle: "算法工程师",
          capturedAt: "2026-08-12T08:00:00.000Z"
        };
        throw new Error("unexpected message");
      }
    },
    storage: {
      local: {
        get: async () => stored,
        set: async (value) => { writes.push(value); }
      }
    }
  };
  window.eval(fs.readFileSync(path.join(ROOT, "lib/core.js"), "utf8"));
  window.eval(fs.readFileSync(path.join(ROOT, "lib/profile-schema.js"), "utf8"));
  window.eval(fs.readFileSync(path.join(ROOT, "popup.js"), "utf8"));
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  return { window, writes };
}

test("popup capture writes repeat entries and source metadata without clearing blank sections", async () => {
  const { window, writes } = await setup();
  window.document.getElementById("capture").click();
  await new Promise((resolve) => window.setTimeout(resolve, 0));

  const update = writes.at(-1);
  assert.equal(update.profile.basic.name, "Stored Name");
  assert.equal(update.profile.basic.email, "new@example.com");
  assert.deepEqual(JSON.parse(JSON.stringify(update.profile.education)), [
    { school: "New School" },
    { school: "Second School" }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(update.profile.internship)), [{ company: "Keep Company" }]);
  assert.deepEqual(JSON.parse(JSON.stringify(update.profile.projects)), [{ nameOfItem: "Keep Project" }]);
  assert.deepEqual(JSON.parse(JSON.stringify(update.profile.work)), []);
  assert.equal(update.profileMetadata.revision, 3);
  assert.equal(update.profileMetadata.lastSourceUrl, "https://tenant.jobs.feishu.cn/resume/1/apply");
  assert.equal(update.profileMetadata.lastSourceAt, "2026-08-12T08:00:00.000Z");
  assert.match(window.document.getElementById("result").textContent, /教育经历 2 条/);
  assert.match(window.document.getElementById("result").textContent, /chrome\.storage\.local \/ profile/);
});

test("supported Edge page keeps actions enabled while the early content-script connection is pending", async () => {
  const dom = new JSDOM(fs.readFileSync(path.join(ROOT, "popup.html"), "utf8"), {
    runScripts: "outside-only",
    url: "chrome-extension://test/popup.html"
  });
  const { window } = dom;
  window.__MOKAHR_TEST__ = true;
  window.chrome = {
    runtime: {
      getManifest: () => ({ version: "0.7.0" }),
      onMessage: { addListener() {} },
      openOptionsPage() {}
    },
    tabs: {
      query: async () => [{ id: 42, url: "https://tenant.jobs.feishu.cn/resume/1/apply" }],
      sendMessage: async () => { throw new Error("Receiving end does not exist yet"); }
    },
    storage: { local: { get: async () => ({}), set: async () => {} } }
  };
  window.eval(fs.readFileSync(path.join(ROOT, "lib/core.js"), "utf8"));
  window.eval(fs.readFileSync(path.join(ROOT, "lib/profile-schema.js"), "utf8"));
  window.eval(fs.readFileSync(path.join(ROOT, "popup.js"), "utf8"));
  await new Promise((resolve) => window.setTimeout(resolve, 250));

  assert.equal(window.document.getElementById("fill").disabled, false);
  assert.equal(window.document.getElementById("capture").disabled, false);
  assert.match(window.document.getElementById("page-status").textContent, /申请页正在加载/);
});

test("popup blocks an application tab that is still running the previous content-script version", async () => {
  const dom = new JSDOM(fs.readFileSync(path.join(ROOT, "popup.html"), "utf8"), {
    runScripts: "outside-only",
    url: "chrome-extension://test/popup.html"
  });
  const { window } = dom;
  window.__MOKAHR_TEST__ = true;
  window.chrome = {
    runtime: {
      getManifest: () => ({ version: "0.7.0" }),
      onMessage: { addListener() {} },
      openOptionsPage() {}
    },
    tabs: {
      query: async () => [{ id: 42, url: "https://tenant.jobs.feishu.cn/resume/1/apply" }],
      sendMessage: async () => ({ ok: true, version: "0.6.6" })
    },
    storage: { local: { get: async () => ({}), set: async () => {} } }
  };
  window.eval(fs.readFileSync(path.join(ROOT, "lib/core.js"), "utf8"));
  window.eval(fs.readFileSync(path.join(ROOT, "lib/profile-schema.js"), "utf8"));
  window.eval(fs.readFileSync(path.join(ROOT, "popup.js"), "utf8"));
  await new Promise((resolve) => window.setTimeout(resolve, 0));

  assert.equal(window.document.getElementById("fill").disabled, true);
  assert.equal(window.document.getElementById("capture").disabled, true);
  assert.match(window.document.getElementById("page-status").textContent, /v0\.7\.0/);
  assert.match(window.document.getElementById("page-status").textContent, /刷新当前申请页/);
});

test("custom-domain application page is detected and receives a temporary content-script injection", async () => {
  const dom = new JSDOM(fs.readFileSync(path.join(ROOT, "popup.html"), "utf8"), {
    runScripts: "outside-only",
    url: "chrome-extension://test/popup.html"
  });
  const { window } = dom;
  window.__MOKAHR_TEST__ = true;
  let injected = false;
  const executions = [];
  window.chrome = {
    runtime: {
      getManifest: () => ({ version: "0.7.0" }),
      onMessage: { addListener() {} },
      openOptionsPage() {}
    },
    tabs: {
      query: async () => [{ id: 42, url: "https://careers.example.com/index/resume/123/apply" }],
      sendMessage: async (_id, message) => {
        if (!injected) throw new Error("Receiving end does not exist");
        if (message.type === "ping") return { ok: true, version: "0.7.0" };
        throw new Error("unexpected message");
      }
    },
    scripting: {
      executeScript: async (details) => {
        executions.push(details);
        if (details.func) {
          const page = new JSDOM(
            '<!doctype html><script id="js-websiteInfo" type="text/json">{"website_info":{"resume_form_schema":{"object_list":[]}}}</script>',
            { runScripts: "outside-only", url: "https://careers.example.com/index/resume/123/apply" }
          );
          return [{ result: page.window.eval(`(${details.func.toString()})()`) }];
        }
        assert.deepEqual(Array.from(details.files), ["lib/core.js", "lib/profile-schema.js", "content.js"]);
        injected = true;
        return [];
      }
    },
    storage: { local: { get: async () => ({}), set: async () => {} } }
  };
  window.eval(fs.readFileSync(path.join(ROOT, "lib/core.js"), "utf8"));
  window.eval(fs.readFileSync(path.join(ROOT, "lib/profile-schema.js"), "utf8"));
  window.eval(fs.readFileSync(path.join(ROOT, "popup.js"), "utf8"));
  await new Promise((resolve) => window.setTimeout(resolve, 0));

  assert.equal(executions.length, 2);
  assert.equal(executions[0].target.tabId, 42);
  assert.equal(window.document.getElementById("fill").disabled, false);
  assert.equal(window.document.getElementById("capture").disabled, false);
  assert.match(window.document.getElementById("page-status").textContent, /已识别当前招聘申请页/);
});

test("unrelated web page stays disabled without requesting script injection", async () => {
  const dom = new JSDOM(fs.readFileSync(path.join(ROOT, "popup.html"), "utf8"), {
    runScripts: "outside-only",
    url: "chrome-extension://test/popup.html"
  });
  const { window } = dom;
  window.__MOKAHR_TEST__ = true;
  let executions = 0;
  window.chrome = {
    runtime: {
      getManifest: () => ({ version: "0.7.0" }),
      onMessage: { addListener() {} },
      openOptionsPage() {}
    },
    tabs: {
      query: async () => [{ id: 42, url: "https://example.com/account" }],
      sendMessage: async () => { throw new Error("must not connect"); }
    },
    scripting: { executeScript: async () => { executions += 1; } },
    storage: { local: { get: async () => ({}), set: async () => {} } }
  };
  window.eval(fs.readFileSync(path.join(ROOT, "lib/core.js"), "utf8"));
  window.eval(fs.readFileSync(path.join(ROOT, "lib/profile-schema.js"), "utf8"));
  window.eval(fs.readFileSync(path.join(ROOT, "popup.js"), "utf8"));
  await new Promise((resolve) => window.setTimeout(resolve, 0));

  assert.equal(executions, 0);
  assert.equal(window.document.getElementById("fill").disabled, true);
  assert.equal(window.document.getElementById("capture").disabled, true);
  assert.match(window.document.getElementById("page-status").textContent, /请打开 Mokahr/);
});

test("custom application-shaped URL without Feishu recruiting markers is rejected", async () => {
  const dom = new JSDOM(fs.readFileSync(path.join(ROOT, "popup.html"), "utf8"), {
    runScripts: "outside-only",
    url: "chrome-extension://test/popup.html"
  });
  const { window } = dom;
  window.__MOKAHR_TEST__ = true;
  let fileInjections = 0;
  window.chrome = {
    runtime: {
      getManifest: () => ({ version: "0.7.0" }),
      onMessage: { addListener() {} },
      openOptionsPage() {}
    },
    tabs: {
      query: async () => [{ id: 42, url: "https://example.com/index/resume/123/apply" }],
      sendMessage: async () => { throw new Error("Receiving end does not exist"); }
    },
    scripting: {
      executeScript: async (details) => {
        if (details.files) {
          fileInjections += 1;
          return [];
        }
        const page = new JSDOM("<!doctype html><title>Unrelated form</title>", {
          runScripts: "outside-only",
          url: "https://example.com/index/resume/123/apply"
        });
        return [{ result: page.window.eval(`(${details.func.toString()})()`) }];
      }
    },
    storage: { local: { get: async () => ({}), set: async () => {} } }
  };
  window.eval(fs.readFileSync(path.join(ROOT, "lib/core.js"), "utf8"));
  window.eval(fs.readFileSync(path.join(ROOT, "lib/profile-schema.js"), "utf8"));
  window.eval(fs.readFileSync(path.join(ROOT, "popup.js"), "utf8"));
  await new Promise((resolve) => window.setTimeout(resolve, 0));

  assert.equal(fileInjections, 0);
  assert.equal(window.document.getElementById("fill").disabled, true);
  assert.equal(window.document.getElementById("capture").disabled, true);
  assert.match(window.document.getElementById("page-status").textContent, /不是可识别/);
});

test("opening the popup and immediately capturing shares one custom-domain injection", async () => {
  const dom = new JSDOM(fs.readFileSync(path.join(ROOT, "popup.html"), "utf8"), {
    runScripts: "outside-only",
    url: "chrome-extension://test/popup.html"
  });
  const { window } = dom;
  window.__MOKAHR_TEST__ = true;
  let injected = false;
  let detections = 0;
  let fileInjections = 0;
  let releaseDetection;
  const detectionGate = new Promise((resolve) => { releaseDetection = resolve; });
  window.chrome = {
    runtime: {
      getManifest: () => ({ version: "0.7.0" }),
      onMessage: { addListener() {} },
      openOptionsPage() {}
    },
    tabs: {
      query: async () => [{ id: 42, url: "https://careers.example.com/index/resume/123/apply" }],
      sendMessage: async (_id, message) => {
        if (!injected) throw new Error("Receiving end does not exist");
        if (message.type === "ping") return { ok: true, version: "0.7.0" };
        if (message.type === "capture") return {
          profile: {},
          capturedSections: [],
          clearedSections: [],
          sourceUrl: "https://careers.example.com/index/resume/123/apply",
          sourceTitle: "Example role",
          capturedAt: "2026-08-12T08:00:00.000Z"
        };
        throw new Error("unexpected message");
      }
    },
    scripting: {
      executeScript: async (details) => {
        if (details.func) {
          detections += 1;
          await detectionGate;
          return [{ result: true }];
        }
        fileInjections += 1;
        injected = true;
        return [];
      }
    },
    storage: { local: { get: async () => ({}), set: async () => {} } }
  };
  window.eval(fs.readFileSync(path.join(ROOT, "lib/core.js"), "utf8"));
  window.eval(fs.readFileSync(path.join(ROOT, "lib/profile-schema.js"), "utf8"));
  window.eval(fs.readFileSync(path.join(ROOT, "popup.js"), "utf8"));
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  window.document.getElementById("capture").click();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  releaseDetection();
  await new Promise((resolve) => window.setTimeout(resolve, 10));

  assert.equal(detections, 1);
  assert.equal(fileInjections, 1);
  assert.match(window.document.getElementById("result").textContent, /已从“Example role”更新/);
});

test("manifest uses active-tab access for custom domains instead of all-site host access", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  assert.ok(manifest.permissions.includes("activeTab"));
  assert.ok(manifest.permissions.includes("scripting"));
  assert.ok(!manifest.host_permissions.includes("<all_urls>"));
  assert.ok(!manifest.content_scripts[0].matches.includes("<all_urls>"));
});
