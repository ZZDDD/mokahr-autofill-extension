const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");

function row(prefix, index, field) {
  return `
    <div class="resumeEditForm-item">
      <div data-cy="${prefix}[${index}].${field}">
        <input data-cy="${prefix}[${index}].${field}Input">
      </div>
    </div>`;
}

function section(title, prefix, field, initialCount) {
  const rows = Array.from({ length: initialCount }, (_, index) => row(prefix, index, field)).join("");
  const addClass = initialCount ? "formOperate-addBtn" : "createFormSection-addBtn__v2";
  return `
    <div class="createFormSection__test${initialCount ? "" : " createFormSection-empty"}" data-prefix="${prefix}" data-field="${field}">
      <div class="createFormSection-title"><span>${title}</span></div>
      <div class="rows">${rows}</div>
      <div class="${addClass}"><span>添加</span></div>
    </div>`;
}

function setup() {
  const html = [
    section("教育经历", "education", "school", 1),
    section("实习经历", "internship", "company", 0),
    section("项目经历", "project", "name", 1)
  ].join("");
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`, { runScripts: "outside-only", url: "https://example.jobs.feishu.cn/resume/1/apply" });
  const { window } = dom;
  window.__MOKAHR_TEST__ = true;
  window.chrome = {
    runtime: { getManifest: () => ({ version: "0.7.0" }), sendMessage: async () => {}, onMessage: { addListener() {} } },
    storage: { local: { get: async () => ({}) } }
  };
  window.HTMLElement.prototype.getClientRects = function () { return [{ width: 1, height: 1 }]; };
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.eval(fs.readFileSync(path.join(ROOT, "lib/core.js"), "utf8"));
  window.eval(fs.readFileSync(path.join(ROOT, "lib/profile-schema.js"), "utf8"));
  window.eval(fs.readFileSync(path.join(ROOT, "content.js"), "utf8"));

  for (const sectionElement of window.document.querySelectorAll(".createFormSection__test")) {
    sectionElement.querySelector('.formOperate-addBtn, [class*="createFormSection-addBtn"]').addEventListener("click", () => {
      const prefix = sectionElement.dataset.prefix;
      const field = sectionElement.dataset.field;
      const rows = sectionElement.querySelector(".rows");
      const indices = Array.from(rows.querySelectorAll("[data-cy]"))
        .map((element) => Number(element.dataset.cy.match(/\[(\d+)\]/)?.[1]))
        .filter(Number.isFinite);
      const nextIndex = indices.length ? Math.max(...indices) + 1 : 0;
      rows.insertAdjacentHTML("beforeend", row(prefix, nextIndex, field));
      sectionElement.classList.remove("createFormSection-empty");
      const add = sectionElement.querySelector('[class*="createFormSection-addBtn"]');
      if (add) add.className = "formOperate-addBtn";
    });
  }
  return window;
}

test("creates and fills every repeatable education, internship and project row", async () => {
  const window = setup();
  const api = window.__MOKAHR_TEST_API__;
  const report = { filled: [], skipped: [], ignored: [] };
  const profile = {
    education: [{ school: "School A" }, { school: "School B" }],
    internship: [{ company: "Company A" }, { company: "Company B" }],
    projects: Array.from({ length: 6 }, (_, index) => ({ nameOfItem: `Project ${index + 1}` })),
    work: [], works: [], awards: [], languages: [], social: []
  };

  await api.fillRows(profile, report, Date.now() + 10_000);

  assert.equal(api.rowsIn(window.document.querySelector('[data-prefix="education"]'), "education").length, 2);
  assert.equal(api.rowsIn(window.document.querySelector('[data-prefix="internship"]'), "internship").length, 2);
  assert.equal(api.rowsIn(window.document.querySelector('[data-prefix="project"]'), "projects").length, 6);
  assert.deepEqual(
    Array.from(window.document.querySelectorAll('[data-prefix="education"] input')).map((input) => input.value),
    ["School A", "School B"]
  );
  assert.deepEqual(
    Array.from(window.document.querySelectorAll('[data-prefix="internship"] input')).map((input) => input.value),
    ["Company A", "Company B"]
  );
  assert.deepEqual(
    Array.from(window.document.querySelectorAll('[data-prefix="project"] input')).map((input) => input.value),
    ["Project 1", "Project 2", "Project 3", "Project 4", "Project 5", "Project 6"]
  );
  assert.deepEqual(report.skipped, []);
});

test("uses the real DOM index after a prior row was removed", async () => {
  const window = setup();
  const sectionElement = window.document.querySelector('[data-prefix="project"]');
  sectionElement.querySelector(".rows").innerHTML = row("project", 3, "name") + row("project", 7, "name");
  const rows = window.__MOKAHR_TEST_API__.rowsIn(sectionElement, "projects");
  assert.deepEqual(Array.from(rows, (item) => item.index), [3, 7]);
});

test("continues adding when the page framework replaces the section after the first plus click", async () => {
  const window = setup();
  const oldSection = window.document.querySelector('[data-prefix="internship"]');
  const oldButton = oldSection.querySelector('[class*="createFormSection-addBtn"]');
  oldButton.replaceWith(oldButton.cloneNode(true));
  oldSection.querySelector('[class*="createFormSection-addBtn"]').addEventListener("click", () => {
    const replacement = window.document.createElement("div");
    replacement.className = "createFormSection__test";
    replacement.dataset.prefix = "internship";
    replacement.dataset.field = "company";
    replacement.innerHTML = `
      <div class="createFormSection-title"><span>实习经历</span></div>
      <div class="rows">${row("internship", 4, "company")}</div>
      <div class="formOperate-addBtn"><span>添加</span></div>`;
    replacement.querySelector(".formOperate-addBtn").addEventListener("click", () => {
      replacement.querySelector(".rows").insertAdjacentHTML("beforeend", row("internship", 9, "company"));
    }, { once: true });
    oldSection.replaceWith(replacement);
  }, { once: true });

  const report = { filled: [], skipped: [], ignored: [] };
  await window.__MOKAHR_TEST_API__.fillRows({
    education: [], work: [], internship: [{ company: "Company A" }, { company: "Company B" }],
    projects: [], works: [], awards: [], languages: [], social: []
  }, report, Date.now() + 10_000);

  const current = window.document.querySelector('[data-prefix="internship"]');
  assert.deepEqual(Array.from(window.__MOKAHR_TEST_API__.rowsIn(current, "internship"), (item) => item.index), [4, 9]);
  assert.deepEqual(Array.from(current.querySelectorAll("input"), (input) => input.value), ["Company A", "Company B"]);
  assert.deepEqual(report.skipped, []);
});

function educationRow(index, school = "", major = "") {
  return `
    <div class="resumeEditForm-item">
      <div data-cy="education[${index}].school"><input data-cy="education[${index}].schoolInput" value="${school}"></div>
      <div data-cy="education[${index}].fieldOfStudy"><input data-cy="education[${index}].fieldOfStudyInput" value="${major}"></div>
    </div>`;
}

function fullEducationRow(index, school = "", degree = "", major = "") {
  return `<div class="resumeEditForm-item">
    <div class="atsx-form-item" data-cy="education[${index}].school"><label>学校名称</label><input data-cy="education[${index}].schoolInput" value="${school}"></div>
    <div class="atsx-form-item" data-cy="education[${index}].degree"><label>学历</label><input data-cy="education[${index}].degreeInput" value="${degree}"></div>
    <div class="atsx-form-item" data-cy="education[${index}].fieldOfStudy"><label>专业</label><input data-cy="education[${index}].fieldOfStudyInput" value="${major}"></div>
  </div>`;
}

function experienceRow(prefix, index, company = "", title = "") {
  return `<div class="resumeEditForm-item">
    <div class="atsx-form-item" data-cy="${prefix}[${index}].company"><label>公司名称</label><input data-cy="${prefix}[${index}].companyInput" value="${company}"></div>
    <div class="atsx-form-item" data-cy="${prefix}[${index}].title"><label>职位名称</label><input data-cy="${prefix}[${index}].titleInput" value="${title}"></div>
  </div>`;
}

function fullProjectRow(index, name = "", role = "", link = "", description = "") {
  return `<div class="resumeEditForm-item">
    <div class="atsx-form-item" data-cy="project[${index}].name"><label>项目名称</label><input data-cy="project[${index}].nameInput" value="${name}"></div>
    <div class="atsx-form-item" data-cy="project[${index}].role"><label>项目角色</label><input data-cy="project[${index}].roleInput" value="${role}"></div>
    <div class="atsx-form-item" data-cy="project[${index}].link"><label>项目链接</label><input data-cy="project[${index}].linkInput" value="${link}"></div>
    <div class="atsx-form-item" data-cy="project[${index}].desc"><label>描述</label><textarea data-cy="project[${index}].descInput">${description}</textarea></div>
  </div>`;
}

function projectDateRow(index, name, start = "YYYY-MM", end = "YYYY-MM") {
  const datePart = (edge, value) => {
    const [year = "YYYY", month = "MM"] = value.split("-");
    return `<div data-cy="project[${index}].periodInput${edge}">
      <span data-cy="year">${year}</span><span>-</span><span data-cy="month">${month}</span>
    </div>`;
  };
  return `<div class="resumeEditForm-item">
    <div data-cy="project[${index}].name"><input data-cy="project[${index}].nameInput" value="${name}"></div>
    <div data-cy="project[${index}].periodInput">
      ${datePart("Begin", start)}<span>-</span>${datePart("End", end)}
    </div>
  </div>`;
}

function dateDropdown(dataCy, selectedYear = "2026") {
  const years = ["2026", "2025", "2024", "2023", "2022", "2021"];
  const months = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));
  const list = (values, selected) => `<div class="atsx-date-picker-period-month-panel-list">
    ${values.map((value) => `<div class="atsx-date-picker-period-month-panel-list-item${value === selected ? " atsx-date-picker-period-month-panel-list-item-selected" : ""}" data-cy="${value}">${value}</div>`).join("")}
  </div>`;
  return `<div data-cy="${dataCy}">${list(years, selectedYear)}${list(months, "01")}</div>`;
}

test("never overwrites earlier education when React rebuilds rows while filling a later entry", async () => {
  const window = setup();
  let sectionElement = window.document.querySelector('[data-prefix="education"]');
  sectionElement.querySelector(".rows").innerHTML =
    educationRow(0, "School A", "Major A") + educationRow(1, "School B", "Major B");
  const originalAdd = sectionElement.querySelector(".formOperate-addBtn");
  originalAdd.replaceWith(originalAdd.cloneNode(true));

  const snapshot = () => Array.from(sectionElement.querySelectorAll(".resumeEditForm-item"), (element) => ({
    school: element.querySelector('[data-cy$="schoolInput"]').value,
    major: element.querySelector('[data-cy$="fieldOfStudyInput"]').value
  }));
  const rebuild = () => {
    const entries = snapshot();
    const replacement = sectionElement.cloneNode(true);
    replacement.querySelector(".rows").innerHTML = entries.map((entry, position) =>
      educationRow([7, 3, 11][position], entry.school, entry.major)).join("");
    sectionElement.replaceWith(replacement);
    sectionElement = replacement;
    sectionElement.querySelector(".formOperate-addBtn").addEventListener("click", () => {
      sectionElement.querySelector(".rows").insertAdjacentHTML("beforeend", educationRow(20));
    }, { once: true });
  };
  sectionElement.querySelector(".formOperate-addBtn").addEventListener("click", () => {
    sectionElement.querySelector(".rows").insertAdjacentHTML("beforeend", educationRow(2));
  }, { once: true });
  window.document.addEventListener("input", (event) => {
    if (event.target.closest('[data-prefix="education"]')) rebuild();
  });

  const report = { filled: [], skipped: [], ignored: [] };
  await window.__MOKAHR_TEST_API__.fillRows({
    education: [
      { school: "School A", major: "Major A" },
      { school: "School B", major: "Major B" },
      { school: "School C", major: "Major C" }
    ],
    work: [], internship: [], projects: [], works: [], awards: [], languages: [], social: []
  }, report, Date.now() + 10_000);

  assert.deepEqual(snapshot(), [
    { school: "School A", major: "Major A" },
    { school: "School B", major: "Major B" },
    { school: "School C", major: "Major C" }
  ]);
  assert.deepEqual(report.skipped, []);
});

test("preserves profile order when every added education row is inserted at the top and all rows are rebuilt", async () => {
  const window = setup();
  let sectionElement = window.document.querySelector('[data-prefix="education"]');
  sectionElement.querySelector(".rows").innerHTML = educationRow(0);
  sectionElement.querySelector(".formOperate-addBtn").replaceWith(
    sectionElement.querySelector(".formOperate-addBtn").cloneNode(true)
  );

  const entries = () => Array.from(sectionElement.querySelectorAll(".resumeEditForm-item"), (element) => ({
    school: element.querySelector('[data-cy$="schoolInput"]').value,
    major: element.querySelector('[data-cy$="fieldOfStudyInput"]').value
  }));
  const rebuild = (nextEntries) => {
    const replacement = sectionElement.cloneNode(true);
    replacement.querySelector(".rows").innerHTML = nextEntries.map((entry, index) =>
      educationRow(index, entry.school, entry.major)).join("");
    sectionElement.replaceWith(replacement);
    sectionElement = replacement;
    bindAdd();
  };
  const bindAdd = () => {
    sectionElement.querySelector(".formOperate-addBtn").addEventListener("click", () => {
      rebuild([{ school: "", major: "" }, ...entries()]);
    }, { once: true });
  };
  bindAdd();
  window.document.addEventListener("input", (event) => {
    if (!event.target.closest('[data-prefix="education"]')) return;
    const currentEntries = entries();
    window.queueMicrotask(() => rebuild(currentEntries));
  });

  const report = { filled: [], skipped: [], ignored: [] };
  await window.__MOKAHR_TEST_API__.fillRows({
    education: [
      { school: "School A", major: "Major A" },
      { school: "School B", major: "Major B" },
      { school: "School C", major: "Major C" }
    ],
    work: [], internship: [], projects: [], works: [], awards: [], languages: [], social: []
  }, report, Date.now() + 15_000);

  assert.deepEqual(entries(), [
    { school: "School A", major: "Major A" },
    { school: "School B", major: "Major B" },
    { school: "School C", major: "Major C" }
  ]);
  assert.deepEqual(report.skipped, []);
});

test("repairs a prior failed education fill into exact profile order", async () => {
  const window = setup();
  let sectionElement = window.document.querySelector('[data-prefix="education"]');
  sectionElement.querySelector(".rows").innerHTML =
    educationRow(0, "School B", "Major B") + educationRow(1, "School C", "Major C") + educationRow(2);
  sectionElement.querySelector(".formOperate-addBtn").replaceWith(
    sectionElement.querySelector(".formOperate-addBtn").cloneNode(true)
  );

  const report = { filled: [], skipped: [], ignored: [] };
  await window.__MOKAHR_TEST_API__.fillRows({
    education: [
      { school: "School A", major: "Major A" },
      { school: "School B", major: "Major B" },
      { school: "School C", major: "Major C" }
    ],
    work: [], internship: [], projects: [], works: [], awards: [], languages: [], social: []
  }, report, Date.now() + 10_000);

  assert.deepEqual(
    Array.from(sectionElement.querySelectorAll('[data-cy$="schoolInput"]'), (input) => input.value),
    ["School A", "School B", "School C"]
  );
  assert.deepEqual(
    Array.from(sectionElement.querySelectorAll('[data-cy$="fieldOfStudyInput"]'), (input) => input.value),
    ["Major A", "Major B", "Major C"]
  );
  assert.deepEqual(report.skipped, []);
});

test("does not let a delayed last-item update overwrite the first education or project", async () => {
  const window = setup();
  const educationSection = window.document.querySelector('[data-prefix="education"]');
  const projectSection = window.document.querySelector('[data-prefix="project"]');
  const delayedOverwrites = [
    { last: 'education[2].schoolInput', first: 'education[0].schoolInput' },
    { last: 'project[5].nameInput', first: 'project[0].nameInput' }
  ];
  window.document.addEventListener("input", (event) => {
    const overwrite = delayedOverwrites.find((entry) => event.target.dataset.cy === entry.last);
    if (!overwrite) return;
    const value = event.target.value;
    window.setTimeout(() => {
      const first = window.document.querySelector(`[data-cy="${overwrite.first}"]`);
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(first, value);
    }, 40);
  });

  const report = { filled: [], skipped: [], ignored: [] };
  await window.__MOKAHR_TEST_API__.fillRows({
    education: [
      { school: "School A" },
      { school: "School B" },
      { school: "School C" }
    ],
    work: [], internship: [],
    projects: Array.from({ length: 6 }, (_, index) => ({ nameOfItem: `Project ${index + 1}` })),
    works: [], awards: [], languages: [], social: []
  }, report, Date.now() + 15_000);
  await new Promise((resolve) => window.setTimeout(resolve, 100));

  assert.deepEqual(
    Array.from(educationSection.querySelectorAll('[data-cy$="schoolInput"]'), (input) => input.value),
    ["School A", "School B", "School C"]
  );
  assert.deepEqual(
    Array.from(projectSection.querySelectorAll('[data-cy$="nameInput"]'), (input) => input.value),
    ["Project 1", "Project 2", "Project 3", "Project 4", "Project 5", "Project 6"]
  );
  assert.deepEqual(report.skipped, []);
});

test("repairs late cross-section overwrites and restores the explicit no-work state", async () => {
  const window = setup();
  const educationSection = window.document.querySelector('[data-prefix="education"]');
  const internshipSection = window.document.querySelector('[data-prefix="internship"]');
  const projectSection = window.document.querySelector('[data-prefix="project"]');
  educationSection.querySelector(".rows").innerHTML = [0, 1, 2].map((index) => fullEducationRow(index)).join("");
  internshipSection.querySelector(".rows").innerHTML = [0, 1].map((index) => experienceRow("internship", index)).join("");
  projectSection.querySelector(".rows").innerHTML = Array.from({ length: 6 }, (_, index) => fullProjectRow(index)).join("");

  educationSection.insertAdjacentHTML("afterend", `
    <div class="createFormSection__test" data-prefix="career">
      <div class="createFormSection-title"><span>工作经历</span></div>
      <label class="noExperience-container"><input type="checkbox" checked>没有工作经历</label>
      <div class="rows">${experienceRow("career", 0)}</div>
    </div>`);
  const workSection = window.document.querySelector('[data-prefix="career"]');
  const noWork = workSection.querySelector('input[type="checkbox"]');
  noWork.addEventListener("click", () => {
    if (!noWork.checked) return;
    for (const input of workSection.querySelectorAll('.resumeEditForm-item input')) input.value = "";
  });

  const delayedCopies = [
    ["education[2].schoolInput", "education[0].schoolInput"],
    ["education[2].degreeInput", "education[0].degreeInput"],
    ["education[2].fieldOfStudyInput", "education[0].fieldOfStudyInput"],
    ["project[5].nameInput", "project[0].nameInput"],
    ["project[5].roleInput", "project[0].roleInput"],
    ["project[5].linkInput", "project[0].linkInput"]
  ];
  const scheduled = new Set();
  window.document.addEventListener("input", (event) => {
    const copy = delayedCopies.find(([source]) => event.target.dataset.cy === source);
    if (copy && !scheduled.has(copy[0])) {
      scheduled.add(copy[0]);
      const value = event.target.value;
      window.setTimeout(() => {
        const target = window.document.querySelector(`[data-cy="${copy[1]}"]`);
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(target, value);
      }, 500);
    }
    if (event.target.dataset.cy === "internship[1].titleInput" && !scheduled.has("work")) {
      scheduled.add("work");
      window.setTimeout(() => {
        noWork.checked = false;
        workSection.querySelector('[data-cy="career[0].companyInput"]').value = "Internship B";
        workSection.querySelector('[data-cy="career[0].titleInput"]').value = "Role B";
      }, 500);
    }
  });

  const education = [
    { school: "School A", degree: "Master", major: "Major A" },
    { school: "School B", degree: "Bachelor", major: "Major B" },
    { school: "School C", degree: "Exchange", major: "Major C" }
  ];
  const internship = [
    { company: "Internship A", title: "Role A" },
    { company: "Internship B", title: "Role B" }
  ];
  const projects = Array.from({ length: 6 }, (_, index) => ({
    nameOfItem: `Project ${index + 1}`,
    role: `Project Role ${index + 1}`,
    link: `https://example.com/${index + 1}`,
    description: `Description ${index + 1}`
  }));
  const report = { filled: [], skipped: [], ignored: [] };
  await window.__MOKAHR_TEST_API__.fillRows({
    education, work: [], internship, projects, works: [], awards: [], languages: [], social: []
  }, report, Date.now() + 30_000);

  const values = (selector) => Array.from(window.document.querySelectorAll(selector), (input) => input.value);
  assert.deepEqual(values('[data-prefix="education"] [data-cy$="schoolInput"]'), education.map((item) => item.school));
  assert.deepEqual(values('[data-prefix="education"] [data-cy$="degreeInput"]'), education.map((item) => item.degree));
  assert.deepEqual(values('[data-prefix="education"] [data-cy$="fieldOfStudyInput"]'), education.map((item) => item.major));
  assert.deepEqual(values('[data-prefix="project"] [data-cy$="nameInput"]'), projects.map((item) => item.nameOfItem));
  assert.deepEqual(values('[data-prefix="project"] [data-cy$="roleInput"]'), projects.map((item) => item.role));
  assert.deepEqual(values('[data-prefix="project"] [data-cy$="linkInput"]'), projects.map((item) => item.link));
  assert.deepEqual(values('[data-prefix="project"] [data-cy$="descInput"]'), projects.map((item) => item.description));
  assert.equal(noWork.checked, true);
  assert.deepEqual(values('[data-prefix="career"] .resumeEditForm-item input'), ["", ""]);
  assert.deepEqual(report.skipped, []);
});

