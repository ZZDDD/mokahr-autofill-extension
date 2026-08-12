(function (root, factory) {
  const Core = root.MokahrCore || (typeof require === "function" ? require("./core.js") : null);
  const api = factory(Core);
  root.MokahrProfileSchema = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core) {
  "use strict";

  if (!Core) throw new Error("MokahrCore must be loaded before MokahrProfileSchema");

  const BASIC_FIELDS = [
    { key: "name", label: "姓名", autocomplete: "name" },
    { key: "mobile", label: "手机号码", autocomplete: "tel" },
    { key: "email", label: "邮箱", type: "email", autocomplete: "email" },
    { key: "age", label: "年龄", inputmode: "numeric" },
    { key: "gender", label: "性别" },
    { key: "experienceYears", label: "工作年限", inputmode: "numeric" },
    { key: "nationality", label: "国籍（地区）" },
    { key: "currentCity", label: "所在地点" },
    { key: "hometownCity", label: "家乡" },
    { key: "expectedLocation", label: "期望工作地点" },
    { key: "intentionCity", label: "意向城市" },
    { key: "idType", label: "证件类型" },
    { key: "idNumber", label: "证件号码" },
    { key: "identification", label: "个人证件（单字段页面）" },
    { key: "birthday", label: "出生日期", type: "date" },
    { key: "maritalStatus", label: "婚姻状况" },
    { key: "currentHomeAddress", label: "家庭住址", wide: true },
    { key: "referralCode", label: "内推码" }
  ];

  const REPEAT_SECTIONS = [
    {
      key: "education", prefix: "education", title: "教育经历", itemTitle: "教育经历",
      fields: [
        { key: "school", label: "学校名称", paths: ["school"] },
        { key: "degree", label: "学历", paths: ["degree"] },
        { key: "major", label: "专业", paths: ["fieldOfStudy", "major"] },
        { key: "educationType", label: "学历类型", paths: ["educationType", "education_type"] },
        { key: "academicRanking", label: "成绩排名", paths: ["academicRanking", "academic_ranking"] },
        { key: "startDate", label: "开始时间", type: "month", paths: ["startTime", "startDate"] },
        { key: "endDate", label: "结束时间", type: "month", paths: ["endTime", "endDate"] }
      ]
    },
    {
      key: "work", prefix: "career", title: "工作经历", itemTitle: "工作经历",
      fields: [
        { key: "company", label: "公司名称", paths: ["company"] },
        { key: "title", label: "职位名称", paths: ["title", "position"] },
        { key: "startDate", label: "开始时间", type: "month", paths: ["startTime", "startDate"] },
        { key: "endDate", label: "结束时间", type: "month", paths: ["endTime", "endDate"] },
        { key: "description", label: "描述", type: "textarea", wide: true, paths: ["desc", "description"] }
      ]
    },
    {
      key: "internship", prefix: "internship", title: "实习经历", itemTitle: "实习经历",
      fields: [
        { key: "company", label: "公司名称", paths: ["company"] },
        { key: "title", label: "职位名称", paths: ["title", "position"] },
        { key: "startDate", label: "开始时间", type: "month", paths: ["startTime", "startDate"] },
        { key: "endDate", label: "结束时间", type: "month", paths: ["endTime", "endDate"] },
        { key: "description", label: "描述", type: "textarea", wide: true, paths: ["desc", "description"] }
      ]
    },
    {
      key: "projects", prefix: "project", title: "项目经历", itemTitle: "项目经历",
      fields: [
        { key: "nameOfItem", label: "项目名称", paths: ["name", "title"] },
        { key: "role", label: "项目角色", paths: ["role"] },
        { key: "startDate", label: "开始时间", type: "month", paths: ["startTime", "startDate"] },
        { key: "endDate", label: "结束时间", type: "month", paths: ["endTime", "endDate"] },
        { key: "link", label: "项目链接", type: "url", wide: true, paths: ["link"] },
        { key: "description", label: "描述", type: "textarea", wide: true, paths: ["desc", "description"] }
      ]
    },
    {
      key: "works", prefix: "works", title: "作品", itemTitle: "作品",
      fields: [
        { key: "link", label: "作品链接", type: "url", wide: true, paths: ["link"] },
        { key: "description", label: "描述", type: "textarea", wide: true, paths: ["desc", "description"] }
      ]
    },
    {
      key: "awards", prefix: "award", title: "获奖", itemTitle: "获奖经历",
      fields: [
        { key: "nameOfItem", label: "获奖名称", paths: ["name", "title"] },
        { key: "date", label: "获奖时间", placeholder: "YYYY", paths: ["time", "date"] },
        { key: "description", label: "描述", type: "textarea", wide: true, paths: ["desc", "description"] }
      ]
    },
    {
      key: "languages", prefix: "language", title: "语言能力", itemTitle: "语言能力",
      fields: [
        { key: "language", label: "语言", paths: ["language"] },
        { key: "proficiency", label: "精通程度", paths: ["proficiency"] }
      ]
    },
    {
      key: "social", prefix: "sns", title: "社交账号", itemTitle: "社交账号",
      fields: [
        { key: "platform", label: "社交平台", paths: ["snsType", "platform"] },
        { key: "link", label: "URL / ID", type: "url", paths: ["link"] }
      ]
    }
  ];

  const SECTION_MAP = Object.fromEntries(REPEAT_SECTIONS.map((section) => [section.key, section]));

  function nonEmpty(value) {
    return value !== undefined && value !== null && String(value).trim() !== "";
  }

  function compactEntries(entries) {
    if (!Array.isArray(entries)) return [];
    return entries
      .map((entry) => Object.fromEntries(Object.entries(entry || {}).filter(([, value]) => nonEmpty(value))))
      .filter((entry) => Object.keys(entry).length > 0);
  }

  function countProfile(input) {
    const profile = Core.mergeProfile(input);
    return Object.fromEntries(REPEAT_SECTIONS.map((section) => [section.key, compactEntries(profile[section.key]).length]));
  }

  function mergeCapturedProfile(storedInput, capturedInput, capturedSections, clearedSections) {
    const stored = Core.mergeProfile(storedInput);
    const captured = Core.mergeProfile(capturedInput);
    const merged = Core.mergeProfile(stored);
    for (const field of BASIC_FIELDS) {
      if (nonEmpty(captured.basic[field.key])) merged.basic[field.key] = captured.basic[field.key];
    }
    const allowedSections = new Set(Array.isArray(capturedSections) ? capturedSections : []);
    const explicitClears = new Set(Array.isArray(clearedSections) ? clearedSections : []);
    for (const section of REPEAT_SECTIONS) {
      const entries = compactEntries(captured[section.key]);
      if (explicitClears.has(section.key)) merged[section.key] = [];
      else if (allowedSections.has(section.key) && entries.length) merged[section.key] = entries;
    }
    if (nonEmpty(captured.selfEvaluation)) merged.selfEvaluation = captured.selfEvaluation;
    merged.custom = Object.assign({}, stored.custom, captured.custom || {});
    return merged;
  }

  function createMetadata(input) {
    return Object.assign({
      revision: 0,
      lastSavedAt: "",
      lastSaveMethod: "",
      lastSourceUrl: "",
      lastSourceTitle: "",
      lastSourceAt: "",
      lastImportAt: "",
      lastImportFileName: "",
      lastExportAt: "",
      lastExportFileName: "",
      lastExportPath: "",
      profileJsonPath: "",
      counts: countProfile(Core.EMPTY_PROFILE)
    }, input || {});
  }

  function updateMetadata(previous, profile, changes) {
    const metadata = createMetadata(previous);
    const patch = changes || {};
    const next = Object.assign({}, metadata, patch, { counts: countProfile(profile) });
    if (patch.bumpRevision) next.revision = metadata.revision + 1;
    delete next.bumpRevision;
    return next;
  }

  function validateProfileInput(input) {
    if (!input || Array.isArray(input) || typeof input !== "object") throw new Error("JSON 顶层必须是简历对象");
    for (const key of ["basic", "custom"]) {
      if (input[key] !== undefined && (!input[key] || Array.isArray(input[key]) || typeof input[key] !== "object")) {
        throw new Error(`${key} 必须是 JSON 对象`);
      }
    }
    for (const section of REPEAT_SECTIONS) {
      if (input[section.key] !== undefined && !Array.isArray(input[section.key])) {
        throw new Error(`${section.title}必须是 JSON 数组`);
      }
      if (input[section.key]?.some((entry) => !entry || Array.isArray(entry) || typeof entry !== "object")) {
        throw new Error(`${section.title}中的每一条都必须是 JSON 对象`);
      }
    }
    return input;
  }

  return {
    BASIC_FIELDS,
    REPEAT_SECTIONS,
    SECTION_MAP,
    compactEntries,
    countProfile,
    mergeCapturedProfile,
    createMetadata,
    updateMetadata,
    validateProfileInput,
    nonEmpty
  };
});
