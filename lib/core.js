(function (root, factory) {
  const api = factory();
  root.MokahrCore = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const EMPTY_PROFILE = {
    version: 1,
    basic: {
      referralCode: "",
      intentionCity: "",
      name: "",
      mobile: "",
      email: "",
      experienceYears: "",
      age: "",
      gender: "",
      nationality: "",
      currentCity: "",
      hometownCity: "",
      idType: "",
      idNumber: "",
      identification: "",
      expectedLocation: "",
      birthday: "",
      maritalStatus: "",
      currentHomeAddress: ""
    },
    education: [],
    work: [],
    internship: [],
    projects: [],
    works: [],
    awards: [],
    languages: [],
    selfEvaluation: "",
    social: [],
    custom: {}
  };

  const SECTION_ALIASES = {
    education: ["教育经历", "教育背景", "education"],
    work: ["工作经历", "career", "work experience"],
    internship: ["实习经历", "internship"],
    projects: ["项目经历", "项目经验", "project"],
    works: ["作品", "work samples", "portfolio"],
    awards: ["获奖", "荣誉", "award"],
    languages: ["语言能力", "语言", "language"],
    social: ["社交账号", "社交", "social"]
  };

  const FIELD_ALIASES = {
    referralCode: ["内推码", "referral code"],
    intentionCity: ["意向城市", "意向地点", "preferred city"],
    name: ["姓名", "name"],
    mobile: ["手机号码", "手机号", "mobile", "phone"],
    email: ["邮箱", "email"],
    experienceYears: ["工作年限", "experience years", "experience"],
    age: ["年龄", "age"],
    gender: ["性别", "gender"],
    nationality: ["国籍（地区）", "国籍", "nationality"],
    currentCity: ["所在地点", "当前城市", "current city", "current location"],
    hometownCity: ["家乡", "籍贯", "hometown"],
    idType: ["证件类型", "证件", "id type"],
    idNumber: ["证件号码", "证件号", "id number"],
    identification: ["个人证件", "identification"],
    expectedLocation: ["期望工作地点", "期望地点", "expected location"],
    birthday: ["出生日期", "生日", "birthday"],
    maritalStatus: ["婚姻状况", "marital status"],
    currentHomeAddress: ["家庭住址", "当前住址", "home address"],
    school: ["学校名称", "学校", "school name", "school"],
    degree: ["学历", "学位", "degree"],
    major: ["专业", "major"],
    educationType: ["学历类型", "education type"],
    academicRanking: ["成绩排名", "academic ranking"],
    company: ["公司名称", "公司", "company name", "company"],
    title: ["职位名称", "职位", "岗位", "position", "job title"],
    nameOfItem: ["项目名称", "作品名称", "奖项名称", "名称", "project name", "award name"],
    role: ["担任角色", "项目角色", "角色", "role"],
    link: ["链接", "url / id", "url", "link"],
    description: ["描述", "项目描述", "工作描述", "实习描述", "description"],
    language: ["语言", "语种", "language"],
    proficiency: ["熟练程度", "精通程度", "掌握程度", "proficiency"],
    platform: ["社交平台", "平台", "platform"],
    selfEvaluation: ["自我评价", "self introduction", "self evaluation"]
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[\s：:*·•（）()\[\]【】/_-]+/g, "")
      .trim();
  }

  function matchesAlias(text, aliases) {
    const normalized = normalize(text);
    return aliases.some((alias) => {
      const candidate = normalize(alias);
      return normalized === candidate || normalized.includes(candidate);
    });
  }

  function fieldKeyForLabel(label) {
    const normalized = normalize(label);
    for (const [key, aliases] of Object.entries(FIELD_ALIASES)) {
      if (aliases.some((alias) => normalize(alias) === normalized)) return key;
    }
    const candidates = [];
    for (const [key, aliases] of Object.entries(FIELD_ALIASES)) {
      for (const alias of aliases) {
        const candidate = normalize(alias);
        if (normalized.includes(candidate)) candidates.push({ key, length: candidate.length });
      }
    }
    candidates.sort((a, b) => b.length - a.length);
    return candidates[0]?.key || null;
  }

  function mergeProfile(input) {
    const profile = clone(EMPTY_PROFILE);
    if (!input || typeof input !== "object") return profile;
    Object.assign(profile, input);
    profile.basic = Object.assign({}, EMPTY_PROFILE.basic, input.basic || {});
    profile.custom = Object.assign({}, input.custom || {});
    for (const key of ["education", "work", "internship", "projects", "works", "awards", "languages", "social"]) {
      profile[key] = Array.isArray(input[key]) ? input[key] : [];
    }
    profile.version = 1;
    return profile;
  }

  return {
    EMPTY_PROFILE,
    FIELD_ALIASES,
    SECTION_ALIASES,
    clone,
    normalize,
    matchesAlias,
    fieldKeyForLabel,
    mergeProfile
  };
});