test("custom fields never reuse same-named controls inside repeatable resume rows", async () => {
  const window = setup();
  const educationSection = window.document.querySelector('[data-prefix="education"]');
  const projectSection = window.document.querySelector('[data-prefix="project"]');
  educationSection.querySelector(".rows").innerHTML = fullEducationRow(0, "School A", "Master", "Major A");
  projectSection.querySelector(".rows").innerHTML = fullProjectRow(0, "Project A", "Lead", "https://a.test", "Keep description");
  const report = { filled: [], skipped: [], ignored: [] };

  await window.__MOKAHR_TEST_API__.fillCustom({ custom: {
    "学校名称": "Wrong School",
    "学历": "Wrong Degree",
    "专业": "Wrong Major",
    "项目名称": "Wrong Project",
    "项目角色": "Wrong Role",
    "项目链接": "https://wrong.test"
  } }, report, Date.now() + 5_000);

  assert.equal(educationSection.querySelector('[data-cy$="schoolInput"]').value, "School A");
  assert.equal(educationSection.querySelector('[data-cy$="degreeInput"]').value, "Master");
  assert.equal(educationSection.querySelector('[data-cy$="fieldOfStudyInput"]').value, "Major A");
  assert.equal(projectSection.querySelector('[data-cy$="nameInput"]').value, "Project A");
  assert.equal(projectSection.querySelector('[data-cy$="roleInput"]').value, "Lead");
  assert.equal(projectSection.querySelector('[data-cy$="linkInput"]').value, "https://a.test");
  assert.equal(report.ignored.length, 6);
});

