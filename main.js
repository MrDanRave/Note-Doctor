"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => NoteDoctorPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian3 = require("obsidian");

// src/settings.ts
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  enableCompleteNote: true,
  enableTriage: true,
  triageTag: "INCOMPLETE"
};
var NoteDoctorSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("Plaster Tag").setDesc("Tag used to mark notes for the Doctor's review. Enter without #").addText(
      (text) => text.setPlaceholder("INCOMPLETE").setValue(this.plugin.settings.triageTag).onChange(async (value) => {
        const sanitized = value.replace(/^#+/, "").trim() || "INCOMPLETE";
        this.plugin.settings.triageTag = sanitized;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("The Nurse").setDesc("Auto-tags new notes with the plaster tag. Removes plasters when called via hotkey.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.enableCompleteNote).onChange(async (value) => {
        this.plugin.settings.enableCompleteNote = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Patient Queue").setDesc("Call the Doctor to review all notes with the plaster tag.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.enableTriage).onChange(async (value) => {
        this.plugin.settings.enableTriage = value;
        await this.plugin.saveSettings();
      })
    );
  }
};

// src/shared/tags.ts
var INCOMPLETE_TAG = "INCOMPLETE";
function hasTag(app, file, tag) {
  const cache = app.metadataCache.getFileCache(file);
  if (!(cache == null ? void 0 : cache.tags)) return false;
  return cache.tags.some((t) => t.tag === `#${tag}`);
}
async function removeTag(app, file, tag) {
  const cache = app.metadataCache.getFileCache(file);
  if (!(cache == null ? void 0 : cache.tags)) return;
  const targets = cache.tags.filter((t) => t.tag === `#${tag}`);
  if (targets.length === 0) return;
  await app.vault.process(file, (content) => {
    let result = content;
    const positions = targets.map((t) => t.position).sort((a, b) => b.start.offset - a.start.offset);
    for (const pos of positions) {
      const before = result.slice(0, pos.start.offset);
      const after = result.slice(pos.end.offset);
      const trimmed = after.replace(/^\n/, "");
      result = before + trimmed;
    }
    return result;
  });
}
async function addTag(app, file, tag) {
  if (hasTag(app, file, tag)) return;
  await app.vault.process(file, (content) => {
    const marker = `#${tag}`;
    if (content.endsWith("\n")) return content + marker + "\n";
    return content + "\n" + marker + "\n";
  });
}

// src/features/completeNote.ts
function registerCompleteNoteCommands(app, tag, addCommand) {
  addCommand({
    id: "complete-note",
    name: "The Nurse \u2014 Remove plaster tag",
    callback: async () => {
      const file = app.workspace.getActiveFile();
      if (!file) return;
      await removeTag(app, file, tag);
    }
  });
  addCommand({
    id: "mark-incomplete",
    name: "The Nurse \u2014 Apply plaster tag",
    callback: async () => {
      const file = app.workspace.getActiveFile();
      if (!file) return;
      if (!hasTag(app, file, tag)) {
        await addTag(app, file, tag);
      }
    }
  });
}

// src/features/triage.ts
var import_obsidian2 = require("obsidian");

// src/shared/cardStack.ts
async function loadCandidates(app, tag, previewCount = 3) {
  var _a;
  const files = app.vault.getMarkdownFiles();
  const candidates = [];
  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file);
    if ((_a = cache == null ? void 0 : cache.tags) == null ? void 0 : _a.some((t) => t.tag === `#${tag}`)) {
      candidates.push(file);
    }
  }
  const items = [];
  for (let i = 0; i < candidates.length; i++) {
    const file = candidates[i];
    let preview = "";
    if (i < previewCount) {
      const content = await app.vault.cachedRead(file);
      preview = content.replace(/^---[\s\S]*?---\n?/, "").replace(/#\w+/g, "").trim().slice(0, 300);
    }
    items.push({ file, preview });
  }
  return items;
}

