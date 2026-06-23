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
var import_obsidian4 = require("obsidian");

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

// src/features/completeNote.ts
var import_obsidian2 = require("obsidian");

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
      const n = new import_obsidian2.Notice("", 2e3);
      n.noticeEl.createEl("span", { text: "Plaster removed: " });
      n.noticeEl.createEl("span", { text: `#${tag}`, cls: "nd-nurse-strike-tag" });
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
var import_obsidian3 = require("obsidian");

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
var TriageModal = class extends import_obsidian3.Modal {
  constructor(app, tag = INCOMPLETE_TAG) {
    super(app);
    this.tag = tag;
    this.items = [];
    this.noteStatus = /* @__PURE__ */ new Map();
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
      this.contentEl.createEl("p", { cls: "note-doctor-triage-done", text: "\u2713 No notes to review." });
      return;
    }
    this.items = loaded;
    for (const item of this.items) this.noteStatus.set(item.file.path, "pending");
    this.renderCard("none");
  }
  // ── helpers ──────────────────────────────────────────────────────────────
  currentItem() {
    if (!this.items.length) return null;
    return this.items[Math.min(this.currentIdx, this.items.length - 1)];
  }
  navigate(direction) {
    if (!this.items.length) return;
    this.currentIdx = direction === "forward" ? (this.currentIdx + 1) % this.items.length : (this.currentIdx - 1 + this.items.length) % this.items.length;
    this.renderCard(direction);
  }
  checkAllActioned() {
    return this.items.every((i) => this.noteStatus.get(i.file.path) !== "pending");
  }
  // ── render ────────────────────────────────────────────────────────────────
  renderCard(direction) {
    if (!this.items.length) {
      this.contentEl.empty();
      this.close();
      new import_obsidian3.Notice("\u2713 All notes triaged.", 3e3);
      return;
    }
    if (this.currentIdx >= this.items.length) this.currentIdx = 0;
    const item = this.items[this.currentIdx];
    const newContainer = this.buildContainer(item);
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
  buildContainer(item) {
    var _a;
    const container = this.containerEl.ownerDocument.createElement("div");
    container.className = "note-doctor-card-container";
    const status = (_a = this.noteStatus.get(item.file.path)) != null ? _a : "pending";
    const navBar = container.createEl("div", { cls: "note-doctor-nav-bar" });
    const prevBtn = navBar.createEl("button", { cls: "note-doctor-nav-btn", text: "\u2190 Previous" });
    prevBtn.addEventListener("mousedown", (e) => e.preventDefault());
    prevBtn.addEventListener("click", () => this.navigate("backward"));
    navBar.createEl("span", {
      cls: "note-doctor-nav-counter",
      text: `${this.currentIdx + 1} / ${this.items.length}`
    });
    const nextBtn = navBar.createEl("button", { cls: "note-doctor-nav-btn", text: "Next \u2192" });
    nextBtn.addEventListener("mousedown", (e) => e.preventDefault());
    nextBtn.addEventListener("click", () => this.navigate("forward"));
    const stackWrap = container.createEl("div", { cls: "note-doctor-stack-wrap" });
    stackWrap.createEl("div", { cls: "note-doctor-card note-doctor-card-depth-2" });
    stackWrap.createEl("div", { cls: "note-doctor-card note-doctor-card-depth-1" });
    const topCard = stackWrap.createEl("div", { cls: "note-doctor-card note-doctor-card-depth-0" });
    topCard.createEl("div", { cls: "note-doctor-card-title", text: item.file.basename });
    const tagEl = topCard.createEl("div", {
      cls: "note-doctor-card-tag",
      text: `#${this.tag}`
    });
    if (status === "complete") tagEl.addClass("nd-tag-struck");
    const previewEl = topCard.createEl("div", { cls: "note-doctor-card-preview" });
    if (item.preview) {
      void import_obsidian3.MarkdownRenderer.render(this.app, item.preview, previewEl, item.file.path, this);
    } else {
      void this.app.vault.cachedRead(item.file).then(async (content) => {
        const text = content.replace(/^---[\s\S]*?---\n?/, "").replace(/#\w+/g, "").trim().slice(0, 300);
        item.preview = text;
        await import_obsidian3.MarkdownRenderer.render(this.app, text, previewEl, item.file.path, this);
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
    if (status === "complete") completeBtn.addClass("nd-btn-selected-green");
    completeBtn.addEventListener("mousedown", (e) => e.preventDefault());
    completeBtn.addEventListener("click", () => this.doComplete(item, completeBtn, tagEl));
    const ignoreBtn = actions.createEl("button", {
      cls: "note-doctor-triage-btn note-doctor-triage-incomplete",
      text: "Ignore"
    });
    if (status === "ignored") ignoreBtn.addClass("nd-btn-selected-red");
    ignoreBtn.addEventListener("mousedown", (e) => e.preventDefault());
    ignoreBtn.addEventListener("click", () => this.doIgnore(item, ignoreBtn));
    const reviewBtn = actions.createEl("button", {
      cls: "note-doctor-triage-btn note-doctor-triage-open",
      text: "Review"
    });
    reviewBtn.addEventListener("mousedown", (e) => e.preventDefault());
    reviewBtn.addEventListener("click", () => this.doOpen(item, reviewBtn));
    return container;
  }
  // ── hotkey trigger helpers ────────────────────────────────────────────────
  triggerCurrentComplete() {
    const item = this.currentItem();
    if (!item) return;
    const btn = this.contentEl.querySelector(".note-doctor-triage-complete");
    const tagEl = this.contentEl.querySelector(".note-doctor-card-tag");
    this.doComplete(item, btn != null ? btn : void 0, tagEl != null ? tagEl : void 0);
  }
  triggerCurrentIgnore() {
    const item = this.currentItem();
    if (!item) return;
    const btn = this.contentEl.querySelector(".note-doctor-triage-incomplete");
    this.doIgnore(item, btn != null ? btn : void 0);
  }
  triggerCurrentReview() {
    const item = this.currentItem();
    if (!item) return;
    const btn = this.contentEl.querySelector(".note-doctor-triage-open");
    this.doOpen(item, btn != null ? btn : void 0);
  }
  // ── actions ───────────────────────────────────────────────────────────────
  doComplete(item, btn, tagEl) {
    if (this.busy) return;
    this.busy = true;
    const finish = async () => {
      await removeTag(this.app, item.file, this.tag);
      this.noteStatus.set(item.file.path, "complete");
      if (this.checkAllActioned()) {
        new import_obsidian3.Notice("\u2713 Triage complete.", 3e3);
        this.close();
        return;
      }
      this.navigate("forward");
    };
    const strikeAndFinish = () => {
      if (!tagEl) {
        void finish();
        return;
      }
      tagEl.classList.add("nd-strikethrough");
      tagEl.addEventListener("animationend", () => void finish(), { once: true });
    };
    if (!btn) {
      strikeAndFinish();
      return;
    }
    btn.classList.add("nd-flash-green");
    btn.addEventListener("animationend", () => {
      btn.classList.remove("nd-flash-green");
      strikeAndFinish();
    }, { once: true });
  }
  doIgnore(item, btn) {
    if (this.busy) return;
    this.busy = true;
    const finish = () => {
      this.noteStatus.set(item.file.path, "ignored");
      if (this.checkAllActioned()) {
        new import_obsidian3.Notice("\u2713 Triage complete.", 3e3);
        this.close();
        return;
      }
      this.navigate("forward");
    };
    if (!btn) {
      finish();
      return;
    }
    btn.classList.add("nd-flash-red");
    btn.addEventListener("animationend", () => {
      btn.classList.remove("nd-flash-red");
      finish();
    }, { once: true });
  }
  doOpen(item, btn) {
    if (this.busy) return;
    this.busy = true;
    const finish = () => {
      this.close();
      void this.app.workspace.getLeaf("tab").openFile(item.file);
    };
    if (!btn) {
      finish();
      return;
    }
    btn.classList.add("nd-flash-blue");
    btn.addEventListener("animationend", () => {
      btn.classList.remove("nd-flash-blue");
      finish();
    }, { once: true });
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/main.ts
var NoteDoctorPlugin = class extends import_obsidian4.Plugin {
  constructor() {
    super(...arguments);
    this.pendingTag = /* @__PURE__ */ new Set();
  }
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
        this.app.vault.on("create", (file) => {
          if (!(file instanceof import_obsidian4.TFile) || file.extension !== "md") return;
          if (Date.now() - file.stat.ctime > 6e4) return;
          this.pendingTag.add(file.path);
        })
      );
      this.registerEvent(
        this.app.workspace.on("file-open", async (file) => {
          if (file instanceof import_obsidian4.TFile) await this.applyPendingTag(file);
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
  async applyPendingTag(file) {
    if (!this.pendingTag.has(file.path)) return;
    this.pendingTag.delete(file.path);
    const marker = `#${this.settings.triageTag}`;
    await this.app.vault.process(file, (content) => {
      if (content.includes(marker)) return content;
      const base = content.trimEnd();
      return base + "\n\n\n" + marker + "\n";
    });
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
      position: relative;
      font-size: 13px;
      color: var(--text-muted);
      flex: 1;
      overflow: hidden;
      max-height: 120px;
      line-height: 1.5;
    }
    .note-doctor-card-preview::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 40px;
      background: linear-gradient(to bottom, transparent, var(--background-primary));
      pointer-events: none;
    }
    .note-doctor-card-preview p {
      margin: 0 0 4px 0;
    }
    .note-doctor-card-preview p:last-child {
      margin-bottom: 0;
    }
    .note-doctor-card-preview a {
      color: var(--link-color);
    }
    .note-doctor-card-preview .copy-code-button {
      display: none;
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
    .nd-btn-selected-green { background: var(--color-green)  !important; color: #fff !important; }
    .nd-btn-selected-red   { background: var(--color-red)    !important; color: #fff !important; }

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

    /* \u2500\u2500 Tag chip \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
    .note-doctor-card-tag {
      position: relative;
      display: inline-block;
      align-self: flex-start;
      font-size: 11px;
      color: var(--interactive-accent);
      background: color-mix(in srgb, var(--interactive-accent) 12%, transparent);
      border-radius: 3px;
      padding: 2px 7px;
      overflow: hidden;
    }
    /* Static struck-through state (note already completed, card revisited) */
    .nd-tag-struck::after {
      content: '';
      position: absolute;
      left: 0;
      top: 50%;
      width: 100%;
      height: 2px;
      background: currentColor;
      transform: translateY(-50%);
    }
    /* Animated strikethrough \u2014 line draws left to right */
    @keyframes nd-strike-line {
      from { width: 0; }
      to   { width: 100%; }
    }
    .nd-strikethrough::after {
      content: '';
      position: absolute;
      left: 0;
      top: 50%;
      width: 0;
      height: 2px;
      background: currentColor;
      transform: translateY(-50%);
      animation: nd-strike-line 0.35s ease-out forwards;
    }

    /* \u2500\u2500 Nurse notice strikethrough \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
    .nd-nurse-strike-tag {
      text-decoration: line-through;
      text-decoration-color: currentColor;
    }

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