test("selects December from the rebuilt month column instead of falling back to January", async () => {
  const window = setup();
  const sectionElement = window.document.querySelector('[data-prefix="project"]');
  sectionElement.querySelector(".rows").innerHTML = projectDateRow(0, "Project A");
  const dropdownCy = "project[0].periodInputEndDropdown";
  window.document.body.insertAdjacentHTML("beforeend", dateDropdown(dropdownCy));

  const bindMonth = (dropdown) => {
    dropdown.querySelector('.atsx-date-picker-period-month-panel-list:nth-child(2) [data-cy="12"]')
      .addEventListener("click", () => {
        const target = window.document.querySelector('[data-cy="project[0].periodInputEnd"]');
        target.querySelector('[data-cy="year"]').textContent = "2021";
        target.querySelector('[data-cy="month"]').textContent = "12";
      });
  };
  window.document.querySelector(`[data-cy="${dropdownCy}"] [data-cy="2021"]`).addEventListener("click", () => {
    const oldDropdown = window.document.querySelector(`[data-cy="${dropdownCy}"]`);
    window.setTimeout(() => {
      oldDropdown.insertAdjacentHTML("afterend", dateDropdown(dropdownCy, "2021"));
      const replacement = oldDropdown.nextElementSibling;
      oldDropdown.remove();
      bindMonth(replacement);
    }, 150);
  });

  const report = { filled: [], skipped: [], ignored: [] };
  await window.__MOKAHR_TEST_API__.fillRows({
    education: [], work: [], internship: [],
    projects: [{ nameOfItem: "Project A", endDate: "2021-12" }],
    works: [], awards: [], languages: [], social: []
  }, report, Date.now() + 10_000);

  const end = window.document.querySelector('[data-cy="project[0].periodInputEnd"]');
  assert.equal(end.querySelector('[data-cy="year"]').textContent, "2021");
  assert.equal(end.querySelector('[data-cy="month"]').textContent, "12");
  const values = window.__MOKAHR_TEST_API__.snapshotRows("projects")[0].values;
  assert.deepEqual(report.skipped, []);
  assert.equal(values.nameOfItem, "projecta");
  assert.equal(values.startDate, "");
  assert.equal(values.endDate, "2021-12");
});

