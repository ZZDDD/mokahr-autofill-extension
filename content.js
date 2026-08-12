(function () {
  "use strict";

  const Core = globalThis.MokahrCore;
  const Schema = globalThis.MokahrProfileSchema;
  const CONTENT_VERSION = chrome.runtime.getManifest().version;
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const MAX_FILL_MS = 45000;
  const MAX_FORM_WAIT_MS = 20000;

  function progress(stage, detail, report) {
    chrome.runtime.sendMessage({
      type: "fill-progress",
      stage,
      detail,
      filled: report?.filled.length || 0,
      skipped: report?.skipped.length || 0
    }).catch(() => {});
  }

  function assertWithinDeadline(deadline) {
    if (Date.now() > deadline) throw new Error("填充已超过 45 秒，已停止剩余项目，请检查已填内容");
  }

  function formReady() {
    return Boolean(document.querySelector([
      '[data-cy="nameInput"]',
      '[data-cy="field-name"]',
      '[data-cy="emailInput"]',
      '[data-cy="field-email"]',
      ".atsx-form-item input",
      ".atsx-form-item textarea",
      '[class*="createFormSection__"]'
    ].join(", ")));
  }

  function waitForFormReady(deadline) {
    if (formReady()) return Promise.resolve(true);
    const timeoutMs = Math.max(0, Math.min(MAX_FORM_WAIT_MS, deadline - Date.now()));
    return new Promise((resolve) => {
      let settled = false;
      const finish = (ready) => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        clearTimeout(timer);
        resolve(ready);
      };
      const observer = new MutationObserver(() => {
        if (formReady()) finish(true);
      });
      const timer = setTimeout(() => finish(formReady()), timeoutMs);
      observer.observe(document.documentElement || document, { childList: true, subtree: true });
      if (formReady()) finish(true);
    });
  }

  function visible(element) {
    if (!element) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
  }

  function cleanText(element) {
    return (element?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function labelOf(control) {
    const id = control.id;
    const explicit = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
    const item = control.closest(".atsx-form-item") || control.closest("[data-cy]");
    return cleanText(explicit || item?.querySelector("label") || item?.querySelector(".customResumeForm-fieldName"));
  }

  function writeNativeValue(control, value, blurAfter = true) {
    if (!control || value === undefined || value === null) return false;
    const proto = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (!setter) return false;
    control.focus?.({ preventScroll: true });
    setter.call(control, String(value));
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
    if (blurAfter) control.blur?.();
    return true;
  }

  function nativeSet(control, value, blurAfter = true) {
    if (value === "") return false;
    return writeNativeValue(control, value, blurAfter);
  }

  function valueMatches(control, value) {
    if (!control) return false;
    const wanted = Core.normalize(value);
    if (control.matches?.("input, textarea")) return Core.normalize(control.value) === wanted;
    return Core.normalize(displayedControlValue(control)).includes(wanted);
  }

  function controlIn(container) {
    const candidates = container?.matches?.("input, textarea, [role=combobox]")
      ? [container]
      : Array.from(container?.querySelectorAll?.("input:not([type=hidden]), textarea, [role=combobox]") || []);
    return candidates.find(visible) || candidates[0] || null;
  }

  function selectOptionScope(combo) {
    const controlledId = combo.getAttribute?.("aria-controls");
    if (controlledId) {
      const controlled = document.getElementById(controlledId);
      if (controlled) return controlled;
    }
    const dataCy = combo.getAttribute?.("data-cy");
    if (dataCy) {
      const dropdown = document.querySelector(`[data-cy="${CSS.escape(`${dataCy}Dropdown`)}"]`);
      if (dropdown) return dropdown;
    }

    const visibleOptions = Array.from(document.querySelectorAll("[role=option], .atsx-select-dropdown-menu-item, .atsx-cascader-menu-item"))
      .filter(visible);
    const owners = Array.from(new Set(visibleOptions.map((option) =>
      option.closest('[data-cy$="InputDropdown"], [role="listbox"], .atsx-select-dropdown')))).filter(Boolean);
    return owners.length === 1 ? owners[0] : null;
  }

  async function choose(control, value) {
    if (!control || value === undefined || value === null || value === "") return false;
    const combo = control.matches?.("[role=combobox]") ? control : control.closest?.("[role=combobox]") || control.parentElement?.querySelector?.("[role=combobox]");
    if (!combo) return nativeSet(control, value);
    combo.click();
    await delay(80);
    const searchCandidates = Array.from(combo.querySelectorAll("input")).concat(Array.from(combo.parentElement?.querySelectorAll?.("input.atsx-select-search__field") || []));
    const search = searchCandidates.find(visible) || (combo.closest(".atsx-select-combobox") ? searchCandidates[0] : null);
    if (search) {
      search.focus();
      nativeSet(search, value, false);
      await delay(100);
    }
    const wanted = Core.normalize(value);
    let option = null;
    const optionDeadline = Date.now() + 1200;
    while (!option && Date.now() < optionDeadline) {
      const scope = selectOptionScope(combo);
      const options = Array.from(scope?.querySelectorAll?.("[role=option], .atsx-select-dropdown-menu-item, .atsx-cascader-menu-item") || [])
        .filter(visible);
      option = options.find((item) => Core.normalize(cleanText(item)) === wanted) ||
        options.find((item) => Core.normalize(cleanText(item)).includes(wanted));
      if (!option) await delay(80);
    }
    if (option) {
      option.click();
      await delay(100);
      return valueMatches(combo, value) || !combo.isConnected;
    }
    if (search) {
      search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
      search.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
      await delay(100);
      return valueMatches(search, value) || valueMatches(combo, value);
    }
    document.body.click();
    return false;
  }

  async function setControl(control, value) {
    if (!control || value === undefined || value === null || value === "") return false;
    if (control.matches("[role=combobox]") || control.closest(".atsx-select, .atsx-cascader-picker")) return choose(control, value);
    return nativeSet(control, value);
  }

  function findByDataCy(names, scope = document) {
    for (const name of names) {
      const exact = scope.querySelector(`[data-cy="${CSS.escape(name)}"], [data-test="${CSS.escape(name)}"], #${CSS.escape(name)}`);
      if (exact) return controlIn(exact);
    }
    return null;
  }

  function findByLabel(label, scope = document) {
    const labels = Array.from(scope.querySelectorAll("label, .customResumeForm-fieldName"));
    const target = labels.find((item) => Core.matchesAlias(cleanText(item), [label]));
    if (!target) return null;
    if (target.tagName === "LABEL" && target.htmlFor) {
      const byId = document.getElementById(target.htmlFor);
      if (byId && (scope === document || scope.contains(byId))) return controlIn(byId);
    }
    return controlIn(target.closest(".atsx-form-item") || target.parentElement);
  }

  function fieldItemByLabel(label, scope = document) {
    const labels = Array.from(scope.querySelectorAll("label, .customResumeForm-fieldName"));
    const target = labels.find((item) => Core.matchesAlias(cleanText(item), [label]));
    return target?.closest(".atsx-form-item") || target?.parentElement || null;
  }

  function displayedValueMatches(item, value) {
    if (!item) return false;
    const compact = (text) => String(text || "").toLowerCase().replace(/[^0-9a-z\u4e00-\u9fff]+/g, "");
    const displayed = compact(cleanText(item));
    const wanted = compact(value);
    if (wanted && displayed.includes(wanted)) return true;
    const digits = String(value || "").replace(/\D/g, "");
    return digits.length >= 7 && displayed.replace(/\D/g, "").includes(digits.slice(-11));
  }

  const BASIC_SELECTORS = {
      referralCode: ["field-referral-code"],
      intentionCity: ["intentionCityInput", "intention_cityInput"],
      name: ["nameInput", "field-name", "name"],
      mobile: ["mobileInput", "mobile"],
      email: ["emailInput", "field-email", "email"],
      experienceYears: ["experienceYearsInput", "experience_yearsInput", "field-ExperienceYears"],
      age: ["ageInput", "field-age", "age"],
      gender: ["genderInput", "field-gender", "gender"],
      nationality: ["nationalityInput", "field-nationality", "nationality"],
      currentCity: ["currentCityInput", "current_cityInput", "field-currentCity"],
      hometownCity: ["hometownCityInput", "hometown_cityInput", "field-hometown", "field-hometownCity"],
      idType: ["identification_type", "identificationTypeInput", "idTypeInput", "identityTypeInput"],
      idNumber: ["identification_numberInput", "identification_numberinput", "idNumberInput", "identityNumberInput"],
      identification: ["identificationInput", "identification"],
      expectedLocation: ["preferredCityInput", "preferred_city_listInput", "field-preferredCity", "preferredCityListInput", "expectedLocationInput", "expectCityInput"],
      birthday: ["birthdayInput", "birthday"],
      maritalStatus: ["maritalStatusInput", "marital_statusInput"],
      currentHomeAddress: ["currentHomeAddressInput", "current_home_addressInput"]
  };

  async function fillBasic(profile, report, deadline) {
    for (const [key, selectors] of Object.entries(BASIC_SELECTORS)) {
      assertWithinDeadline(deadline);
      const value = profile.basic[key];
      if (!value) continue;
      let control = findByDataCy(selectors);
      if (!control) {
        const alias = Core.FIELD_ALIASES[key]?.[0];
        control = alias ? findByLabel(alias) : null;
      }
      if (await setControl(control, value)) {
        report.filled.push(key);
        continue;
      }
      const alias = Core.FIELD_ALIASES[key]?.[0];
      const item = alias ? fieldItemByLabel(alias) : null;
      if (displayedValueMatches(item, value)) report.filled.push(`${key}(已有)`);
      else if (item) report.skipped.push(key);
      else report.ignored.push(key);
    }
  }

  function sectionFor(key) {
    const aliases = Core.SECTION_ALIASES[key] || [];
    const sections = Array.from(document.querySelectorAll('[class*="createFormSection__"], .createFormSection, section'));
    return sections.find((section) => {
      const title = section.querySelector(".createFormSection-title, h1, h2, h3");
      return title && Core.matchesAlias(cleanText(title), aliases);
    }) || null;
  }

  const PATH_NAMES = Object.fromEntries(Schema.REPEAT_SECTIONS.map((section) => [section.key, section.prefix]));

  function rowsIn(section, key) {
    const prefix = PATH_NAMES[key];
    if (!prefix) return [];

    const indexedControls = Array.from(section.querySelectorAll("[data-cy]"));
    const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\[(\\d+)\\]\\.`);
    const rowIndices = new Map();
    for (const control of indexedControls) {
      const match = control.getAttribute("data-cy")?.match(pattern);
      if (!match) continue;
      const element = control.closest(".resumeEditForm-item") || control.closest(`[class*="resumeEditForm-${prefix}"]`);
      if (!element) continue;
      if (!rowIndices.has(element)) rowIndices.set(element, new Set());
      rowIndices.get(element).add(Number(match[1]));
    }

    return Array.from(rowIndices, ([element, indices]) =>
      indices.size === 1 ? { index: Array.from(indices)[0], element } : null).filter(Boolean);
  }

  function addButton(section) {
    const candidates = Array.from(section.querySelectorAll('button, .formOperate-addBtn, .addMore, [class*="createFormSection-addBtn"], [class*="createFormSection-add__wrapper"]'));
    return candidates.find((item) =>
      visible(item) &&
      !item.classList.contains("formOperate-addBtn-container") &&
      !Array.from(item.classList).some((name) => name.includes("add__wrapper")) &&
      (item.classList.contains("formOperate-addBtn") ||
        item.classList.contains("addMore") ||
        Array.from(item.classList).some((name) => name.includes("createFormSection-addBtn")) ||
        Core.matchesAlias(cleanText(item), ["添加", "add"]))
    ) || (section.classList.contains("createFormSection-empty") ? section : null);
  }

  async function waitForMoreRows(section, key, previousCount) {
    const end = Date.now() + 2000;
    while (Date.now() < end) {
      await delay(80);
      const currentSection = section.isConnected ? section : sectionFor(key);
      const rows = currentSection ? rowsIn(currentSection, key) : [];
      if (rows.length > previousCount) return { section: currentSection, rows };
    }
    const currentSection = sectionFor(key) || section;
    return { section: currentSection, rows: rowsIn(currentSection, key) };
  }

  async function ensureRows(section, key, count, deadline) {
    let currentSection = section;
    let rows = rowsIn(currentSection, key);
    let attempts = 0;
    const maxAttempts = Math.max(count - rows.length, 0);
    while (rows.length < count && attempts < maxAttempts) {
      assertWithinDeadline(deadline);
      const button = addButton(currentSection);
      if (!button) break;
      const previousCount = rows.length;
      button.scrollIntoView({ block: "center", behavior: "auto" });
      button.click();
      attempts += 1;
      const result = await waitForMoreRows(currentSection, key, previousCount);
      currentSection = result.section;
      rows = result.rows;
      if (rows.length <= previousCount) break;
    }
    if (rows.length >= count) await waitForRowStructureStable(key, deadline);
    return rows;
  }

  function noWorkExperienceCheckbox(section = sectionFor("work")) {
    const label = Array.from(section?.querySelectorAll("label") || [])
      .find((item) => /没有工作经历|无工作经历|no work experience/i.test(cleanText(item)));
    return label?.querySelector('input[type="checkbox"]') || null;
  }

  async function clearWorkExperienceFields(deadline) {
    const section = sectionFor("work");
    if (!section) return;
    for (const { element } of rowsIn(section, "work")) {
      for (const control of element.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea')) {
        assertWithinDeadline(deadline);
        if (control.value) {
          writeNativeValue(control, "");
          await delay(60);
        }
      }
    }
  }

  async function syncWorkExperienceState(hasExperience, report, deadline) {
    if (!hasExperience) await clearWorkExperienceFields(deadline);
    let checkbox = noWorkExperienceCheckbox();
    if (!checkbox) return;
    const shouldBeChecked = !hasExperience;
    if (checkbox.checked === shouldBeChecked) return;
    checkbox.click();
    const end = Math.min(deadline, Date.now() + 1500);
    while (Date.now() < end) {
      await delay(60);
      checkbox = noWorkExperienceCheckbox();
      if (checkbox?.checked === shouldBeChecked) {
        report.filled.push(hasExperience ? "work(已启用工作经历)" : "work(没有工作经历)");
        return;
      }
    }
    report.skipped.push(hasExperience ? "work(无法取消没有工作经历)" : "work(无法设置没有工作经历)");
  }

  const ROW_FIELDS = Object.fromEntries(Schema.REPEAT_SECTIONS.map((section) => [section.key, section.fields.map((field) => field.key)]));
  const PATH_FIELDS = Object.fromEntries(Schema.REPEAT_SECTIONS.flatMap((section) =>
    section.fields.map((field) => [field.key, field.paths || [field.key]])));

  async function waitForRowStructureStable(sectionKey, deadline) {
    let previous = "";
    let stableSamples = 0;
    while (stableSamples < 2) {
      assertWithinDeadline(deadline);
      await delay(80);
      const section = sectionFor(sectionKey);
      const signature = section ? rowsIn(section, sectionKey)
        .map((row) => `${row.index}:${row.element.getAttribute("class") || ""}`)
        .join("|") : "";
      stableSamples = signature && signature === previous ? stableSamples + 1 : 0;
      previous = signature;
    }
  }

  function rowControl(row, sectionKey, index, field) {
    const prefix = PATH_NAMES[sectionKey];
    for (const suffix of PATH_FIELDS[field] || []) {
      const control = findByDataCy([`${prefix}[${index}].${suffix}Input`, `${prefix}[${index}].${suffix}`], row);
      if (control) return control;
    }
    if (field === "startDate" || field === "endDate") {
      const dateInputs = Array.from(row.querySelectorAll("input")).filter((item) => /date|time|日期|时间/i.test(`${item.id} ${item.placeholder}`));
      return dateInputs[field === "startDate" ? 0 : 1] || null;
    }
    const aliasKey = field === "nameOfItem" ? "nameOfItem" : field;
    for (const alias of Core.FIELD_ALIASES[aliasKey] || []) {
      const found = findByLabel(alias, row);
      if (found) return found;
    }
    return null;
  }

  async function waitForVisible(selector, timeoutMs = 1200) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const element = Array.from(document.querySelectorAll(selector)).find(visible);
      if (element) return element;
      await delay(60);
    }
    return null;
  }

  function datePanelChoice(dropdown, columnIndex, value) {
    const columns = Array.from(dropdown.querySelectorAll(".atsx-date-picker-period-month-panel-list"));
    const column = columns[columnIndex];
    if (!column) return null;
    const exact = column.querySelector(`.atsx-date-picker-period-month-panel-list-item[data-cy="${CSS.escape(value)}"]`);
    if (exact && visible(exact)) return exact;
    return Array.from(column.querySelectorAll(".atsx-date-picker-period-month-panel-list-item"))
      .find((item) => visible(item) && cleanText(item) === value) || null;
  }

  function selectedDatePanelValue(dropdown, columnIndex) {
    const columns = Array.from(dropdown.querySelectorAll(".atsx-date-picker-period-month-panel-list"));
    const selected = columns[columnIndex]?.querySelector(".atsx-date-picker-period-month-panel-list-item-selected");
    return selected ? (selected.getAttribute("data-cy") || cleanText(selected)).trim() : "";
  }

  async function waitForDatePanelSelection(dropdownSelector, columnIndex, value, timeoutMs = 1500) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const dropdown = Array.from(document.querySelectorAll(dropdownSelector)).find(visible);
      if (dropdown && selectedDatePanelValue(dropdown, columnIndex) === value) return dropdown;
      await delay(60);
    }
    return null;
  }

  function displayedDatePart(target) {
    if (!target) return "";
    const year = cleanText(target.querySelector?.('[data-cy="year"]'));
    const month = cleanText(target.querySelector?.('[data-cy="month"]'));
    return normalizeDate([year, month].filter(Boolean).join("-"));
  }

  async function waitForDatePart(targetDataCy, value, timeoutMs = 1500) {
    const expected = normalizeDate(value);
    const end = Date.now() + timeoutMs;
    let stableSamples = 0;
    while (Date.now() < end) {
      await delay(60);
      const target = document.querySelector(`[data-cy="${CSS.escape(targetDataCy)}"]`);
      stableSamples = displayedDatePart(target) === expected ? stableSamples + 1 : 0;
      if (stableSamples >= 2) return true;
    }
    return false;
  }

  async function chooseDatePart(target, value, dropdownDataCy) {
    if (!target || !value) return false;
    if (/^(至今|present|current)$/i.test(String(value).trim())) {
      const wrapper = target.closest('[data-cy$="periodInput"]') || target.parentElement;
      const current = Array.from(wrapper?.querySelectorAll("label, button, span") || [])
        .find((item) => visible(item) && /^(至今|现在|present|current)$/i.test(cleanText(item)));
      if (current) {
        current.click();
        await delay(100);
        return true;
      }
      return false;
    }
    const [year, rawMonth] = String(value).split("-");
    const month = rawMonth ? String(Number(rawMonth)).padStart(2, "0") : "";
    const targetDataCy = target.getAttribute("data-cy");
    if (!targetDataCy) return false;
    const expected = month ? `${year}-${month}` : year;
    if (displayedDatePart(target) === expected) return true;
    target.click();
    const dropdownSelector = `[data-cy="${CSS.escape(dropdownDataCy)}"]`;
    let dropdown = await waitForVisible(dropdownSelector);
    if (!dropdown) return false;
    const yearChoice = datePanelChoice(dropdown, 0, year);
    if (yearChoice) {
      yearChoice.click();
      dropdown = await waitForDatePanelSelection(dropdownSelector, 0, year);
      if (!dropdown) return false;
    }
    if (month) {
      const monthChoice = datePanelChoice(dropdown, 1, month);
      if (monthChoice) {
        monthChoice.click();
        return waitForDatePart(targetDataCy, `${year}-${month}`);
      }
    }
    return Boolean(yearChoice && !month && await waitForDatePart(targetDataCy, year));
  }

  async function fillPeriodField(row, sectionKey, index, field, value) {
    if (!value) return { supported: true, filled: false };
    const prefix = PATH_NAMES[sectionKey];
    const wrapper = row.querySelector(`[data-cy="${CSS.escape(`${prefix}[${index}].periodInput`)}"]`);
    if (!wrapper) return { supported: Boolean(fieldItemByLabel("起止时间", row)), filled: false };
    const begin = wrapper.querySelector('[data-cy$="InputBegin"]') || wrapper.children[0];
    const end = wrapper.querySelector('[data-cy$="InputEnd"]') || wrapper.children[2];
    const isStart = field === "startDate";
    const target = isStart ? begin : end;
    const edge = isStart ? "Begin" : "End";
    return {
      supported: true,
      filled: await chooseDatePart(target, value, `${prefix}[${index}].periodInput${edge}Dropdown`)
    };
  }

  const IDENTITY_FIELDS = {
    education: ["school"],
    work: ["company", "title"],
    internship: ["company", "title"],
    projects: ["nameOfItem"],
    works: ["link"],
    awards: ["nameOfItem"],
    languages: ["language"],
    social: ["platform", "link"]
  };

  function identityFor(key, item) {
    for (const field of IDENTITY_FIELDS[key] || []) {
      if (Schema.nonEmpty(item?.[field])) return { field, value: item[field] };
    }
    return null;
  }

  function displayedControlValue(container) {
    if (!container) return "";
    if (container.matches?.("input, textarea")) return container.value.trim();
    const selected = container.querySelector?.("[data-cy-value], .atsx-select-selection-selected-value, .atsx-select-selection__choice__content");
    if (selected) return (selected.getAttribute?.("data-cy-value") || cleanText(selected)).trim();
    const nestedInput = Array.from(container.querySelectorAll?.("input, textarea") || [])
      .find((control) => control.value?.trim());
    if (nestedInput) return nestedInput.value.trim();
    const mirror = container.querySelector?.(".atsx-select-search__field__mirror");
    return cleanText(mirror).replace(/\u00a0/g, " ").trim();
  }

  function rowFieldValue(row, sectionKey, index, field) {
    const prefix = PATH_NAMES[sectionKey];
    for (const suffix of PATH_FIELDS[field] || []) {
      const input = row.querySelector(`[data-cy="${CSS.escape(`${prefix}[${index}].${suffix}Input`)}"]`);
      const wrapper = row.querySelector(`[data-cy="${CSS.escape(`${prefix}[${index}].${suffix}`)}"]`);
      const value = displayedControlValue(input) || displayedControlValue(wrapper);
      if (value) return value;
    }
    return "";
  }

  function snapshotRows(sectionKey) {
    const section = sectionFor(sectionKey);
    if (!section) return [];
    return rowsIn(section, sectionKey).map((row, position) => {
      const values = Object.fromEntries(ROW_FIELDS[sectionKey]
        .filter((field) => field !== "startDate" && field !== "endDate")
        .map((field) => [field, Core.normalize(rowFieldValue(row.element, sectionKey, row.index, field))]));
      const period = readPeriod(row.element, sectionKey, row.index);
      values.startDate = normalizeDate(period.startDate);
      values.endDate = normalizeDate(period.endDate);
      return {
        element: row.element,
        index: row.index,
        position,
        values,
        signature: JSON.stringify(values)
      };
    });
  }

  function rowAtPosition(sectionKey, position) {
    return snapshotRows(sectionKey)[position] || null;
  }

  async function waitForRowField(sectionKey, position, field, value, deadline) {
    const wanted = Core.normalize(value);
    const end = Math.min(deadline, Date.now() + 1500);
    let stableSamples = 0;
    do {
      await delay(60);
      const row = rowAtPosition(sectionKey, position);
      stableSamples = row?.values[field] === wanted ? stableSamples + 1 : 0;
      if (stableSamples >= 2) return row;
    } while (Date.now() < end);
    return null;
  }

  function skipItem(report, key, itemIndex, item, reason) {
    const fields = ROW_FIELDS[key].filter((field) => Schema.nonEmpty(item[field]));
    if (!fields.length) report.skipped.push(`${key}[${itemIndex}](${reason})`);
    else for (const field of fields) report.skipped.push(`${key}[${itemIndex}].${field}(${reason})`);
  }

  async function fillRowAtPosition(key, itemIndex, item, report, deadline, requestedFields = ROW_FIELDS[key]) {
    const identity = identityFor(key, item);
    const requested = new Set(requestedFields);
    requested.add(identity.field);
    const fields = [identity.field, ...ROW_FIELDS[key].filter((field) => field !== identity.field && requested.has(field))];

    for (const field of fields) {
      const value = item[field];
      if (!value) continue;
      assertWithinDeadline(deadline);
      const currentRow = rowAtPosition(key, itemIndex);
      if (!currentRow) {
        report.skipped.push(`${key}[${itemIndex}].${field}(目标行无法确认，已停止该条)`);
        return false;
      }

      if (field !== identity.field &&
        currentRow.values[identity.field] !== Core.normalize(identity.value)) {
        report.skipped.push(`${key}[${itemIndex}].${field}(目标行身份不一致，已停止该条)`);
        return false;
      }
      if (field === "startDate" || field === "endDate") {
        const period = await fillPeriodField(currentRow.element, key, currentRow.index, field, value);
        if (period.filled) report.filled.push(`${key}[${itemIndex}].${field}`);
        else if (period.supported) report.skipped.push(`${key}[${itemIndex}].${field}`);
        else report.ignored.push(`${key}[${itemIndex}].${field}`);
        continue;
      }

      const wanted = Core.normalize(value);
      if (currentRow.values[field] === wanted) {
        report.filled.push(`${key}[${itemIndex}].${field}(已有)`);
        continue;
      }

      const control = rowControl(currentRow.element, key, currentRow.index, field);
      const attempted = await setControl(control, value);
      const confirmedRow = control
        ? await waitForRowField(key, itemIndex, field, value, deadline)
        : null;
      if (confirmedRow) {
        report.filled.push(`${key}[${itemIndex}].${field}`);
        continue;
      }

      const aliases = Core.FIELD_ALIASES[field === "nameOfItem" ? "nameOfItem" : field] || [];
      const exists = aliases.some((alias) => fieldItemByLabel(alias, currentRow.element));
      if (!attempted) {
        if (field === identity.field) report.skipped.push(`${key}[${itemIndex}].${field}(身份字段未匹配，已停止该条)`);
        else if (exists) report.skipped.push(`${key}[${itemIndex}].${field}`);
        else report.ignored.push(`${key}[${itemIndex}].${field}`);
      } else {
        report.skipped.push(`${key}[${itemIndex}].${field}(控件写入未确认，已停止该条)`);
      }
      if (field === identity.field || attempted) return false;
    }

    const finalRow = rowAtPosition(key, itemIndex);
    return Boolean(finalRow && finalRow.values[identity.field] === Core.normalize(identity.value));
  }

  function rowMismatchedFields(row, key, item) {
    return ROW_FIELDS[key].filter((field) =>
      Schema.nonEmpty(item[field]) && row?.values[field] !==
        (field === "startDate" || field === "endDate" ? normalizeDate(item[field]) : Core.normalize(item[field])));
  }

  function sectionMatchesProfile(key, values) {
    const rows = snapshotRows(key);
    return values.every((item, index) => rowMismatchedFields(rows[index], key, item).length === 0);
  }

  async function repairSectionByOrder(key, values, report, deadline) {
    const repairReport = { filled: [], skipped: [], ignored: [] };
    for (let index = 0; index < values.length; index += 1) {
      const row = rowAtPosition(key, index);
      if (!row) return false;
      const mismatched = rowMismatchedFields(row, key, values[index]);
      if (!await fillRowAtPosition(key, index, values[index], repairReport, deadline, mismatched)) return false;
    }
    if (repairReport.skipped.length) return false;
    report.filled.push(`${key}(已校正页面异步覆盖)`);
    return true;
  }

  async function stabilizeSection(key, values, report, deadline) {
    let stableSamples = 0;
    let repairAttempts = 0;
    while (stableSamples < 2) {
      assertWithinDeadline(deadline);
      await delay(120);
      if (sectionMatchesProfile(key, values)) {
        stableSamples += 1;
        continue;
      }
      stableSamples = 0;
      if (repairAttempts >= 2 || !await repairSectionByOrder(key, values, report, deadline)) return false;
      repairAttempts += 1;
    }
    return true;
  }

  async function stabilizeProfileRows(profile, report, deadline, stableMs = 900) {
    const sections = Object.keys(ROW_FIELDS)
      .filter((key) => profile[key]?.length && sectionFor(key));
    if (!sections.length) return true;

    let stableSince = Date.now();
    let repairAttempts = 0;
    while (Date.now() - stableSince < stableMs) {
      assertWithinDeadline(deadline);
      await delay(120);
      const mismatched = sections.filter((key) => !sectionMatchesProfile(key, profile[key]));
      if (!mismatched.length) continue;

      stableSince = Date.now();
      if (repairAttempts >= 3) {
        report.skipped.push(`经历最终核验失败：${mismatched.join("、")}`);
        return false;
      }
      for (const key of mismatched) {
        if (!await repairSectionByOrder(key, profile[key], report, deadline)) {
          report.skipped.push(`${key}(最终顺序校正失败)`);
          return false;
        }
      }
      repairAttempts += 1;
    }
    return true;
  }

  async function fillRows(profile, report, deadline) {
    await syncWorkExperienceState(Boolean(profile.work?.length), report, deadline);
    for (const key of Object.keys(ROW_FIELDS)) {
      assertWithinDeadline(deadline);
      const values = profile[key];
      if (!values?.length) continue;
      progress("section", key, report);
      if (!sectionFor(key)) {
        report.skipped.push(key);
        continue;
      }
      await ensureRows(sectionFor(key), key, values.length, deadline);
      let completedItems = 0;
      for (let index = 0; index < values.length; index += 1) {
        assertWithinDeadline(deadline);
        const item = values[index];
        const identity = identityFor(key, item);
        if (!identity) {
          skipItem(report, key, index, item, "缺少身份字段");
          continue;
        }

        if (!rowAtPosition(key, index)) {
          for (let rest = index; rest < values.length; rest += 1) {
            skipItem(report, key, rest, values[rest], "对应表单行不存在，已停止该区块");
          }
          break;
        }

        if (!await fillRowAtPosition(key, index, item, report, deadline)) {
          for (let rest = index + 1; rest < values.length; rest += 1) {
            skipItem(report, key, rest, values[rest], "上一条目标行未确认，已停止该区块");
          }
          break;
        }
        completedItems += 1;
      }

      if (completedItems === values.length && !await stabilizeSection(key, values, report, deadline)) {
        report.skipped.push(`${key}(页面异步改写后校正失败：请检查条目顺序)`);
      }
    }
    await stabilizeProfileRows(profile, report, deadline);
    await syncWorkExperienceState(Boolean(profile.work?.length), report, deadline);
  }

  function findCustomByLabel(label) {
    const wanted = Core.normalize(label);
    const labels = Array.from(document.querySelectorAll("label, .customResumeForm-fieldName"));
    for (const target of labels) {
      if (Core.normalize(cleanText(target)) !== wanted) continue;
      if (target.closest(".resumeEditForm-item, [class*='createFormSection-repeatable']")) continue;
      if (target.tagName === "LABEL" && target.htmlFor) {
        const byId = document.getElementById(target.htmlFor);
        if (byId) return controlIn(byId);
      }
      const control = controlIn(target.closest(".atsx-form-item") || target.parentElement);
      if (control) return control;
    }
    return null;
  }

  async function fillCustom(profile, report, deadline) {
    for (const [label, value] of Object.entries(profile.custom || {})) {
      assertWithinDeadline(deadline);
      const control = findCustomByLabel(label);
      if (await setControl(control, value)) report.filled.push(`custom.${label}`);
      else report.ignored.push(`custom.${label}(未找到独立自定义字段)`);
    }
    if (profile.selfEvaluation) {
      const control = findByLabel("自我评价") || document.querySelector('[data-cy*="self_evaluation"][data-cy$="Input"]');
      if (await setControl(control, profile.selfEvaluation)) report.filled.push("selfEvaluation");
      else report.skipped.push("selfEvaluation");
    }
  }

  function base64ToFile(attachment) {
    const binary = atob(attachment.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], attachment.name, { type: attachment.type || "application/octet-stream" });
  }

  async function fillAttachment(report) {
    const { attachment } = await chrome.storage.local.get("attachment");
    if (!attachment?.data) return;
    const resumeArea = Array.from(document.querySelectorAll('[data-test*="upload"], [class*="uploadResume"], [class*="resumeAttachment"]')).find((item) => /简历|resume/i.test(cleanText(item)) || item.matches('[class*="uploadResume"]'));
    const input = resumeArea?.querySelector('input[type="file"]') || Array.from(document.querySelectorAll('input[type="file"]')).find(visible) || document.querySelector('input[type="file"]');
    if (!input) {
      report.skipped.push("attachment");
      return;
    }
    const transfer = new DataTransfer();
    transfer.items.add(base64ToFile(attachment));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    report.filled.push("attachment");
    await delay(300);
  }

  const SCHEMA_PROFILE_FIELDS = {
    name: ["basic", "name"], mobile: ["basic", "mobile"], email: ["basic", "email"],
    age: ["basic", "age"], gender: ["basic", "gender"], identification: ["basic", "identification"],
    experience_years: ["basic", "experienceYears"], nationality: ["basic", "nationality"],
    current_city: ["basic", "currentCity"], hometown: ["basic", "hometownCity"],
    birthday: ["basic", "birthday"], marital_status: ["basic", "maritalStatus"],
    current_home_address: ["basic", "currentHomeAddress"],
    preferred_city_list: ["basic", "expectedLocation"], school: ["education", "school"],
    degree: ["education", "degree"], field_of_study: ["education", "major"],
    start_end_time: ["education", "startDate"]
  };

  function profileValue(profile, path) {
    if (path[0] === "education") return profile.education?.[0]?.[path[1]];
    return profile[path[0]]?.[path[1]];
  }

  function pageBasicValue(key) {
    const selectors = BASIC_SELECTORS[key] || [];
    const alias = Core.FIELD_ALIASES[key]?.[0];
    const control = findByDataCy(selectors) || (alias ? findByLabel(alias) : null);
    const controlValue = displayedControlValue(control);
    if (controlValue) return controlValue;
    if (key === "mobile") {
      const phone = Array.from(document.querySelectorAll('[class*="phoneNumber"], [class*="mobile"]'))
        .find((element) => /\d{7,}/.test(cleanText(element).replace(/\D/g, "")));
      if (phone) return cleanText(phone);
    }
    const item = alias ? fieldItemByLabel(alias) : null;
    const label = item?.querySelector("label, .customResumeForm-fieldName");
    const text = cleanText(item);
    const labelText = cleanText(label);
    const remainder = labelText && text.startsWith(labelText) ? text.slice(labelText.length).trim() : "";
    return remainder && !/^(请选择|未填写|-)$/.test(remainder) ? remainder : "";
  }

  function requiredProfileGaps(profile) {
    const schemaNode = document.getElementById("js-websiteInfo");
    if (!schemaNode?.textContent) return [];
    try {
      const schema = JSON.parse(schemaNode.textContent).website_info?.resume_form_schema?.object_list || [];
      const gaps = [];
      for (const group of schema) {
        for (const field of group.children || []) {
          const attributes = field.attributes || {};
          if (!attributes.visible || !attributes.required) continue;
          const fieldName = attributes.field_type?.name;
          const path = SCHEMA_PROFILE_FIELDS[fieldName];
          if (!path) continue;
          let value = profileValue(profile, path);
          if (fieldName === "identification") value ||= profile.basic.idNumber;
          value ||= pageBasicValue(path[1]);
          if (!value) gaps.push(attributes.i18n_name || attributes.name?.zh_cn || fieldName);
        }
      }
      return Array.from(new Set(gaps));
    } catch (_) {
      return [];
    }
  }

  async function fillPage(profile) {
    const report = { filled: [], skipped: [], ignored: [], missing: [] };
    const merged = Core.mergeProfile(profile);
    const deadline = Date.now() + MAX_FILL_MS;
    if (!formReady()) progress("waiting", "page", report);
    if (!await waitForFormReady(deadline)) throw new Error("申请表在 20 秒内仍未加载，请检查网络或刷新页面后重试");
    report.missing = requiredProfileGaps(merged);
    progress("basic", "basic", report);
    await fillBasic(merged, report, deadline);
    progress("basic-done", "basic", report);
    await fillRows(merged, report, deadline);
    progress("other", "other", report);
    await fillCustom(merged, report, deadline);
    assertWithinDeadline(deadline);
    progress("attachment", "attachment", report);
    await fillAttachment(report);
    await stabilizeProfileRows(merged, report, deadline, 600);
    await syncWorkExperienceState(Boolean(merged.work?.length), report, deadline);
    window.scrollTo({ top: 0, behavior: "smooth" });
    progress("done", "done", report);
    return report;
  }

  function readControl(control) {
    return displayedControlValue(control);
  }

  function normalizeDate(value) {
    const text = String(value || "").trim();
    if (!text || /开始时间|结束时间|请选择|yyyy/i.test(text)) return "";
    if (/至今|现在|present|current/i.test(text)) return "至今";
    const match = text.match(/((?:19|20)\d{2})(?:\D{0,3}(1[0-2]|0?[1-9]))?(?!\d)/);
    if (!match) return text;
    return match[2] ? `${match[1]}-${String(Number(match[2])).padStart(2, "0")}` : match[1];
  }

  function readPeriod(row, sectionKey, index) {
    const prefix = PATH_NAMES[sectionKey];
    const wrapper = row.querySelector(`[data-cy="${CSS.escape(`${prefix}[${index}].periodInput`)}"]`);
    if (!wrapper) return {};
    const begin = wrapper.querySelector('[data-cy$="InputBegin"]') || wrapper.children[0];
    const end = wrapper.querySelector('[data-cy$="InputEnd"]') || wrapper.children[2];
    const currentChecked = Array.from(wrapper.querySelectorAll('input[type="checkbox"]:checked')).some((checkbox) =>
      /至今|现在|present|current/i.test(cleanText(checkbox.closest("label") || checkbox.parentElement)));
    const dateValue = (target) => normalizeDate(readControl(controlIn(target)) || cleanText(target));
    return {
      startDate: dateValue(begin),
      endDate: currentChecked ? "至今" : dateValue(end)
    };
  }

  function captureBasic(profile, handledControls) {
    for (const [key, selectors] of Object.entries(BASIC_SELECTORS)) {
      const alias = Core.FIELD_ALIASES[key]?.[0];
      const control = findByDataCy(selectors) || (alias ? findByLabel(alias) : null);
      if (!control) continue;
      handledControls.add(control);
      const value = readControl(control);
      if (value) profile.basic[key] = value;
    }
  }

  function captureRows(profile) {
    const capturedSections = [];
    const clearedSections = [];
    for (const sectionDefinition of Schema.REPEAT_SECTIONS) {
      const section = sectionFor(sectionDefinition.key);
      if (!section) continue;
      capturedSections.push(sectionDefinition.key);
      if (sectionDefinition.key === "work" && noWorkExperienceCheckbox(section)?.checked) {
        profile.work = [];
        clearedSections.push("work");
        continue;
      }
      const entries = [];
      for (const row of rowsIn(section, sectionDefinition.key)) {
        const entry = readPeriod(row.element, sectionDefinition.key, row.index);
        for (const field of sectionDefinition.fields) {
          if (field.key === "startDate" || field.key === "endDate") continue;
          const value = readControl(rowControl(row.element, sectionDefinition.key, row.index, field.key));
          if (value) entry[field.key] = value;
        }
        entries.push(entry);
      }
      profile[sectionDefinition.key] = Schema.compactEntries(entries);
    }
    return { capturedSections, clearedSections };
  }

  function captureCustom(profile, handledControls) {
    const selfEvaluation = findByLabel("自我评价") || document.querySelector('[data-cy*="self_evaluation"][data-cy$="Input"]');
    if (selfEvaluation) {
      handledControls.add(selfEvaluation);
      const value = readControl(selfEvaluation);
      if (value) profile.selfEvaluation = value;
    }
    const controls = Array.from(document.querySelectorAll("input:not([type=hidden]):not([type=file]), textarea, [role=combobox]"));
    for (const control of controls) {
      if (handledControls.has(control) || control.closest(".resumeEditForm-item")) continue;
      const label = labelOf(control);
      const key = Core.fieldKeyForLabel(label);
      const value = readControl(control);
      if (!label || !value) continue;
      if (key === "selfEvaluation") profile.selfEvaluation = value;
      else if (!key || !Object.hasOwn(profile.basic, key)) profile.custom[label] = value;
    }
  }

  function capturePage() {
    const profile = Core.clone(Core.EMPTY_PROFILE);
    const handledControls = new Set();
    captureBasic(profile, handledControls);
    const { capturedSections, clearedSections } = captureRows(profile);
    captureCustom(profile, handledControls);
    return {
      profile,
      capturedSections,
      clearedSections,
      sourceUrl: location.href,
      sourceTitle: document.title,
      capturedAt: new Date().toISOString()
    };
  }

  if (globalThis.__MOKAHR_TEST__) {
    globalThis.__MOKAHR_TEST_API__ = {
      rowsIn, snapshotRows, addButton, ensureRows, fillRows, capturePage, normalizeDate,
      formReady, waitForFormReady, requiredProfileGaps, pageBasicValue, fillCustom, fillPage,
      stabilizeProfileRows, noWorkExperienceCheckbox
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "fill") {
      fillPage(message.profile).then(sendResponse).catch((error) => sendResponse({ error: error.message }));
      return true;
    }
    if (message.type === "capture") sendResponse(capturePage());
    if (message.type === "ping") sendResponse({ ok: true, version: CONTENT_VERSION });
    return false;
  });
})();