// src/features/triage.ts
var TriageModal = class extends import_obsidian2.Modal {
  constructor(app, tag = INCOMPLETE_TAG) {
    super(app);
    this.tag = tag;
    this.items = [];
    this.completedPaths = /* @__PURE__ */ new Set();
    this.seen = /* @__PURE__ */ new Set();
    this.currentIdx = 0;
    this.busy = false;
  }
  get completeLabel() {
    return this.tag === INCOMPLETE_TAG ? "Complete" : "Heal";
  }
  async onOpen() {
    this.modalEl.addClass("note-doctor-triage-modal");
    this.titleEl.setText("Note Doctor");
    const subtitle = this.containerEl.ownerDocument.createElement("div");
    subtitle.className = "note-doctor-triage-subtitle";
    subtitle.textContent = `Quickly review notes tagged #${this.tag}`;
    this.titleEl.insertAdjacentElement("afterend", subtitle);
    this.scope.register([], "u", () => {
      this.triggerCurrentComplete();
      return false;
    });
    this.scope.register([], "i", () => {
      this.triggerCurrentIgnore();
      return false;
    });
    this.scope.register([], "o", () => {
      this.triggerCurrentReview();
      return false;
    });
    this.scope.register([], "Enter", () => {
      this.triggerCurrentReview();
      return false;
    });
    this.scope.register([], "Escape", () => {
      this.close();
      return false;
    });
    const loaded = await loadCandidates(this.app, this.tag);
    if (loaded.length === 0) {
      this.contentEl.createEl("p", { cls: "note-doctor-triage-done", text: "\u2713 No incomplete notes." });
      return;
    }
    this.items = loaded;
    this.renderCard("none");
  }
  // ── helpers ──────────────────────────────────────────────────────────────
  activeItems() {
    return this.items.filter((i) => !this.completedPaths.has(i.file.path));
  }
  navigate(direction) {
    const active = this.activeItems();
    if (!active.length) return;
    this.currentIdx = direction === "forward" ? (this.currentIdx + 1) % active.length : (this.currentIdx - 1 + active.length) % active.length;
    this.renderCard(direction);
  }
  // ── render ────────────────────────────────────────────────────────────────
  renderCard(direction) {
    const active = this.activeItems();
    if (active.length === 0) {
      this.contentEl.empty();
      this.close();
      new import_obsidian2.Notice("\u2713 All notes triaged.", 3e3);
      return;
    }
    if (this.currentIdx >= active.length) this.currentIdx = 0;
    const item = active[this.currentIdx];
    if (direction !== "none" && active.every((i) => this.seen.has(i.file.path))) {
      this.contentEl.empty();
      this.close();
      new import_obsidian2.Notice("\u2713 Triage cycle complete.", 3e3);
      return;
    }
    this.seen.add(item.file.path);
    const newContainer = this.buildContainer(item, active);
    const viewport = this.contentEl.querySelector(".note-doctor-slide-viewport");
    if (!viewport || direction === "none") {
      this.contentEl.empty();
      const vp = this.contentEl.createEl("div", { cls: "note-doctor-slide-viewport" });
      vp.appendChild(newContainer);
      this.busy = false;
      return;
    }
    const oldContainer = viewport.querySelector(".note-doctor-card-container");
    if (!oldContainer) {
      viewport.innerHTML = "";
      viewport.appendChild(newContainer);
      this.busy = false;
      return;
    }
    viewport.style.setProperty("--nd-h", `${viewport.getBoundingClientRect().height}px`);
    viewport.classList.add("nd-height-locked");
    const outClass = direction === "forward" ? "nd-slide-out-left" : "nd-slide-out-right";
    const inClass = direction === "forward" ? "nd-slide-in-right" : "nd-slide-in-left";
    viewport.classList.add("nd-transitioning");
    oldContainer.classList.add(outClass);
    newContainer.classList.add(inClass);
    viewport.appendChild(newContainer);
    const onDone = (e) => {
      if (e.target !== newContainer) return;
      newContainer.removeEventListener("animationend", onDone);
      newContainer.classList.remove(inClass);
      oldContainer.remove();
      viewport.classList.remove("nd-transitioning");
      viewport.style.removeProperty("--nd-h");
      viewport.classList.remove("nd-height-locked");
      this.busy = false;
    };
    newContainer.addEventListener("animationend", onDone);
  }
  buildContainer(item, active) {
    const container = this.containerEl.ownerDocument.createElement("div");
    container.className = "note-doctor-card-container";
    const navBar = container.createEl("div", { cls: "note-doctor-nav-bar" });
    const prevBtn = navBar.createEl("button", { cls: "note-doctor-nav-btn", text: "\u2190 Previous" });
    prevBtn.addEventListener("mousedown", (e) => e.preventDefault());
    prevBtn.addEventListener("click", () => this.navigate("backward"));
    navBar.createEl("span", {
      cls: "note-doctor-nav-counter",
      text: `${this.currentIdx + 1} / ${active.length}`
    });
    const nextBtn = navBar.createEl("button", { cls: "note-doctor-nav-btn", text: "Next \u2192" });
    nextBtn.addEventListener("mousedown", (e) => e.preventDefault());
    nextBtn.addEventListener("click", () => this.navigate("forward"));
    const stackWrap = container.createEl("div", { cls: "note-doctor-stack-wrap" });
    stackWrap.createEl("div", { cls: "note-doctor-card note-doctor-card-depth-2" });
    stackWrap.createEl("div", { cls: "note-doctor-card note-doctor-card-depth-1" });
    const topCard = stackWrap.createEl("div", { cls: "note-doctor-card note-doctor-card-depth-0" });
    topCard.createEl("div", { cls: "note-doctor-card-title", text: item.file.basename });
    if (item.preview) {
      topCard.createEl("div", { cls: "note-doctor-card-preview", text: item.preview });
    } else {
      const previewEl = topCard.createEl("div", { cls: "note-doctor-card-preview" });
      void this.app.vault.cachedRead(item.file).then((content) => {
        const text = content.replace(/^---[\s\S]*?---\n?/, "").replace(/#\w+/g, "").trim().slice(0, 300);
        item.preview = text;
        previewEl.setText(text);
      });
    }
    const hint = topCard.createEl("div", { cls: "note-doctor-card-hint" });
    hint.createEl("span", { text: `U \u2014 ${this.completeLabel}` });
    hint.createEl("span", { text: "I \u2014 Ignore" });
    hint.createEl("span", { text: "O \u2014 Review" });
    const actions = topCard.createEl("div", { cls: "note-doctor-card-actions" });
    const completeBtn = actions.createEl("button", {
      cls: "note-doctor-triage-btn note-doctor-triage-complete",
      text: this.completeLabel
    });
    completeBtn.addEventListener("mousedown", (e) => e.preventDefault());
    completeBtn.addEventListener("click", () => this.doComplete(item, completeBtn));
    const ignoreBtn = actions.createEl("button", {
      cls: "note-doctor-triage-btn note-doctor-triage-incomplete",
      text: "Ignore"
    });
    ignoreBtn.addEventListener("mousedown", (e) => e.preventDefault());
    ignoreBtn.addEventListener("click", () => this.doIgnore(ignoreBtn));
    const reviewBtn = actions.createEl("button", {
      cls: "note-doctor-triage-btn note-doctor-triage-open",
      text: "Review"
    });
    reviewBtn.addEventListener("mousedown", (e) => e.preventDefault());
    reviewBtn.addEventListener("click", () => this.doOpen(item, reviewBtn));
    return container;
  }
  // ── hotkey trigger helpers ────────────────────────────────────────────────
  currentItem() {
    const active = this.activeItems();
    if (!active.length) return null;
    return active[Math.min(this.currentIdx, active.length - 1)];
  }
  triggerCurrentComplete() {
    const item = this.currentItem();
    if (!item) return;
    const btn = this.contentEl.querySelector(".note-doctor-triage-complete");
    this.doComplete(item, btn != null ? btn : void 0);
  }
  triggerCurrentIgnore() {
    const btn = this.contentEl.querySelector(".note-doctor-triage-incomplete");
    this.doIgnore(btn != null ? btn : void 0);
  }
  triggerCurrentReview() {
    const item = this.currentItem();
    if (!item) return;
    const btn = this.contentEl.querySelector(".note-doctor-triage-open");
    this.doOpen(item, btn != null ? btn : void 0);
  }
  // ── flash helper ──────────────────────────────────────────────────────────
  flashThen(btn, cls, action) {
    if (this.busy) return;
    this.busy = true;
    if (!btn) {
      void action();
      return;
    }
    btn.classList.add(cls);
    btn.addEventListener("animationend", () => {
      btn.classList.remove(cls);
      void action();
    }, { once: true });
  }
  // ── actions ───────────────────────────────────────────────────────────────
  doComplete(item, btn) {
    this.flashThen(btn, "nd-flash-green", async () => {
      await removeTag(this.app, item.file, this.tag);
      this.completedPaths.add(item.file.path);
      const active = this.activeItems();
      if (this.currentIdx >= active.length) this.currentIdx = Math.max(0, active.length - 1);
      this.renderCard("forward");
    });
  }
  doIgnore(btn) {
    this.flashThen(btn, "nd-flash-red", () => this.navigate("forward"));
  }
  doOpen(item, btn) {
    this.flashThen(btn, "nd-flash-blue", () => {
      this.close();
      void this.app.workspace.getLeaf("tab").openFile(item.file);
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/main.ts
var NoteDoctorPlugin = class extends import_obsidian3.Plugin {
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new NoteDoctorSettingTab(this.app, this));
    injectTriageStyles(this.app.workspace.containerEl.ownerDocument);
    if (this.settings.enableCompleteNote) {
      registerCompleteNoteCommands(
        this.app,
        this.settings.triageTag,
        (cmd) => this.addCommand(cmd)
      );
      this.registerEvent(
        this.app.vault.on("create", async (file) => {
          if (!(file instanceof import_obsidian3.TFile) || file.extension !== "md") return;
          await new Promise((r) => window.setTimeout(r, 100));
          if (Date.now() - file.stat.ctime > 1e4) return;
          const marker = `#${this.settings.triageTag}`;
          await this.app.vault.process(file, (content) => {
            if (content.includes(marker)) return content;
            const base = content.trimEnd();
            return base + "\n\n\n" + marker + "\n";
          });
        })
      );
    }
    if (this.settings.enableTriage) {
      this.addCommand({
        id: "open-triage",
        name: "Open Patient Queue",
        callback: () => new TriageModal(this.app, this.settings.triageTag).open()
      });
    }
  }
  onunload() {
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
function injectTriageStyles(doc) {
  if (doc.getElementById("note-doctor-triage-styles")) return;
  const style = doc.createElement("style");
  style.id = "note-doctor-triage-styles";
  style.textContent = `
    /* \u2500\u2500 Modal shell \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
    .note-doctor-triage-modal {
      width: 480px;
    }
    .note-doctor-triage-modal .modal-content {
      display: flex;
      flex-direction: column;
      padding: 16px;
      overflow: hidden;
    }

    /* \u2500\u2500 Subtitle \u2014 lives between titleEl and contentEl \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
    .note-doctor-triage-subtitle {
      padding: 0 0 10px 0;
      font-size: 12px;
      color: var(--text-muted);
    }

    /* \u2500\u2500 Slide viewport \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
    .note-doctor-slide-viewport {
      width: 100%;
    }
    .nd-height-locked {
      height: var(--nd-h);
    }
    .nd-transitioning {
      position: relative;
      overflow: hidden;
    }
    .nd-transitioning .note-doctor-card-container {
      position: absolute;
      inset: 0;
    }

    /* \u2500\u2500 Card container (one per render, slides in/out) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
    .note-doctor-card-container {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    /* \u2500\u2500 Navigation bar \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
    .note-doctor-nav-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .note-doctor-nav-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 12px;
      padding: 3px 8px;
      border-radius: 4px;
      transition: color 0.1s, background 0.1s;
    }
    .note-doctor-nav-btn:hover {
      color: var(--text-normal);
      background: var(--background-modifier-hover);
    }
    .note-doctor-nav-counter {
      font-size: 13px;
      color: var(--text-muted);
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.02em;
    }

    /* \u2500\u2500 "No notes" state \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
    .note-doctor-triage-done {
      text-align: center;
      color: var(--text-muted);
      margin-top: 40px;
      font-size: 16px;
    }

    /* \u2500\u2500 Card stack \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
    .note-doctor-stack-wrap {
      position: relative;
      height: 300px;
      overflow: hidden;
      border-radius: 8px;
    }
    .note-doctor-card {
      position: absolute;
      inset: 0;
      background: var(--background-primary);
      border: 1px solid var(--background-modifier-border);
      border-radius: 8px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.12);
    }
    .note-doctor-card-depth-2 {
      transform: translate(8px, 12px) scale(0.96);
      z-index: 0;
      background: var(--background-secondary-alt);
      pointer-events: none;
    }
    .note-doctor-card-depth-1 {
      transform: translate(4px, 6px) scale(0.98);
      z-index: 1;
      background: var(--background-secondary);
      pointer-events: none;
    }
    .note-doctor-card-depth-0 {
      z-index: 2;
    }
    .note-doctor-card-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-normal);
    }
    .note-doctor-card-preview {
      font-size: 13px;
      color: var(--text-muted);
      flex: 1;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 5;
      -webkit-box-orient: vertical;
      line-height: 1.5;
    }

    /* \u2500\u2500 Hotkey hints \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
    .note-doctor-card-hint {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: var(--text-faint);
      margin-top: auto;
      padding: 0 2px;
    }

    /* \u2500\u2500 Action buttons \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
    .note-doctor-card-actions {
      display: flex;
      gap: 8px;
    }
    .note-doctor-triage-btn {
      flex: 1;
      padding: 6px 10px;
      border-radius: 5px;
      border: 1px solid var(--background-modifier-border);
      background: var(--background-secondary);
      color: var(--text-normal);
      cursor: pointer;
      font-size: 13px;
    }
    .note-doctor-triage-complete:hover   { background: var(--color-green);        color: #fff; }
    .note-doctor-triage-incomplete:hover { background: var(--color-red);          color: #fff; }
    .note-doctor-triage-open:hover       { background: var(--interactive-accent); color: #fff; }

    /* \u2500\u2500 Button flash animations \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
    @keyframes nd-flash-green {
      0%   { background: var(--background-secondary); color: var(--text-normal); }
      45%  { background: var(--color-green);          color: #fff; box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-green) 30%, transparent); }
      100% { background: var(--background-secondary); color: var(--text-normal); }
    }
    @keyframes nd-flash-red {
      0%   { background: var(--background-secondary); color: var(--text-normal); }
      45%  { background: var(--color-red);            color: #fff; box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-red) 30%, transparent); }
      100% { background: var(--background-secondary); color: var(--text-normal); }
    }
    @keyframes nd-flash-blue {
      0%   { background: var(--background-secondary);  color: var(--text-normal); }
      45%  { background: var(--interactive-accent);    color: #fff; box-shadow: 0 0 0 3px color-mix(in srgb, var(--interactive-accent) 30%, transparent); }
      100% { background: var(--background-secondary);  color: var(--text-normal); }
    }
    .nd-flash-green { animation: nd-flash-green 0.28s ease both; }
    .nd-flash-red   { animation: nd-flash-red   0.28s ease both; }
    .nd-flash-blue  { animation: nd-flash-blue  0.28s ease both; }

    /* \u2500\u2500 Card slide animations \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
    @keyframes nd-slide-out-left {
      from { transform: translateX(0);     opacity: 1; }
      to   { transform: translateX(-110%); opacity: 0; }
    }
    @keyframes nd-slide-in-right {
      from { transform: translateX(110%);  opacity: 0; }
      to   { transform: translateX(0);     opacity: 1; }
    }
    @keyframes nd-slide-out-right {
      from { transform: translateX(0);    opacity: 1; }
      to   { transform: translateX(110%); opacity: 0; }
    }
    @keyframes nd-slide-in-left {
      from { transform: translateX(-110%); opacity: 0; }
      to   { transform: translateX(0);     opacity: 1; }
    }
    .nd-slide-out-left  { animation: nd-slide-out-left  0.22s ease-in  forwards; }
    .nd-slide-in-right  { animation: nd-slide-in-right  0.22s ease-out forwards; }
    .nd-slide-out-right { animation: nd-slide-out-right 0.22s ease-in  forwards; }
    .nd-slide-in-left   { animation: nd-slide-in-left   0.22s ease-out forwards; }
  `;
  doc.head.appendChild(style);
}