test("reconciles an existing education row to the profile's first entry", async () => {
  const window = setup();
  const sectionElement = window.document.querySelector('[data-prefix="education"]');
  sectionElement.querySelector(".rows").innerHTML = educationRow(0, "Existing School", "Existing Major");

  const report = { filled: [], skipped: [], ignored: [] };
  await window.__MOKAHR_TEST_API__.fillRows({
    education: [{ school: "School A", major: "Major A" }],
    work: [], internship: [], projects: [], works: [], awards: [], languages: [], social: []
  }, report, Date.now() + 10_000);

  assert.deepEqual(
    Array.from(sectionElement.querySelectorAll('[data-cy$="schoolInput"]'), (input) => input.value),
    ["School A"]
  );
  assert.deepEqual(report.skipped, []);
});

test("same school names still map by page position and never spill into another row", async () => {
  const window = setup();
  const sectionElement = window.document.querySelector('[data-prefix="education"]');
  sectionElement.querySelector(".rows").innerHTML =
    educationRow(0, "Same School", "Original A") + educationRow(1, "Same School", "Original B");

  const report = { filled: [], skipped: [], ignored: [] };
  await window.__MOKAHR_TEST_API__.fillRows({
    education: [
      { school: "Same School", major: "Updated A" },
      { school: "Same School", major: "Updated B" }
    ],
    work: [], internship: [], projects: [], works: [], awards: [], languages: [], social: []
  }, report, Date.now() + 10_000);

  assert.deepEqual(
    Array.from(sectionElement.querySelectorAll('[data-cy$="fieldOfStudyInput"]'), (input) => input.value),
    ["Updated A", "Updated B"]
  );
  assert.deepEqual(report.skipped, []);
});

