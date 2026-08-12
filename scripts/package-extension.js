#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const version = manifest.version;
const dist = path.join(root, "dist");
const staging = path.join(dist, `mokahr-autofill-extension-v${version}`);
const archiveName = `mokahr-autofill-chrome-edge-v${version}.zip`;
const archive = path.join(dist, archiveName);
const checksum = path.join(dist, "SHA256SUMS.txt");
const files = [
  "manifest.json",
  "content.js",
  "popup.html",
  "popup.js",
  "options.html",
  "options.js",
  "styles.css",
  "INSTALL.md",
  "lib/core.js",
  "lib/profile-schema.js"
];

if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid manifest version: ${version}`);
if (!staging.startsWith(`${dist}${path.sep}`)) throw new Error("Unsafe staging path");

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });

for (const relative of files) {
  const source = path.join(root, relative);
  if (!fs.statSync(source).isFile()) throw new Error(`Missing package file: ${relative}`);
  const destination = path.join(staging, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

const zipped = spawnSync("zip", ["-X", "-q", "-r", archive, "."], {
  cwd: staging,
  encoding: "utf8"
});
if (zipped.status !== 0) throw new Error(zipped.stderr || "zip failed");

const digest = crypto.createHash("sha256").update(fs.readFileSync(archive)).digest("hex");
fs.writeFileSync(checksum, `${digest}  ${archiveName}\n`, "utf8");
fs.rmSync(staging, { recursive: true, force: true });

console.log(`Created ${path.relative(root, archive)}`);
console.log(`Created ${path.relative(root, checksum)}`);
