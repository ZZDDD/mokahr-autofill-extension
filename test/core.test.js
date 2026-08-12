const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../lib/core.js");

test("normalizes labels across punctuation and whitespace", () => {
  assert.equal(Core.normalize(" 手机号码： * "), "手机号码");
});

test("maps common Chinese and English labels", () => {
  assert.equal(Core.fieldKeyForLabel("学校名称"), "school");
  assert.equal(Core.fieldKeyForLabel("Project Name"), "nameOfItem");
  assert.equal(Core.fieldKeyForLabel("精通程度"), "proficiency");
});

test("merges incomplete profiles into the current schema", () => {
  const profile = Core.mergeProfile({ basic: { name: "Ada" }, education: null });
  assert.equal(profile.basic.name, "Ada");
  assert.equal(profile.basic.email, "");
  assert.deepEqual(profile.education, []);
  assert.equal(profile.version, 1);
});