test("reads a Mokahr school combobox value from its nested search input", async () => {
  const window = setup();
  const sectionElement = window.document.querySelector('[data-prefix="education"]');
  sectionElement.querySelector(".rows").innerHTML = `
    <div class="resumeEditForm-item">
      <div data-cy="education[0].school">
        <div role="combobox" data-cy="education[0].schoolInput">
          <div class="atsx-select-search__field__wrap">
            <input class="atsx-select-search__field" value="School A">
            <span class="atsx-select-search__field__mirror">School A&nbsp;</span>
          </div>
        </div>
      </div>
      <div data-cy="education[0].fieldOfStudy"><input data-cy="education[0].fieldOfStudyInput"></div>
    </div>`;

  const report = { filled: [], skipped: [], ignored: [] };
  await window.__MOKAHR_TEST_API__.fillRows({
    education: [{ school: "School A", major: "Major A" }],
    work: [], internship: [], projects: [], works: [], awards: [], languages: [], social: []
  }, report, Date.now() + 10_000);

  assert.equal(sectionElement.querySelector('[data-cy$="schoolInput"] input').value, "School A");
  assert.equal(sectionElement.querySelector('[data-cy$="fieldOfStudyInput"]').value, "Major A");
  assert.deepEqual(report.skipped, []);
});

