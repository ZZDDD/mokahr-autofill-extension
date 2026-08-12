#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = process.argv[2];
if (!file) {
  console.error("Usage: node validate_profile_json.js <mokahr-profile.json>");
  process.exit(2);
}

const sectionFields = {
  education: ["school", "degree", "major", "educationType", "academicRanking", "startDate", "endDate"],
  work: ["company", "title", "startDate", "endDate", "description"],
  internship: ["company", "title", "startDate", "endDate", "description"],
  projects: ["nameOfItem", "role", "startDate", "endDate", "link", "description"],
  works: ["link", "description"],
  awards: ["nameOfItem", "date", "description"],
  languages: ["language", "proficiency"],
  social: ["platform", "link"]
};
const basicFields = new Set([
  "referralCode", "intentionCity", "name", "mobile", "email", "experienceYears", "age", "gender",
  "nationality", "currentCity", "hometownCity", "idType", "idNumber", "identification", "expectedLocation",
  "birthday", "maritalStatus", "currentHomeAddress"
]);
const topLevelFields = new Set(["version", "basic", ...Object.keys(sectionFields), "selfEvaluation", "custom"]);
const errors = [];

function object(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function checkKeys(value, allowed, location) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${location}.${key}: unsupported field`);
  }
}

function checkStringValues(value, location) {
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "string") errors.push(`${location}.${key}: expected a string`);
  }
}

let profile;
try {
  profile = JSON.parse(fs.readFileSync(file, "utf8"));
} catch (error) {
  console.error(`Invalid JSON: ${error.message}`);
  process.exit(1);
}

if (!object(profile)) errors.push("root: expected a JSON object");
else {
  checkKeys(profile, topLevelFields, "root");
  if (profile.version !== 1) errors.push("version: expected 1");
  if (!object(profile.basic)) errors.push("basic: expected an object");
  else {
    checkKeys(profile.basic, basicFields, "basic");
    checkStringValues(profile.basic, "basic");
    if (profile.basic.birthday && !/^\d{4}-\d{2}-\d{2}$/.test(profile.basic.birthday)) {
      errors.push("basic.birthday: expected YYYY-MM-DD");
    }
  }

  for (const [section, allowedFields] of Object.entries(sectionFields)) {
    const entries = profile[section];
    if (!Array.isArray(entries)) {
      errors.push(`${section}: expected an array`);
      continue;
    }
    entries.forEach((entry, index) => {
      const location = `${section}[${index}]`;
      if (!object(entry)) {
        errors.push(`${location}: expected an object`);
        return;
      }
      checkKeys(entry, new Set(allowedFields), location);
      checkStringValues(entry, location);
      for (const key of ["startDate", "endDate"]) {
        if (entry[key] && !/^\d{4}-\d{2}$/.test(entry[key])) errors.push(`${location}.${key}: expected YYYY-MM`);
      }
      if (section === "awards" && entry.date && !/^\d{4}(?:-\d{2})?$/.test(entry.date)) {
        errors.push(`${location}.date: expected YYYY or YYYY-MM`);
      }
    });
  }

  if (typeof profile.selfEvaluation !== "string") errors.push("selfEvaluation: expected a string");
  if (!object(profile.custom)) errors.push("custom: expected an object");
  else checkStringValues(profile.custom, "custom");
}

if (errors.length) {
  console.error(`Profile validation failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Valid Mokahr profile: ${path.resolve(file)}`);
