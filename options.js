(function () {
  "use strict";

  const Core = globalThis.MokahrCore;
  const Schema = globalThis.MokahrProfileSchema;
  const form = document.getElementById("profile-form");
  const toast = document.getElementById("toast");
  let currentMetadata = Schema.createMetadata();
  let storedAttachment = null;
  let pendingAttachment = null;
  let attachmentRemoved = false;
  let rendering = false;
  let isDirty = false;
  let storedProfile = Core.mergeProfile();
  let localWriteSequence = 0;
  const localWriteIds = new Set();

  const methodLabels = {
    manual: "管理页保存",
    import: "JSON 导入",
    capture: "从招聘页面反向更新"
  };

  function notify(message, error = false) {
    toast.textContent = message;
    toast.classList.toggle("error", error);
    toast.classList.add("visible");
    setTimeout(() => toast.classList.remove("visible"), 2600);
  }

  function pretty(value) {
    return JSON.stringify(value, null, 2);
  }

  function showReceipt(title, detail, error = false) {
    const receipt = document.getElementById("operation-receipt");
    receipt.hidden = false;
    receipt.classList.toggle("error", error);
    document.getElementById("receipt-title").textContent = title;
    document.getElementById("receipt-detail").textContent = detail;
  }

  function createField(field, value, namePrefix) {
    const label = document.createElement("label");
    if (field.wide) label.classList.add("wide-field");
    label.append(document.createTextNode(field.label));
    const control = document.createElement(field.type === "textarea" ? "textarea" : "input");
    control.name = namePrefix ? `${namePrefix}.${field.key}` : field.key;
    control.dataset.field = field.key;
    control.value = value || "";
    if (field.type === "textarea") control.rows = 5;
    else {
      control.type = ["email", "url"].includes(field.type) ? field.type : "text";
      if (field.autocomplete) control.autocomplete = field.autocomplete;
      if (field.inputmode) control.inputMode = field.inputmode;
    }
    if (field.placeholder) control.placeholder = field.placeholder;
    else if (field.type === "month") control.placeholder = "YYYY-MM";
    else if (field.type === "date") control.placeholder = "YYYY-MM-DD";
    label.append(control);
    return label;
  }

  function renderBasic(profile) {
    const container = document.getElementById("basic-fields");
    container.replaceChildren(...Schema.BASIC_FIELDS.map((field) => createField(field, profile.basic[field.key])));
  }

  function entryTitle(section, index) {
    return `${section.itemTitle} ${index + 1}`;
  }

  function updateSectionPresentation(sectionElement) {
    const section = Schema.SECTION_MAP[sectionElement.dataset.section];
    const entries = Array.from(sectionElement.querySelectorAll(".resume-entry"));
    sectionElement.querySelector(".section-count").textContent = `${entries.length} 条`;
    sectionElement.querySelector(".empty-section").hidden = entries.length > 0;
    entries.forEach((entry, index) => {
      entry.dataset.index = String(index);
      entry.querySelector("h3").textContent = entryTitle(section, index);
    });
  }

  function createRepeatEntry(section, value) {
    const entry = document.createElement("article");
    entry.className = "resume-entry";
    const heading = document.createElement("div");
    heading.className = "entry-heading";
    const title = document.createElement("h3");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger-link remove-entry";
    remove.textContent = "删除";
    remove.setAttribute("aria-label", `删除${section.itemTitle}`);
    remove.addEventListener("click", () => {
      const sectionElement = entry.closest(".repeat-section");
      entry.remove();
      updateSectionPresentation(sectionElement);
      markDirty();
    });
    heading.append(title, remove);
    const fields = document.createElement("div");
    fields.className = "form-grid entry-fields";
    for (const field of section.fields) fields.append(createField(field, value?.[field.key], section.key));
    entry.append(heading, fields);
    return entry;
  }

  function addRepeatEntry(sectionElement, value = {}) {
    const section = Schema.SECTION_MAP[sectionElement.dataset.section];
    sectionElement.querySelector(".entries").append(createRepeatEntry(section, value));
    updateSectionPresentation(sectionElement);
  }

  function buildRepeatSections(profile) {
    const navigation = document.getElementById("repeat-nav");
    const container = document.getElementById("repeat-sections");
    navigation.replaceChildren();
    container.replaceChildren();
    for (const section of Schema.REPEAT_SECTIONS) {
      const navLink = document.createElement("a");
      navLink.href = `#section-${section.key}`;
      navLink.textContent = section.title;
      navigation.append(navLink);

      const element = document.createElement("section");
      element.id = `section-${section.key}`;
      element.className = "settings-section repeat-section";
      element.dataset.section = section.key;
      element.innerHTML = `
        <div class="section-heading">
          <div><h2>${section.title}</h2><p class="section-count">0 条</p></div>
          <button class="secondary add-entry" type="button">添加${section.itemTitle}</button>
        </div>
        <div class="entries"></div>
        <p class="empty-section">尚未添加${section.title}</p>`;
      element.querySelector(".add-entry").addEventListener("click", () => {
        addRepeatEntry(element);
        element.querySelector(".resume-entry:last-child input, .resume-entry:last-child textarea")?.focus();
        markDirty();
      });
      for (const item of profile[section.key]) addRepeatEntry(element, item);
      updateSectionPresentation(element);
      container.append(element);
    }
  }

  function createCustomRow(key = "", value = "") {
    const row = document.createElement("div");
    row.className = "custom-row";
    const keyInput = document.createElement("input");
    keyInput.className = "custom-key";
    keyInput.placeholder = "页面字段名称";
    keyInput.value = key;
    keyInput.setAttribute("aria-label", "自定义字段名称");
    const valueInput = document.createElement("textarea");
    valueInput.className = "custom-value";
    valueInput.rows = 2;
    valueInput.placeholder = "填写内容";
    valueInput.value = value;
    valueInput.setAttribute("aria-label", "自定义字段内容");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger-link";
    remove.textContent = "删除";
    remove.addEventListener("click", () => {
      row.remove();
      renderCustomEmptyState();
      markDirty();
    });
    row.append(keyInput, valueInput, remove);
    return row;
  }

  function renderCustomEmptyState() {
    const container = document.getElementById("custom-fields");
    let empty = container.querySelector(".empty-custom");
    const hasRows = Boolean(container.querySelector(".custom-row"));
    if (!empty) {
      empty = document.createElement("p");
      empty.className = "empty-section empty-custom";
      empty.textContent = "尚未添加自定义字段";
      container.append(empty);
    }
    empty.hidden = hasRows;
  }

  function renderCustom(custom) {
    const container = document.getElementById("custom-fields");
    container.replaceChildren(...Object.entries(custom || {}).map(([key, value]) => createCustomRow(key, value)));
    renderCustomEmptyState();
  }

  function renderProfile(input) {
    rendering = true;
    const profile = Core.mergeProfile(input);
    renderBasic(profile);
    buildRepeatSections(profile);
    form.elements.selfEvaluation.value = profile.selfEvaluation || "";
    renderCustom(profile.custom);
    document.getElementById("json-preview").value = pretty(profile);
    rendering = false;
    isDirty = false;
  }

  function collect() {
    const profile = Core.clone(Core.EMPTY_PROFILE);
    for (const field of Schema.BASIC_FIELDS) {
      const control = form.elements[field.key];
      profile.basic[field.key] = control ? control.value.trim() : "";
    }
    for (const section of Schema.REPEAT_SECTIONS) {
      const element = document.querySelector(`[data-section="${section.key}"]`);
      const entries = Array.from(element?.querySelectorAll(".resume-entry") || []).map((entry) => {
        const item = {};
        for (const field of section.fields) item[field.key] = entry.querySelector(`[data-field="${field.key}"]`)?.value.trim() || "";
        return item;
      });
      profile[section.key] = Schema.compactEntries(entries);
    }
    profile.selfEvaluation = form.elements.selfEvaluation.value.trim();
    profile.custom = {};
    for (const row of document.querySelectorAll(".custom-row")) {
      const key = row.querySelector(".custom-key").value.trim();
      const value = row.querySelector(".custom-value").value.trim();
      if (key && value) profile.custom[key] = value;
    }
    return profile;
  }

  function formatTime(value) {
    if (!value) return "无记录";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
  }

  function displayAttachment() {
    const name = attachmentRemoved ? "保存后移除" : pendingAttachment ? `${pendingAttachment.name}（保存后生效）` : storedAttachment?.name || "尚未保存附件";
    document.getElementById("attachment-name").textContent = name;
    document.getElementById("status-attachment").textContent = attachmentRemoved ? "待移除" : pendingAttachment?.name || storedAttachment?.name || "未保存";
  }

  function renderMetadata(input) {
    currentMetadata = Schema.createMetadata(input);
    document.getElementById("revision-badge").textContent = `版本 ${currentMetadata.revision}`;
    document.getElementById("last-saved").textContent = currentMetadata.lastSavedAt ? formatTime(currentMetadata.lastSavedAt) : "尚未保存";
    document.getElementById("last-method").textContent = methodLabels[currentMetadata.lastSaveMethod] || "-";
    document.getElementById("last-import").textContent = currentMetadata.lastImportFileName
      ? `${currentMetadata.lastImportFileName} · ${formatTime(currentMetadata.lastImportAt || currentMetadata.lastSavedAt)}`
      : "无记录";
    document.getElementById("last-export").textContent = currentMetadata.lastExportFileName
      ? `${currentMetadata.lastExportPath || currentMetadata.lastExportFileName} · ${formatTime(currentMetadata.lastExportAt)}`
      : "无记录";
    const source = document.getElementById("last-source");
    source.replaceChildren();
    if (currentMetadata.lastSourceUrl) {
      const link = document.createElement("a");
      link.href = currentMetadata.lastSourceUrl;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = currentMetadata.lastSourceTitle || currentMetadata.lastSourceUrl;
      source.append(link);
      if (currentMetadata.lastSourceTitle) {
        const url = document.createElement("span");
        url.className = "source-url";
        url.textContent = currentMetadata.lastSourceUrl;
        source.append(url);
      }
      source.append(document.createTextNode(formatTime(currentMetadata.lastSourceAt || currentMetadata.lastSavedAt)));
    } else source.textContent = "无反向更新记录";
    const counts = Schema.REPEAT_SECTIONS
      .filter((section) => currentMetadata.counts?.[section.key])
      .map((section) => `${section.title} ${currentMetadata.counts[section.key]}`);
    document.getElementById("section-counts").textContent = counts.join(" · ") || "暂无经历条目";
    document.getElementById("profile-json-path").value = currentMetadata.profileJsonPath || "";
    document.getElementById("save-state").textContent = isDirty
      ? "有未保存的更改"
      : currentMetadata.lastSavedAt ? "本地简历已保存" : "尚未保存本地简历";
    displayAttachment();
  }

  function markDirty() {
    if (rendering) return;
    isDirty = true;
    document.getElementById("save-state").textContent = "有未保存的更改";
  }

  async function setLocal(update) {
    const writeId = `options-${Date.now()}-${localWriteSequence += 1}`;
    const next = update.profileMetadata
      ? Object.assign({}, update, { profileMetadata: Object.assign({}, update.profileMetadata, { _optionsWriteId: writeId }) })
      : update;
    if (next.profileMetadata) localWriteIds.add(writeId);
    try {
      await chrome.storage.local.set(next);
    } catch (error) {
      localWriteIds.delete(writeId);
      throw error;
    }
  }

  async function removeLocal(key) {
    await chrome.storage.local.remove(key);
  }

  function handleStorageChanges(changes, areaName) {
    if (areaName !== "local") return;
    const writeId = changes.profileMetadata?.newValue?._optionsWriteId;
    if (writeId && localWriteIds.delete(writeId)) return;
    const external = changes;

    const hadUnsavedChanges = isDirty;
    const captureMetadataOnly = !external.profile && external.profileMetadata?.newValue?.lastSaveMethod === "capture";
    if (external.profile) {
      storedProfile = Core.mergeProfile(external.profile.newValue);
      renderProfile(storedProfile);
      if (!external.profileMetadata) renderMetadata(currentMetadata);
    }
    else if (captureMetadataOnly) renderProfile(storedProfile);
    if (external.profileMetadata) renderMetadata(external.profileMetadata.newValue);
    if (external.attachment) {
      storedAttachment = external.attachment.newValue?.data ? external.attachment.newValue : null;
      pendingAttachment = null;
      attachmentRemoved = false;
      displayAttachment();
    }

    if (external.profile || captureMetadataOnly) {
      const source = external.profileMetadata?.newValue?.lastSaveMethod === "capture"
        ? "招聘页面反向更新"
        : "其他扩展页面更新";
      const detail = hadUnsavedChanges
        ? `检测到${source}的资料；管理页已载入最新版本，原有未保存编辑已被替换，以免后续保存覆盖新资料。`
        : `检测到${source}的资料；管理页已自动载入最新版本。`;
      showReceipt("已同步最新简历", detail);
      notify("管理页已同步最新简历");
    }
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = () => reject(new Error("无法读取附件"));
      reader.readAsDataURL(file);
    });
  }

  async function saveProfile(method = "manual", extraMetadata = {}) {
    const profile = collect();
    const now = new Date().toISOString();
    const metadata = Schema.updateMetadata(currentMetadata, profile, Object.assign({
      bumpRevision: true,
      lastSavedAt: now,
      lastSaveMethod: method,
      profileJsonPath: document.getElementById("profile-json-path").value.trim()
    }, extraMetadata));
    const update = { profile, profileMetadata: metadata };
    if (pendingAttachment) {
      update.attachment = {
        name: pendingAttachment.name,
        type: pendingAttachment.type,
        data: await fileToBase64(pendingAttachment)
      };
    }
    await setLocal(update);
    if (attachmentRemoved) await removeLocal("attachment");
    if (pendingAttachment) storedAttachment = update.attachment;
    if (attachmentRemoved) storedAttachment = null;
    pendingAttachment = null;
    attachmentRemoved = false;
    storedProfile = profile;
    isDirty = false;
    renderMetadata(metadata);
    document.getElementById("json-preview").value = pretty(profile);
    return profile;
  }

  async function load() {
    const { profile, attachment, profileMetadata } = await chrome.storage.local.get(["profile", "attachment", "profileMetadata"]);
    storedAttachment = attachment?.data ? attachment : null;
    renderProfile(profile);
    storedProfile = Core.mergeProfile(profile);
    const metadata = Schema.updateMetadata(profileMetadata, storedProfile);
    renderMetadata(metadata);
  }

  document.getElementById("save").addEventListener("click", async () => {
    const button = document.getElementById("save");
    button.disabled = true;
    try {
      await saveProfile();
      const attachment = storedAttachment?.name ? `；附件位置 chrome.storage.local / attachment（${storedAttachment.name}）` : "；当前没有保存附件";
      showReceipt("保存完成", `结构化简历已写入 chrome.storage.local / profile${attachment}。`);
      notify("已保存到 chrome.storage.local / profile");
    } catch (error) {
      showReceipt("保存失败", error.message, true);
      notify(error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    document.getElementById("save").click();
  });

  document.getElementById("attachment-file").addEventListener("change", (event) => {
    pendingAttachment = event.target.files[0] || null;
    attachmentRemoved = false;
    displayAttachment();
    markDirty();
  });

  document.getElementById("remove-attachment").addEventListener("click", () => {
    pendingAttachment = null;
    attachmentRemoved = true;
    document.getElementById("attachment-file").value = "";
    displayAttachment();
    markDirty();
  });

  document.getElementById("add-custom").addEventListener("click", () => {
    const row = createCustomRow();
    document.getElementById("custom-fields").append(row);
    renderCustomEmptyState();
    row.querySelector("input").focus();
    markDirty();
  });

  document.getElementById("refresh-json").addEventListener("click", () => {
    document.getElementById("json-preview").value = pretty(collect());
  });

  function waitForDownload(downloadId) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => finish(new Error("等待导出完成超时，请在浏览器下载记录中检查文件")), 120000);
      let settled = false;
      function finish(error) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        chrome.downloads.onChanged.removeListener(listener);
        if (error) reject(error);
        else resolve();
      }
      function listener(delta) {
        if (delta.id !== downloadId || !delta.state) return;
        if (delta.state.current === "complete") finish();
        else if (delta.state.current === "interrupted") finish(new Error("导出已取消或被浏览器中断"));
      }
      chrome.downloads.onChanged.addListener(listener);
      chrome.downloads.search({ id: downloadId }).then(([download]) => {
        if (download?.state === "complete") finish();
        else if (download?.state === "interrupted") finish(new Error("导出已取消或被浏览器中断"));
      }).catch(() => {});
    });
  }

  async function exportJson(profile) {
    const filename = "mokahr-profile.json";
    const url = URL.createObjectURL(new Blob([pretty(profile)], { type: "application/json" }));
    try {
      const downloadId = await chrome.downloads.download({ url, filename, saveAs: true, conflictAction: "uniquify" });
      await waitForDownload(downloadId);
      const [download] = await chrome.downloads.search({ id: downloadId });
      return { filename: download?.filename?.split(/[\\/]/).pop() || filename, path: download?.filename || filename };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  document.getElementById("export").addEventListener("click", async () => {
    const button = document.getElementById("export");
    button.disabled = true;
    try {
      const profile = collect();
      const exported = await exportJson(profile);
      const metadata = Schema.updateMetadata(currentMetadata, storedProfile, {
        lastExportAt: new Date().toISOString(),
        lastExportFileName: exported.filename,
        lastExportPath: exported.path,
        profileJsonPath: exported.path
      });
      await setLocal({ profileMetadata: metadata });
      renderMetadata(metadata);
      showReceipt("导出完成", `JSON 已保存到 ${exported.path}；附件未包含在导出文件中。`);
      notify(`已导出到 ${exported.path}`);
    } catch (error) {
      showReceipt("导出未完成", error.message, true);
      notify(error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById("import").addEventListener("click", () => document.getElementById("import-file").click());
  document.getElementById("import-file").addEventListener("change", async (event) => {
    try {
      const file = event.target.files[0];
      if (!file) return;
      const imported = Schema.validateProfileInput(JSON.parse(await file.text()));
      const profile = Core.mergeProfile(imported);
      const metadata = Schema.updateMetadata(currentMetadata, profile, {
        bumpRevision: true,
        lastSavedAt: new Date().toISOString(),
        lastSaveMethod: "import",
        lastImportAt: new Date().toISOString(),
        lastImportFileName: file.name,
        profileJsonPath: document.getElementById("profile-json-path").value.trim()
      });
      await setLocal({ profile, profileMetadata: metadata });
      renderProfile(profile);
      storedProfile = profile;
      isDirty = false;
      renderMetadata(metadata);
      showReceipt("导入完成", `已从所选文件“${file.name}”导入，并写入 chrome.storage.local / profile。出于浏览器安全限制，源文件夹路径不可读取。`);
      notify(`已从 ${file.name} 导入并保存`);
    } catch (error) {
      showReceipt("导入失败", error.message, true);
      notify(`导入失败：${error.message}`, true);
    } finally {
      event.target.value = "";
    }
  });

  form.addEventListener("input", markDirty);
  window.addEventListener("beforeunload", (event) => {
    if (!isDirty) return;
    event.preventDefault();
    event.returnValue = "";
  });

  chrome.storage.onChanged.addListener(handleStorageChanges);

  if (globalThis.__MOKAHR_TEST__) {
    globalThis.__MOKAHR_OPTIONS_TEST_API__ = {
      renderProfile,
      collect,
      renderMetadata,
      addRepeatEntry,
      load,
      handleStorageChanges
    };
  }

  load().catch((error) => notify(`读取简历失败：${error.message}`, true));
})();