test("selects a school only from the dropdown owned by the current education row", async () => {
  const window = setup();
  const sectionElement = window.document.querySelector('[data-prefix="education"]');
  sectionElement.querySelector(".rows").innerHTML = `
    ${educationRow(0, "School A", "Major A")}
    <div class="resumeEditForm-item">
      <div data-cy="education[1].school">
        <div role="combobox" aria-controls="school-row-1" data-cy="education[1].schoolInput">
          <input class="atsx-select-search__field">
        </div>
      </div>
    </div>`;
  window.document.body.insertAdjacentHTML("beforeend", `
    <div id="school-row-0"><div role="option">School B</div></div>
    <div id="school-row-1"><div role="option">School B</div></div>`);
  let wrongDropdownClicked = false;
  window.document.querySelector("#school-row-0 [role=option]").addEventListener("click", () => {
    wrongDropdownClicked = true;
    sectionElement.querySelector('[data-cy="education[0].schoolInput"]').value = "School B";
  });

  const report = { filled: [], skipped: [], ignored: [] };
  await window.__MOKAHR_TEST_API__.fillRows({
    education: [{ school: "School A" }, { school: "School B" }],
    work: [], internship: [], projects: [], works: [], awards: [], languages: [], social: []
  }, report, Date.now() + 10_000);

  assert.equal(wrongDropdownClicked, false);
  assert.equal(sectionElement.querySelector('[data-cy="education[0].schoolInput"]').value, "School A");
  assert.equal(sectionElement.querySelector('[data-cy="education[1].schoolInput"] input').value, "School B");
  assert.deepEqual(report.skipped, []);
});

