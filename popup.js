(function () {
  "use strict";

  const status = document.getElementById("page-status");
  const result = document.getElementById("result");
  const fillButton = document.getElementById("fill");
  const captureButton = document.getElementById("capture");
  const Schema = globalThis.MokahrProfileSchema;
  const extensionVersion = chrome.runtime.getManifest().version;
  const CONNECT_RETRIES = globalThis.__MOKAHR_TEST__ ? 1 : 20;
  const CONNECT_RETRY_MS = 100;
  const CONTENT_FILES = ["lib/core.js", "lib/profile-schema.js", "content.js"];
  let pendingInjection = null;
  const sectionNames = {
    basic: "基本信息",
    education: "教育经历",
    work: "工作经历",
    internship: "实习经历",
    projects: "项目经历",
    works: "作品",
    awards: "获奖",
    languages: "语言能力",
    social: "社交账号",
    other: "自我评价和自定义字段",
    attachment: "附件简历"
  };

  async function activeTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  function knownRecruitingHost(url) {
    try {
      const hostname = new URL(url).hostname;
      return hostname === "jobs.feishu.cn" || hostname.endsWith(".jobs.feishu.cn") ||
        hostname === "mokahr.com" || hostname.endsWith(".mokahr.com");
    } catch (_) {
      return false;
    }
  }

  function customApplicationUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && /\/resume\/[^/]+\/apply\/?$/i.test(parsed.pathname);
    } catch (_) {
      return false;
    }
  }

  function supportedUrl(url) {
    return knownRecruitingHost(url) || customApplicationUrl(url);
  }

  function detectRecruitingPage() {
    const websiteInfo = document.getElementById("js-websiteInfo");
    if (websiteInfo?.textContent) {
      try {
        const parsed = JSON.parse(websiteInfo.textContent);
        if (parsed.website_info?.resume_form_schema) return true;
      } catch (_) {
        // Fall through to static asset detection when embedded JSON is malformed.
      }
    }
    return Boolean(document.querySelector([
      'script[src*="atsx-throne"]',
      'script[src*="saas-career"]',
      'script[src*="hire-fe-prod/portal"]'
    ].join(",")));
  }

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function sendToTab(tabId, message, retries = 0) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await chrome.tabs.sendMessage(tabId, message);
      } catch (error) {
        lastError = error;
        if (attempt < retries) await delay(CONNECT_RETRY_MS);
      }
    }
    throw lastError;
  }

  async function injectOnCustomDomain(tab) {
    if (pendingInjection?.tabId === tab.id) return pendingInjection.promise;
    const promise = (async () => {
      const detection = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: detectRecruitingPage
      });
      if (!detection?.some((frame) => frame.result === true)) {
        const error = new Error("当前页面不是可识别的 Mokahr / 飞书招聘申请页");
        error.code = "UNSUPPORTED_PAGE";
        throw error;
      }
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: CONTENT_FILES
      });
    })();
    pendingInjection = { tabId: tab.id, promise };
    try {
      await promise;
    } finally {
      if (pendingInjection?.promise === promise) pendingInjection = null;
    }
  }

  async function connect(tab, retries = 0) {
    try {
      return await sendToTab(tab.id, { type: "ping" }, knownRecruitingHost(tab.url) ? retries : 0);
    } catch (error) {
      if (knownRecruitingHost(tab.url) || !customApplicationUrl(tab.url)) throw error;
      await injectOnCustomDomain(tab);
      return sendToTab(tab.id, { type: "ping" }, retries);
    }
  }

  async function send(message, retries = 0) {
    const tab = await activeTab();
    if (!tab?.id) throw new Error("找不到当前标签页");
    if (!supportedUrl(tab.url)) throw new Error("请打开 Mokahr / 飞书招聘申请页");
    await connect(tab, retries);
    return sendToTab(tab.id, message);
  }

  function show(message, error = false) {
    result.textContent = message;
    result.classList.toggle("error", error);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type !== "fill-progress") return;
    if (message.stage === "waiting") {
      show("已连接页面，正在等待申请表加载…");
      return;
    }
    if (message.stage === "basic-done") {
      show(`基本信息已处理，已填 ${message.filled} 项；正在处理经历…`);
      return;
    }
    const name = sectionNames[message.detail];
    if (name) show(`正在处理${name}… 已填 ${message.filled} 项，跳过 ${message.skipped} 项`);
  });

  async function initialize() {
    const tab = await activeTab().catch(() => null);
    if (!tab?.id || !supportedUrl(tab.url)) {
      status.textContent = "请打开 Mokahr / 飞书招聘申请页";
      fillButton.disabled = true;
      captureButton.disabled = true;
      return;
    }
    try {
      const page = await connect(tab, CONNECT_RETRIES);
      if (page.version !== extensionVersion) {
        status.textContent = `扩展已更新到 v${extensionVersion}，请刷新当前申请页`;
        fillButton.disabled = true;
        captureButton.disabled = true;
        return;
      }
      status.textContent = `已识别当前招聘申请页 · v${extensionVersion}`;
    } catch (error) {
      if (error.code === "UNSUPPORTED_PAGE") {
        status.textContent = "此页面不是可识别的 Mokahr / 飞书招聘申请页";
        fillButton.disabled = true;
        captureButton.disabled = true;
      } else {
        status.textContent = "申请页正在加载；点击操作后会自动连接";
        fillButton.disabled = false;
        captureButton.disabled = false;
      }
    }
  }

  fillButton.addEventListener("click", async () => {
    fillButton.disabled = true;
    show("正在填充…");
    try {
      const { profile } = await chrome.storage.local.get("profile");
      if (!profile) throw new Error("请先在资料管理页保存个人资料");
      const report = await Promise.race([
        send({ type: "fill", profile }, CONNECT_RETRIES),
        new Promise((_, reject) => setTimeout(() => reject(new Error("填充超过 50 秒，已停止等待。请检查页面已填内容并重试。")), 50000))
      ]);
      if (report?.error) throw new Error(report.error);
      const skipped = report.skipped?.length || 0;
      const skippedPreview = skipped ? `：${report.skipped.slice(0, 8).join("、")}${skipped > 8 ? "…" : ""}` : "";
      const missing = report.missing?.length ? `；资料缺失：${report.missing.join("、")}` : "";
      show(`已填充 ${report.filled.length} 项${skipped ? `，${skipped} 项未匹配${skippedPreview}` : ""}${missing}。请检查后提交。`);
    } catch (error) {
      show(error.message, true);
    } finally {
      fillButton.disabled = false;
    }
  });

  captureButton.addEventListener("click", async () => {
    captureButton.disabled = true;
    show("正在读取当前页面…");
    try {
      const captured = await send({ type: "capture" }, CONNECT_RETRIES);
      const { profile: stored, profileMetadata } = await chrome.storage.local.get(["profile", "profileMetadata"]);
      const profile = Schema.mergeCapturedProfile(
        stored,
        captured.profile,
        captured.capturedSections,
        captured.clearedSections
      );
      const metadata = Schema.updateMetadata(profileMetadata, profile, {
        bumpRevision: true,
        lastSavedAt: captured.capturedAt || new Date().toISOString(),
        lastSaveMethod: "capture",
        _optionsWriteId: "",
        lastSourceUrl: captured.sourceUrl || "",
        lastSourceTitle: captured.sourceTitle || "",
        lastSourceAt: captured.capturedAt || new Date().toISOString()
      });
      await chrome.storage.local.set({ profile, profileMetadata: metadata });
      const updated = Schema.REPEAT_SECTIONS
        .filter((section) => captured.capturedSections?.includes(section.key) && captured.profile[section.key]?.length)
        .map((section) => `${section.title} ${captured.profile[section.key].length} 条`);
      const source = captured.sourceTitle || captured.sourceUrl || "当前页面";
      show(`已从“${source}”更新到 chrome.storage.local / profile${updated.length ? `；${updated.join("、")}` : "；未读取到非空经历条目"}。`);
    } catch (error) {
      show(error.message, true);
    } finally {
      captureButton.disabled = false;
    }
  });

  document.getElementById("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
  initialize();
})();
