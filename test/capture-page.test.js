const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");

function control(prefix, index, field, value) {
  return `<div data-cy="${prefix}[${index}].${field}"><input data-cy="${prefix}[${index}].${field}Input" value="${value}"></div>`;
}

function period(prefix, index, start, end) {
  return `<div data-cy="${prefix}[${index}].periodInput">
    <input data-cy="${prefix}[${index}].periodInputBegin" value="${start}">
    <span>至</span>
    <input data-cy="${prefix}[${index}].periodInputEnd" value="${end}">
  </div>`;
}

function setup() {
  const html = `<!doctype html><title>测试岗位申请</title><body>
    <div class="atsx-form-item"><label>邮箱</label><div data-cy="field-email"><input value="page@example.com"></div></div>
    <section class="createFormSection__v2">
      <div class="createFormSection-title">教育经历</div>
      <div class="resumeEditForm-item">
        ${control("education", 3, "school", "School A")}
        ${control("education", 3, "degree", "硕士")}
        ${control("education", 3, "fieldOfStudy", "人工智能")}
        ${period("education", 3, "2023年09月", "2026年06月")}
      </div>
      <div class="resumeEditForm-item">
        ${control("education", 7, "school", "School B")}
        ${control("education", 7, "degree", "本科")}
        ${period("education", 7, "2019-09", "2023-06")}
      </div>
    </section>
    <section class="createFormSection__v2">
      <div class="createFormSection-title">实习经历</div>
      <div class="resumeEditForm-item">
        ${control("internship", 2, "company", "Company A")}
        ${control("internship", 2, "title", "算法实习生")}
        ${control("internship", 2, "desc", "训练多模态模型")}
        ${period("internship", 2, "2025-01", "至今")}
      </div>
    </section>
    <section class="createFormSection__v2 createFormSection-empty">
      <div class="createFormSection-title">项目经历</div>
      <div class="createFormSection-addBtn__v2">添加</div>
    </section>
    <div class="atsx-form-item"><label>自我评价</label><textarea>认真可靠</textarea></div>
  </body>`;
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://tenant.jobs.feishu.cn/campus/resume/1/apply" });
  const { window } = dom;
  window.__MOKAHR_TEST__ = true;
  window.chrome = {
    runtime: {
      getManifest: () => ({ version: "0.7.0" }),
      sendMessage: async () => {},
      onMessage: { addListener() {} }
    },
    storage: { local: { get: async () => ({}) } }
  };
  window.HTMLElement.prototype.getClientRects = function () { return [{ width: 1, height: 1 }]; };
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.eval(fs.readFileSync(path.join(ROOT, "lib/core.js"), "utf8"));
  window.eval(fs.readFileSync(path.join(ROOT, "lib/profile-schema.js"), "utf8"));
  window.eval(fs.readFileSync(path.join(ROOT, "content.js"), "utf8"));
  return window;
}

test("captures repeat entries by real DOM index and reports page source", () => {
  const window = setup();
  const captured = window.__MOKAHR_TEST_API__.capturePage();

  assert.equal(captured.profile.basic.email, "page@example.com");
  assert.deepEqual(Array.from(captured.profile.education, (entry) => ({ ...entry })), [
    { startDate: "2023-09", endDate: "2026-06", school: "School A", degree: "硕士", major: "人工智能" },
    { startDate: "2019-09", endDate: "2023-06", school: "School B", degree: "本科" }
  ]);
  assert.deepEqual({ ...captured.profile.internship[0] }, {
    startDate: "2025-01",
    endDate: "至今",
    company: "Company A",
    title: "算法实习生",
    description: "训练多模态模型"
  });
  assert.deepEqual(Array.from(captured.capturedSections), ["education", "internship", "projects"]);
  assert.deepEqual(Array.from(captured.profile.projects), []);
  assert.equal(captured.profile.selfEvaluation, "认真可靠");
  assert.equal(captured.sourceTitle, "测试岗位申请");
  assert.equal(captured.sourceUrl, "https://tenant.jobs.feishu.cn/campus/resume/1/apply");
});

test("capture marks checked no-work experience as an explicit section clear", () => {
  const window = setup();
  window.document.body.insertAdjacentHTML("beforeend", `
    <section class="createFormSection__v2">
      <div class="createFormSection-title">工作经历</div>
      <label><input type="checkbox" checked>没有工作经历</label>
      <div class="resumeEditForm-item">${control("career", 0, "company", "Stale Company")}</div>
    </section>`);

  const captured = window.__MOKAHR_TEST_API__.capturePage();
  assert.deepEqual(Array.from(captured.profile.work), []);
  assert.deepEqual(Array.from(captured.clearedSections), ["work"]);
});

test("normalizes October through December without truncating the second digit", () => {
  const window = setup();
  const { normalizeDate } = window.__MOKAHR_TEST_API__;
  assert.equal(normalizeDate("2021-10"), "2021-10");
  assert.equal(normalizeDate("2021-11"), "2021-11");
  assert.equal(normalizeDate("2021-12"), "2021-12");
});

test("content script can start before React and detects the form as soon as it mounts", async () => {
  const dom = new JSDOM("<!doctype html><html><body><div id=app></div></body></html>", {
    runScripts: "outside-only",
    url: "https://tenant.jobs.feishu.cn/campus/resume/2/apply"
  });
  const { window } = dom;
  window.__MOKAHR_TEST__ = true;
  window.chrome = {
    runtime: {
      getManifest: () => ({ version: "0.7.0" }),
      sendMessage: async () => {},
      onMessage: { addListener() {} }
    },
    storage: { local: { get: async () => ({}) } }
  };
  window.eval(fs.readFileSync(path.join(ROOT, "lib/core.js"), "utf8"));
  window.eval(fs.readFileSync(path.join(ROOT, "lib/profile-schema.js"), "utf8"));
  window.eval(fs.readFileSync(path.join(ROOT, "content.js"), "utf8"));

  const api = window.__MOKAHR_TEST_API__;
  assert.equal(api.formReady(), false);
  const ready = api.waitForFormReady(Date.now() + 1000);
  window.document.getElementById("app").innerHTML = '<div class="atsx-form-item"><input></div>';
  assert.equal(await ready, true);
  assert.equal(api.formReady(), true);
});

test("required gaps accept a page-prefilled phone but keep truly empty gender and identification", () => {
  const window = setup();
  window.document.body.insertAdjacentHTML("afterbegin", `
    <script id="js-websiteInfo" type="application/json">${JSON.stringify({
      website_info: { resume_form_schema: { object_list: [{ children: [
        { attributes: { visible: true, required: true, field_type: { name: "mobile" }, i18n_name: "手机号码" } },
        { attributes: { visible: true, required: true, field_type: { name: "gender" }, i18n_name: "性别" } },
        { attributes: { visible: true, required: true, field_type: { name: "identification" }, i18n_name: "个人证件" } }
      ] }] } }
    })}</script>
    <div class="account-phoneNumber">+86 159-0000-0000</div>`);

  const gaps = window.__MOKAHR_TEST_API__.requiredProfileGaps(window.MokahrCore.mergeProfile());
  assert.deepEqual(Array.from(gaps), ["性别", "个人证件"]);
});