test("does not fill degree or major when the school combobox fails to retain its value", async () => {
  const window = setup();
  const sectionElement = window.document.querySelector('[data-prefix="education"]');
  sectionElement.querySelector(".rows").innerHTML = `
    <div class="resumeEditForm-item">
      <div data-cy="education[0].school">
        <div role="combobox" data-cy="education[0].schoolInput">
          <input class="atsx-select-search__field">
        </div>
      </div>
      <div data-cy="education[0].degree"><input data-cy="education[0].degreeInput" value="Original Degree"></div>
      <div data-cy="education[0].fieldOfStudy"><input data-cy="education[0].fieldOfStudyInput" value="Original Major"></div>
    </div>`;
  const schoolInput = sectionElement.querySelector('[data-cy$="schoolInput"] input');
  schoolInput.addEventListener("input", () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(schoolInput, "");
  });

  const report = { filled: [], skipped: [], ignored: [] };
  await window.__MOKAHR_TEST_API__.fillRows({
    education: [{ school: "Rejected School", degree: "New Degree", major: "New Major" }],
    work: [], internship: [], projects: [], works: [], awards: [], languages: [], social: []
  }, report, Date.now() + 10_000);

  assert.equal(schoolInput.value, "");
  assert.equal(sectionElement.querySelector('[data-cy$="degreeInput"]').value, "Original Degree");
  assert.equal(sectionElement.querySelector('[data-cy$="fieldOfStudyInput"]').value, "Original Major");
  assert.ok(report.skipped.some((item) => item.startsWith("education[0].school")));
});
