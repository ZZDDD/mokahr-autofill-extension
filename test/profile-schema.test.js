const test = require("node:test");
const assert = require("node:assert/strict");
const Schema = require("../lib/profile-schema.js");

test("reverse capture preserves stored values when the page value is blank or absent", () => {
  const stored = {
    basic: { name: "Stored Name", email: "stored@example.com" },
    education: [{ school: "Stored School" }],
    internship: [{ company: "Stored Internship" }]
  };
  const captured = {
    basic: { name: "", email: "page@example.com" },
    education: [],
    internship: []
  };

  const merged = Schema.mergeCapturedProfile(stored, captured, ["education"]);

  assert.equal(merged.basic.name, "Stored Name");
  assert.equal(merged.basic.email, "page@example.com");
  assert.deepEqual(merged.education, [{ school: "Stored School" }]);
  assert.deepEqual(merged.internship, [{ company: "Stored Internship" }]);
});

test("reverse capture replaces a repeat section only when it was present and non-empty", () => {
  const stored = {
    education: [{ school: "Old School" }],
    projects: [{ nameOfItem: "Keep Project" }]
  };
  const captured = {
    education: [{ school: "New School" }, { school: "Second School" }],
    projects: [{ nameOfItem: "Hidden Project" }]
  };

  const merged = Schema.mergeCapturedProfile(stored, captured, ["education"]);

  assert.deepEqual(merged.education, [{ school: "New School" }, { school: "Second School" }]);
  assert.deepEqual(merged.projects, [{ nameOfItem: "Keep Project" }]);
});

test("reverse capture clears work only when the page explicitly says there is no work experience", () => {
  const stored = { work: [{ company: "Accidentally captured internship" }] };
  const captured = { work: [] };

  const merged = Schema.mergeCapturedProfile(stored, captured, ["work"], ["work"]);

  assert.deepEqual(merged.work, []);
});

test("metadata revisions and section counts are generated from the saved profile", () => {
  const metadata = Schema.updateMetadata(
    { revision: 3, lastImportFileName: "source.json" },
    { education: [{ school: "A" }, {}], projects: [{ nameOfItem: "P" }] },
    { bumpRevision: true, lastSaveMethod: "manual" }
  );

  assert.equal(metadata.revision, 4);
  assert.equal(metadata.lastImportFileName, "source.json");
  assert.equal(metadata.lastSaveMethod, "manual");
  assert.equal(metadata.counts.education, 1);
  assert.equal(metadata.counts.projects, 1);
});

test("JSON import validation rejects malformed section shapes", () => {
  assert.throws(() => Schema.validateProfileInput([]), /顶层必须是简历对象/);
  assert.throws(() => Schema.validateProfileInput({ basic: "Ada" }), /basic 必须是 JSON 对象/);
  assert.throws(() => Schema.validateProfileInput({ education: {} }), /教育经历必须是 JSON 数组/);
  assert.throws(() => Schema.validateProfileInput({ education: ["School"] }), /每一条都必须是 JSON 对象/);
  assert.equal(Schema.validateProfileInput({ education: [] }).education.length, 0);
});
