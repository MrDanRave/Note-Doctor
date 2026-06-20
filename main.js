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
          if (!(file instanceof import_obsidian4.TFile) || file.extension !== "md") return;
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL21haW4udHMiLCAic3JjL3NldHRpbmdzLnRzIiwgInNyYy9mZWF0dXJlcy9jb21wbGV0ZU5vdGUudHMiLCAic3JjL3NoYXJlZC90YWdzLnRzIiwgInNyYy9mZWF0dXJlcy90cmlhZ2UudHMiLCAic3JjL3NoYXJlZC9jYXJkU3RhY2sudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImltcG9ydCB7IFBsdWdpbiwgVEZpbGUgfSBmcm9tIFwib2JzaWRpYW5cIjtcbmltcG9ydCB7IERFRkFVTFRfU0VUVElOR1MsIE5vdGVEb2N0b3JTZXR0aW5ncywgTm90ZURvY3RvclNldHRpbmdUYWIgfSBmcm9tIFwiLi9zZXR0aW5nc1wiO1xuaW1wb3J0IHsgcmVnaXN0ZXJDb21wbGV0ZU5vdGVDb21tYW5kcyB9IGZyb20gXCIuL2ZlYXR1cmVzL2NvbXBsZXRlTm90ZVwiO1xuaW1wb3J0IHsgVHJpYWdlTW9kYWwgfSBmcm9tIFwiLi9mZWF0dXJlcy90cmlhZ2VcIjtcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTm90ZURvY3RvclBsdWdpbiBleHRlbmRzIFBsdWdpbiB7XG4gIHNldHRpbmdzOiBOb3RlRG9jdG9yU2V0dGluZ3M7XG5cbiAgYXN5bmMgb25sb2FkKCkge1xuICAgIGF3YWl0IHRoaXMubG9hZFNldHRpbmdzKCk7XG4gICAgdGhpcy5hZGRTZXR0aW5nVGFiKG5ldyBOb3RlRG9jdG9yU2V0dGluZ1RhYih0aGlzLmFwcCwgdGhpcykpO1xuXG4gICAgaW5qZWN0VHJpYWdlU3R5bGVzKHRoaXMuYXBwLndvcmtzcGFjZS5jb250YWluZXJFbC5vd25lckRvY3VtZW50KTtcblxuICAgIGlmICh0aGlzLnNldHRpbmdzLmVuYWJsZUNvbXBsZXRlTm90ZSkge1xuICAgICAgcmVnaXN0ZXJDb21wbGV0ZU5vdGVDb21tYW5kcyh0aGlzLmFwcCwgdGhpcy5zZXR0aW5ncy50cmlhZ2VUYWcsIChjbWQpID0+XG4gICAgICAgIHRoaXMuYWRkQ29tbWFuZChjbWQgYXMgUGFyYW1ldGVyczxQbHVnaW5bXCJhZGRDb21tYW5kXCJdPlswXSlcbiAgICAgICk7XG5cbiAgICAgIHRoaXMucmVnaXN0ZXJFdmVudChcbiAgICAgICAgdGhpcy5hcHAudmF1bHQub24oXCJjcmVhdGVcIiwgYXN5bmMgKGZpbGUpID0+IHtcbiAgICAgICAgICBpZiAoIShmaWxlIGluc3RhbmNlb2YgVEZpbGUpIHx8IGZpbGUuZXh0ZW5zaW9uICE9PSBcIm1kXCIpIHJldHVybjtcbiAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZSgocikgPT4gd2luZG93LnNldFRpbWVvdXQociwgMTAwKSk7XG4gICAgICAgICAgLy8gT25seSB0YWcgdHJ1bHkgbmV3IGZpbGVzIFx1MjAxNCBjdGltZSB3aXRoaW4gMTAgcyBvZiBub3cuXG4gICAgICAgICAgaWYgKERhdGUubm93KCkgLSBmaWxlLnN0YXQuY3RpbWUgPiAxMF8wMDApIHJldHVybjtcbiAgICAgICAgICBjb25zdCBtYXJrZXIgPSBgIyR7dGhpcy5zZXR0aW5ncy50cmlhZ2VUYWd9YDtcbiAgICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5wcm9jZXNzKGZpbGUsIChjb250ZW50KSA9PiB7XG4gICAgICAgICAgICBpZiAoY29udGVudC5pbmNsdWRlcyhtYXJrZXIpKSByZXR1cm4gY29udGVudDtcbiAgICAgICAgICAgIGNvbnN0IGJhc2UgPSBjb250ZW50LnRyaW1FbmQoKTtcbiAgICAgICAgICAgIHJldHVybiBiYXNlICsgXCJcXG5cXG5cXG5cIiArIG1hcmtlciArIFwiXFxuXCI7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pXG4gICAgICApO1xuICAgIH1cblxuICAgIGlmICh0aGlzLnNldHRpbmdzLmVuYWJsZVRyaWFnZSkge1xuICAgICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgICAgaWQ6IFwib3Blbi10cmlhZ2VcIixcbiAgICAgICAgbmFtZTogXCJPcGVuIFBhdGllbnQgUXVldWVcIixcbiAgICAgICAgY2FsbGJhY2s6ICgpID0+IG5ldyBUcmlhZ2VNb2RhbCh0aGlzLmFwcCwgdGhpcy5zZXR0aW5ncy50cmlhZ2VUYWcpLm9wZW4oKSxcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIG9udW5sb2FkKCkge31cblxuICBhc3luYyBsb2FkU2V0dGluZ3MoKSB7XG4gICAgdGhpcy5zZXR0aW5ncyA9IE9iamVjdC5hc3NpZ24oe30sIERFRkFVTFRfU0VUVElOR1MsIGF3YWl0IHRoaXMubG9hZERhdGEoKSBhcyBQYXJ0aWFsPE5vdGVEb2N0b3JTZXR0aW5ncz4pO1xuICB9XG5cbiAgYXN5bmMgc2F2ZVNldHRpbmdzKCkge1xuICAgIGF3YWl0IHRoaXMuc2F2ZURhdGEodGhpcy5zZXR0aW5ncyk7XG4gIH1cbn1cblxuZnVuY3Rpb24gaW5qZWN0VHJpYWdlU3R5bGVzKGRvYzogRG9jdW1lbnQpIHtcbiAgaWYgKGRvYy5nZXRFbGVtZW50QnlJZChcIm5vdGUtZG9jdG9yLXRyaWFnZS1zdHlsZXNcIikpIHJldHVybjtcbiAgY29uc3Qgc3R5bGUgPSBkb2MuY3JlYXRlRWxlbWVudChcInN0eWxlXCIpO1xuICBzdHlsZS5pZCA9IFwibm90ZS1kb2N0b3ItdHJpYWdlLXN0eWxlc1wiO1xuICBzdHlsZS50ZXh0Q29udGVudCA9IGBcbiAgICAvKiBcdTI1MDBcdTI1MDAgTW9kYWwgc2hlbGwgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwICovXG4gICAgLm5vdGUtZG9jdG9yLXRyaWFnZS1tb2RhbCB7XG4gICAgICB3aWR0aDogNDgwcHg7XG4gICAgfVxuICAgIC5ub3RlLWRvY3Rvci10cmlhZ2UtbW9kYWwgLm1vZGFsLWNvbnRlbnQge1xuICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgIGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47XG4gICAgICBwYWRkaW5nOiAxNnB4O1xuICAgICAgb3ZlcmZsb3c6IGhpZGRlbjtcbiAgICB9XG5cbiAgICAvKiBcdTI1MDBcdTI1MDAgU3VidGl0bGUgXHUyMDE0IGxpdmVzIGJldHdlZW4gdGl0bGVFbCBhbmQgY29udGVudEVsIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCAqL1xuICAgIC5ub3RlLWRvY3Rvci10cmlhZ2Utc3VidGl0bGUge1xuICAgICAgcGFkZGluZzogMCAwIDEwcHggMDtcbiAgICAgIGZvbnQtc2l6ZTogMTJweDtcbiAgICAgIGNvbG9yOiB2YXIoLS10ZXh0LW11dGVkKTtcbiAgICB9XG5cbiAgICAvKiBcdTI1MDBcdTI1MDAgU2xpZGUgdmlld3BvcnQgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwICovXG4gICAgLm5vdGUtZG9jdG9yLXNsaWRlLXZpZXdwb3J0IHtcbiAgICAgIHdpZHRoOiAxMDAlO1xuICAgIH1cbiAgICAubmQtaGVpZ2h0LWxvY2tlZCB7XG4gICAgICBoZWlnaHQ6IHZhcigtLW5kLWgpO1xuICAgIH1cbiAgICAubmQtdHJhbnNpdGlvbmluZyB7XG4gICAgICBwb3NpdGlvbjogcmVsYXRpdmU7XG4gICAgICBvdmVyZmxvdzogaGlkZGVuO1xuICAgIH1cbiAgICAubmQtdHJhbnNpdGlvbmluZyAubm90ZS1kb2N0b3ItY2FyZC1jb250YWluZXIge1xuICAgICAgcG9zaXRpb246IGFic29sdXRlO1xuICAgICAgaW5zZXQ6IDA7XG4gICAgfVxuXG4gICAgLyogXHUyNTAwXHUyNTAwIENhcmQgY29udGFpbmVyIChvbmUgcGVyIHJlbmRlciwgc2xpZGVzIGluL291dCkgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwICovXG4gICAgLm5vdGUtZG9jdG9yLWNhcmQtY29udGFpbmVyIHtcbiAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICBmbGV4LWRpcmVjdGlvbjogY29sdW1uO1xuICAgICAgZ2FwOiAxMnB4O1xuICAgIH1cblxuICAgIC8qIFx1MjUwMFx1MjUwMCBOYXZpZ2F0aW9uIGJhciBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDAgKi9cbiAgICAubm90ZS1kb2N0b3ItbmF2LWJhciB7XG4gICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjtcbiAgICAgIGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjtcbiAgICB9XG4gICAgLm5vdGUtZG9jdG9yLW5hdi1idG4ge1xuICAgICAgYmFja2dyb3VuZDogbm9uZTtcbiAgICAgIGJvcmRlcjogbm9uZTtcbiAgICAgIGNvbG9yOiB2YXIoLS10ZXh0LW11dGVkKTtcbiAgICAgIGN1cnNvcjogcG9pbnRlcjtcbiAgICAgIGZvbnQtc2l6ZTogMTJweDtcbiAgICAgIHBhZGRpbmc6IDNweCA4cHg7XG4gICAgICBib3JkZXItcmFkaXVzOiA0cHg7XG4gICAgICB0cmFuc2l0aW9uOiBjb2xvciAwLjFzLCBiYWNrZ3JvdW5kIDAuMXM7XG4gICAgfVxuICAgIC5ub3RlLWRvY3Rvci1uYXYtYnRuOmhvdmVyIHtcbiAgICAgIGNvbG9yOiB2YXIoLS10ZXh0LW5vcm1hbCk7XG4gICAgICBiYWNrZ3JvdW5kOiB2YXIoLS1iYWNrZ3JvdW5kLW1vZGlmaWVyLWhvdmVyKTtcbiAgICB9XG4gICAgLm5vdGUtZG9jdG9yLW5hdi1jb3VudGVyIHtcbiAgICAgIGZvbnQtc2l6ZTogMTNweDtcbiAgICAgIGNvbG9yOiB2YXIoLS10ZXh0LW11dGVkKTtcbiAgICAgIGZvbnQtdmFyaWFudC1udW1lcmljOiB0YWJ1bGFyLW51bXM7XG4gICAgICBsZXR0ZXItc3BhY2luZzogMC4wMmVtO1xuICAgIH1cblxuICAgIC8qIFx1MjUwMFx1MjUwMCBcIk5vIG5vdGVzXCIgc3RhdGUgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwICovXG4gICAgLm5vdGUtZG9jdG9yLXRyaWFnZS1kb25lIHtcbiAgICAgIHRleHQtYWxpZ246IGNlbnRlcjtcbiAgICAgIGNvbG9yOiB2YXIoLS10ZXh0LW11dGVkKTtcbiAgICAgIG1hcmdpbi10b3A6IDQwcHg7XG4gICAgICBmb250LXNpemU6IDE2cHg7XG4gICAgfVxuXG4gICAgLyogXHUyNTAwXHUyNTAwIENhcmQgc3RhY2sgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwICovXG4gICAgLm5vdGUtZG9jdG9yLXN0YWNrLXdyYXAge1xuICAgICAgcG9zaXRpb246IHJlbGF0aXZlO1xuICAgICAgaGVpZ2h0OiAzMDBweDtcbiAgICAgIG92ZXJmbG93OiBoaWRkZW47XG4gICAgICBib3JkZXItcmFkaXVzOiA4cHg7XG4gICAgfVxuICAgIC5ub3RlLWRvY3Rvci1jYXJkIHtcbiAgICAgIHBvc2l0aW9uOiBhYnNvbHV0ZTtcbiAgICAgIGluc2V0OiAwO1xuICAgICAgYmFja2dyb3VuZDogdmFyKC0tYmFja2dyb3VuZC1wcmltYXJ5KTtcbiAgICAgIGJvcmRlcjogMXB4IHNvbGlkIHZhcigtLWJhY2tncm91bmQtbW9kaWZpZXItYm9yZGVyKTtcbiAgICAgIGJvcmRlci1yYWRpdXM6IDhweDtcbiAgICAgIHBhZGRpbmc6IDE2cHg7XG4gICAgICBkaXNwbGF5OiBmbGV4O1xuICAgICAgZmxleC1kaXJlY3Rpb246IGNvbHVtbjtcbiAgICAgIGdhcDogMTBweDtcbiAgICAgIGJveC1zaGFkb3c6IDAgMnB4IDhweCByZ2JhKDAsMCwwLDAuMTIpO1xuICAgIH1cbiAgICAubm90ZS1kb2N0b3ItY2FyZC1kZXB0aC0yIHtcbiAgICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlKDhweCwgMTJweCkgc2NhbGUoMC45Nik7XG4gICAgICB6LWluZGV4OiAwO1xuICAgICAgYmFja2dyb3VuZDogdmFyKC0tYmFja2dyb3VuZC1zZWNvbmRhcnktYWx0KTtcbiAgICAgIHBvaW50ZXItZXZlbnRzOiBub25lO1xuICAgIH1cbiAgICAubm90ZS1kb2N0b3ItY2FyZC1kZXB0aC0xIHtcbiAgICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlKDRweCwgNnB4KSBzY2FsZSgwLjk4KTtcbiAgICAgIHotaW5kZXg6IDE7XG4gICAgICBiYWNrZ3JvdW5kOiB2YXIoLS1iYWNrZ3JvdW5kLXNlY29uZGFyeSk7XG4gICAgICBwb2ludGVyLWV2ZW50czogbm9uZTtcbiAgICB9XG4gICAgLm5vdGUtZG9jdG9yLWNhcmQtZGVwdGgtMCB7XG4gICAgICB6LWluZGV4OiAyO1xuICAgIH1cbiAgICAubm90ZS1kb2N0b3ItY2FyZC10aXRsZSB7XG4gICAgICBmb250LXNpemU6IDE2cHg7XG4gICAgICBmb250LXdlaWdodDogNjAwO1xuICAgICAgY29sb3I6IHZhcigtLXRleHQtbm9ybWFsKTtcbiAgICB9XG4gICAgLm5vdGUtZG9jdG9yLWNhcmQtcHJldmlldyB7XG4gICAgICBmb250LXNpemU6IDEzcHg7XG4gICAgICBjb2xvcjogdmFyKC0tdGV4dC1tdXRlZCk7XG4gICAgICBmbGV4OiAxO1xuICAgICAgb3ZlcmZsb3c6IGhpZGRlbjtcbiAgICAgIGRpc3BsYXk6IC13ZWJraXQtYm94O1xuICAgICAgLXdlYmtpdC1saW5lLWNsYW1wOiA1O1xuICAgICAgLXdlYmtpdC1ib3gtb3JpZW50OiB2ZXJ0aWNhbDtcbiAgICAgIGxpbmUtaGVpZ2h0OiAxLjU7XG4gICAgfVxuXG4gICAgLyogXHUyNTAwXHUyNTAwIEhvdGtleSBoaW50cyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDAgKi9cbiAgICAubm90ZS1kb2N0b3ItY2FyZC1oaW50IHtcbiAgICAgIGRpc3BsYXk6IGZsZXg7XG4gICAgICBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47XG4gICAgICBmb250LXNpemU6IDExcHg7XG4gICAgICBjb2xvcjogdmFyKC0tdGV4dC1mYWludCk7XG4gICAgICBtYXJnaW4tdG9wOiBhdXRvO1xuICAgICAgcGFkZGluZzogMCAycHg7XG4gICAgfVxuXG4gICAgLyogXHUyNTAwXHUyNTAwIEFjdGlvbiBidXR0b25zIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCAqL1xuICAgIC5ub3RlLWRvY3Rvci1jYXJkLWFjdGlvbnMge1xuICAgICAgZGlzcGxheTogZmxleDtcbiAgICAgIGdhcDogOHB4O1xuICAgIH1cbiAgICAubm90ZS1kb2N0b3ItdHJpYWdlLWJ0biB7XG4gICAgICBmbGV4OiAxO1xuICAgICAgcGFkZGluZzogNnB4IDEwcHg7XG4gICAgICBib3JkZXItcmFkaXVzOiA1cHg7XG4gICAgICBib3JkZXI6IDFweCBzb2xpZCB2YXIoLS1iYWNrZ3JvdW5kLW1vZGlmaWVyLWJvcmRlcik7XG4gICAgICBiYWNrZ3JvdW5kOiB2YXIoLS1iYWNrZ3JvdW5kLXNlY29uZGFyeSk7XG4gICAgICBjb2xvcjogdmFyKC0tdGV4dC1ub3JtYWwpO1xuICAgICAgY3Vyc29yOiBwb2ludGVyO1xuICAgICAgZm9udC1zaXplOiAxM3B4O1xuICAgIH1cbiAgICAubm90ZS1kb2N0b3ItdHJpYWdlLWNvbXBsZXRlOmhvdmVyICAgeyBiYWNrZ3JvdW5kOiB2YXIoLS1jb2xvci1ncmVlbik7ICAgICAgICBjb2xvcjogI2ZmZjsgfVxuICAgIC5ub3RlLWRvY3Rvci10cmlhZ2UtaW5jb21wbGV0ZTpob3ZlciB7IGJhY2tncm91bmQ6IHZhcigtLWNvbG9yLXJlZCk7ICAgICAgICAgIGNvbG9yOiAjZmZmOyB9XG4gICAgLm5vdGUtZG9jdG9yLXRyaWFnZS1vcGVuOmhvdmVyICAgICAgIHsgYmFja2dyb3VuZDogdmFyKC0taW50ZXJhY3RpdmUtYWNjZW50KTsgY29sb3I6ICNmZmY7IH1cbiAgICAubmQtYnRuLXNlbGVjdGVkLWdyZWVuIHsgYmFja2dyb3VuZDogdmFyKC0tY29sb3ItZ3JlZW4pICAhaW1wb3J0YW50OyBjb2xvcjogI2ZmZiAhaW1wb3J0YW50OyB9XG4gICAgLm5kLWJ0bi1zZWxlY3RlZC1yZWQgICB7IGJhY2tncm91bmQ6IHZhcigtLWNvbG9yLXJlZCkgICAgIWltcG9ydGFudDsgY29sb3I6ICNmZmYgIWltcG9ydGFudDsgfVxuXG4gICAgLyogXHUyNTAwXHUyNTAwIEJ1dHRvbiBmbGFzaCBhbmltYXRpb25zIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCAqL1xuICAgIEBrZXlmcmFtZXMgbmQtZmxhc2gtZ3JlZW4ge1xuICAgICAgMCUgICB7IGJhY2tncm91bmQ6IHZhcigtLWJhY2tncm91bmQtc2Vjb25kYXJ5KTsgY29sb3I6IHZhcigtLXRleHQtbm9ybWFsKTsgfVxuICAgICAgNDUlICB7IGJhY2tncm91bmQ6IHZhcigtLWNvbG9yLWdyZWVuKTsgICAgICAgICAgY29sb3I6ICNmZmY7IGJveC1zaGFkb3c6IDAgMCAwIDNweCBjb2xvci1taXgoaW4gc3JnYiwgdmFyKC0tY29sb3ItZ3JlZW4pIDMwJSwgdHJhbnNwYXJlbnQpOyB9XG4gICAgICAxMDAlIHsgYmFja2dyb3VuZDogdmFyKC0tYmFja2dyb3VuZC1zZWNvbmRhcnkpOyBjb2xvcjogdmFyKC0tdGV4dC1ub3JtYWwpOyB9XG4gICAgfVxuICAgIEBrZXlmcmFtZXMgbmQtZmxhc2gtcmVkIHtcbiAgICAgIDAlICAgeyBiYWNrZ3JvdW5kOiB2YXIoLS1iYWNrZ3JvdW5kLXNlY29uZGFyeSk7IGNvbG9yOiB2YXIoLS10ZXh0LW5vcm1hbCk7IH1cbiAgICAgIDQ1JSAgeyBiYWNrZ3JvdW5kOiB2YXIoLS1jb2xvci1yZWQpOyAgICAgICAgICAgIGNvbG9yOiAjZmZmOyBib3gtc2hhZG93OiAwIDAgMCAzcHggY29sb3ItbWl4KGluIHNyZ2IsIHZhcigtLWNvbG9yLXJlZCkgMzAlLCB0cmFuc3BhcmVudCk7IH1cbiAgICAgIDEwMCUgeyBiYWNrZ3JvdW5kOiB2YXIoLS1iYWNrZ3JvdW5kLXNlY29uZGFyeSk7IGNvbG9yOiB2YXIoLS10ZXh0LW5vcm1hbCk7IH1cbiAgICB9XG4gICAgQGtleWZyYW1lcyBuZC1mbGFzaC1ibHVlIHtcbiAgICAgIDAlICAgeyBiYWNrZ3JvdW5kOiB2YXIoLS1iYWNrZ3JvdW5kLXNlY29uZGFyeSk7ICBjb2xvcjogdmFyKC0tdGV4dC1ub3JtYWwpOyB9XG4gICAgICA0NSUgIHsgYmFja2dyb3VuZDogdmFyKC0taW50ZXJhY3RpdmUtYWNjZW50KTsgICAgY29sb3I6ICNmZmY7IGJveC1zaGFkb3c6IDAgMCAwIDNweCBjb2xvci1taXgoaW4gc3JnYiwgdmFyKC0taW50ZXJhY3RpdmUtYWNjZW50KSAzMCUsIHRyYW5zcGFyZW50KTsgfVxuICAgICAgMTAwJSB7IGJhY2tncm91bmQ6IHZhcigtLWJhY2tncm91bmQtc2Vjb25kYXJ5KTsgIGNvbG9yOiB2YXIoLS10ZXh0LW5vcm1hbCk7IH1cbiAgICB9XG4gICAgLm5kLWZsYXNoLWdyZWVuIHsgYW5pbWF0aW9uOiBuZC1mbGFzaC1ncmVlbiAwLjI4cyBlYXNlIGJvdGg7IH1cbiAgICAubmQtZmxhc2gtcmVkICAgeyBhbmltYXRpb246IG5kLWZsYXNoLXJlZCAgIDAuMjhzIGVhc2UgYm90aDsgfVxuICAgIC5uZC1mbGFzaC1ibHVlICB7IGFuaW1hdGlvbjogbmQtZmxhc2gtYmx1ZSAgMC4yOHMgZWFzZSBib3RoOyB9XG5cbiAgICAvKiBcdTI1MDBcdTI1MDAgVGFnIGNoaXAgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwICovXG4gICAgLm5vdGUtZG9jdG9yLWNhcmQtdGFnIHtcbiAgICAgIHBvc2l0aW9uOiByZWxhdGl2ZTtcbiAgICAgIGRpc3BsYXk6IGlubGluZS1ibG9jaztcbiAgICAgIGFsaWduLXNlbGY6IGZsZXgtc3RhcnQ7XG4gICAgICBmb250LXNpemU6IDExcHg7XG4gICAgICBjb2xvcjogdmFyKC0taW50ZXJhY3RpdmUtYWNjZW50KTtcbiAgICAgIGJhY2tncm91bmQ6IGNvbG9yLW1peChpbiBzcmdiLCB2YXIoLS1pbnRlcmFjdGl2ZS1hY2NlbnQpIDEyJSwgdHJhbnNwYXJlbnQpO1xuICAgICAgYm9yZGVyLXJhZGl1czogM3B4O1xuICAgICAgcGFkZGluZzogMnB4IDdweDtcbiAgICAgIG92ZXJmbG93OiBoaWRkZW47XG4gICAgfVxuICAgIC8qIFN0YXRpYyBzdHJ1Y2stdGhyb3VnaCBzdGF0ZSAobm90ZSBhbHJlYWR5IGNvbXBsZXRlZCwgY2FyZCByZXZpc2l0ZWQpICovXG4gICAgLm5kLXRhZy1zdHJ1Y2s6OmFmdGVyIHtcbiAgICAgIGNvbnRlbnQ6ICcnO1xuICAgICAgcG9zaXRpb246IGFic29sdXRlO1xuICAgICAgbGVmdDogMDtcbiAgICAgIHRvcDogNTAlO1xuICAgICAgd2lkdGg6IDEwMCU7XG4gICAgICBoZWlnaHQ6IDJweDtcbiAgICAgIGJhY2tncm91bmQ6IGN1cnJlbnRDb2xvcjtcbiAgICAgIHRyYW5zZm9ybTogdHJhbnNsYXRlWSgtNTAlKTtcbiAgICB9XG4gICAgLyogQW5pbWF0ZWQgc3RyaWtldGhyb3VnaCBcdTIwMTQgbGluZSBkcmF3cyBsZWZ0IHRvIHJpZ2h0ICovXG4gICAgQGtleWZyYW1lcyBuZC1zdHJpa2UtbGluZSB7XG4gICAgICBmcm9tIHsgd2lkdGg6IDA7IH1cbiAgICAgIHRvICAgeyB3aWR0aDogMTAwJTsgfVxuICAgIH1cbiAgICAubmQtc3RyaWtldGhyb3VnaDo6YWZ0ZXIge1xuICAgICAgY29udGVudDogJyc7XG4gICAgICBwb3NpdGlvbjogYWJzb2x1dGU7XG4gICAgICBsZWZ0OiAwO1xuICAgICAgdG9wOiA1MCU7XG4gICAgICB3aWR0aDogMDtcbiAgICAgIGhlaWdodDogMnB4O1xuICAgICAgYmFja2dyb3VuZDogY3VycmVudENvbG9yO1xuICAgICAgdHJhbnNmb3JtOiB0cmFuc2xhdGVZKC01MCUpO1xuICAgICAgYW5pbWF0aW9uOiBuZC1zdHJpa2UtbGluZSAwLjM1cyBlYXNlLW91dCBmb3J3YXJkcztcbiAgICB9XG5cbiAgICAvKiBcdTI1MDBcdTI1MDAgTnVyc2Ugbm90aWNlIHN0cmlrZXRocm91Z2ggXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwICovXG4gICAgLm5kLW51cnNlLXN0cmlrZS10YWcge1xuICAgICAgdGV4dC1kZWNvcmF0aW9uOiBsaW5lLXRocm91Z2g7XG4gICAgICB0ZXh0LWRlY29yYXRpb24tY29sb3I6IGN1cnJlbnRDb2xvcjtcbiAgICB9XG5cbiAgICAvKiBcdTI1MDBcdTI1MDAgQ2FyZCBzbGlkZSBhbmltYXRpb25zIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCAqL1xuICAgIEBrZXlmcmFtZXMgbmQtc2xpZGUtb3V0LWxlZnQge1xuICAgICAgZnJvbSB7IHRyYW5zZm9ybTogdHJhbnNsYXRlWCgwKTsgICAgIG9wYWNpdHk6IDE7IH1cbiAgICAgIHRvICAgeyB0cmFuc2Zvcm06IHRyYW5zbGF0ZVgoLTExMCUpOyBvcGFjaXR5OiAwOyB9XG4gICAgfVxuICAgIEBrZXlmcmFtZXMgbmQtc2xpZGUtaW4tcmlnaHQge1xuICAgICAgZnJvbSB7IHRyYW5zZm9ybTogdHJhbnNsYXRlWCgxMTAlKTsgIG9wYWNpdHk6IDA7IH1cbiAgICAgIHRvICAgeyB0cmFuc2Zvcm06IHRyYW5zbGF0ZVgoMCk7ICAgICBvcGFjaXR5OiAxOyB9XG4gICAgfVxuICAgIEBrZXlmcmFtZXMgbmQtc2xpZGUtb3V0LXJpZ2h0IHtcbiAgICAgIGZyb20geyB0cmFuc2Zvcm06IHRyYW5zbGF0ZVgoMCk7ICAgIG9wYWNpdHk6IDE7IH1cbiAgICAgIHRvICAgeyB0cmFuc2Zvcm06IHRyYW5zbGF0ZVgoMTEwJSk7IG9wYWNpdHk6IDA7IH1cbiAgICB9XG4gICAgQGtleWZyYW1lcyBuZC1zbGlkZS1pbi1sZWZ0IHtcbiAgICAgIGZyb20geyB0cmFuc2Zvcm06IHRyYW5zbGF0ZVgoLTExMCUpOyBvcGFjaXR5OiAwOyB9XG4gICAgICB0byAgIHsgdHJhbnNmb3JtOiB0cmFuc2xhdGVYKDApOyAgICAgb3BhY2l0eTogMTsgfVxuICAgIH1cbiAgICAubmQtc2xpZGUtb3V0LWxlZnQgIHsgYW5pbWF0aW9uOiBuZC1zbGlkZS1vdXQtbGVmdCAgMC4yMnMgZWFzZS1pbiAgZm9yd2FyZHM7IH1cbiAgICAubmQtc2xpZGUtaW4tcmlnaHQgIHsgYW5pbWF0aW9uOiBuZC1zbGlkZS1pbi1yaWdodCAgMC4yMnMgZWFzZS1vdXQgZm9yd2FyZHM7IH1cbiAgICAubmQtc2xpZGUtb3V0LXJpZ2h0IHsgYW5pbWF0aW9uOiBuZC1zbGlkZS1vdXQtcmlnaHQgMC4yMnMgZWFzZS1pbiAgZm9yd2FyZHM7IH1cbiAgICAubmQtc2xpZGUtaW4tbGVmdCAgIHsgYW5pbWF0aW9uOiBuZC1zbGlkZS1pbi1sZWZ0ICAgMC4yMnMgZWFzZS1vdXQgZm9yd2FyZHM7IH1cbiAgYDtcbiAgZG9jLmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpO1xufVxuIiwgImltcG9ydCB7IEFwcCwgUGx1Z2luU2V0dGluZ1RhYiwgU2V0dGluZyB9IGZyb20gXCJvYnNpZGlhblwiO1xuaW1wb3J0IHR5cGUgTm90ZURvY3RvclBsdWdpbiBmcm9tIFwiLi9tYWluXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTm90ZURvY3RvclNldHRpbmdzIHtcbiAgZW5hYmxlQ29tcGxldGVOb3RlOiBib29sZWFuO1xuICBlbmFibGVUcmlhZ2U6IGJvb2xlYW47XG4gIHRyaWFnZVRhZzogc3RyaW5nO1xufVxuXG5leHBvcnQgY29uc3QgREVGQVVMVF9TRVRUSU5HUzogTm90ZURvY3RvclNldHRpbmdzID0ge1xuICBlbmFibGVDb21wbGV0ZU5vdGU6IHRydWUsXG4gIGVuYWJsZVRyaWFnZTogdHJ1ZSxcbiAgdHJpYWdlVGFnOiBcIklOQ09NUExFVEVcIixcbn07XG5cbmV4cG9ydCBjbGFzcyBOb3RlRG9jdG9yU2V0dGluZ1RhYiBleHRlbmRzIFBsdWdpblNldHRpbmdUYWIge1xuICBwbHVnaW46IE5vdGVEb2N0b3JQbHVnaW47XG5cbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHBsdWdpbjogTm90ZURvY3RvclBsdWdpbikge1xuICAgIHN1cGVyKGFwcCwgcGx1Z2luKTtcbiAgICB0aGlzLnBsdWdpbiA9IHBsdWdpbjtcbiAgfVxuXG4gIGRpc3BsYXkoKTogdm9pZCB7XG4gICAgY29uc3QgeyBjb250YWluZXJFbCB9ID0gdGhpcztcbiAgICBjb250YWluZXJFbC5lbXB0eSgpO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZShcIlBsYXN0ZXIgVGFnXCIpXG4gICAgICAuc2V0RGVzYyhcIlRhZyB1c2VkIHRvIG1hcmsgbm90ZXMgZm9yIHRoZSBEb2N0b3IncyByZXZpZXcuIEVudGVyIHdpdGhvdXQgI1wiKVxuICAgICAgLmFkZFRleHQodGV4dCA9PlxuICAgICAgICB0ZXh0XG4gICAgICAgICAgLnNldFBsYWNlaG9sZGVyKFwiSU5DT01QTEVURVwiKVxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy50cmlhZ2VUYWcpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgY29uc3Qgc2FuaXRpemVkID0gdmFsdWUucmVwbGFjZSgvXiMrLywgXCJcIikudHJpbSgpIHx8IFwiSU5DT01QTEVURVwiO1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MudHJpYWdlVGFnID0gc2FuaXRpemVkO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgfSlcbiAgICAgICk7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKFwiVGhlIE51cnNlXCIpXG4gICAgICAuc2V0RGVzYyhcIkF1dG8tdGFncyBuZXcgbm90ZXMgd2l0aCB0aGUgcGxhc3RlciB0YWcuIFJlbW92ZXMgcGxhc3RlcnMgd2hlbiBjYWxsZWQgdmlhIGhvdGtleS5cIilcbiAgICAgIC5hZGRUb2dnbGUodG9nZ2xlID0+XG4gICAgICAgIHRvZ2dsZVxuICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5lbmFibGVDb21wbGV0ZU5vdGUpXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZW5hYmxlQ29tcGxldGVOb3RlID0gdmFsdWU7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICB9KVxuICAgICAgKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUoXCJQYXRpZW50IFF1ZXVlXCIpXG4gICAgICAuc2V0RGVzYyhcIkNhbGwgdGhlIERvY3RvciB0byByZXZpZXcgYWxsIG5vdGVzIHdpdGggdGhlIHBsYXN0ZXIgdGFnLlwiKVxuICAgICAgLmFkZFRvZ2dsZSh0b2dnbGUgPT5cbiAgICAgICAgdG9nZ2xlXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmVuYWJsZVRyaWFnZSlcbiAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5lbmFibGVUcmlhZ2UgPSB2YWx1ZTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgIH0pXG4gICAgICApO1xuICB9XG59XG4iLCAiaW1wb3J0IHsgQXBwLCBOb3RpY2UgfSBmcm9tIFwib2JzaWRpYW5cIjtcbmltcG9ydCB7IGFkZFRhZywgaGFzVGFnLCByZW1vdmVUYWcgfSBmcm9tIFwiLi4vc2hhcmVkL3RhZ3NcIjtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQ29tcGxldGVOb3RlQ29tbWFuZHMoYXBwOiBBcHAsIHRhZzogc3RyaW5nLCBhZGRDb21tYW5kOiAoY21kOiBvYmplY3QpID0+IHZvaWQpOiB2b2lkIHtcbiAgYWRkQ29tbWFuZCh7XG4gICAgaWQ6IFwiY29tcGxldGUtbm90ZVwiLFxuICAgIG5hbWU6IFwiVGhlIE51cnNlIFx1MjAxNCBSZW1vdmUgcGxhc3RlciB0YWdcIixcbiAgICBjYWxsYmFjazogYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZmlsZSA9IGFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlRmlsZSgpO1xuICAgICAgaWYgKCFmaWxlKSByZXR1cm47XG4gICAgICBhd2FpdCByZW1vdmVUYWcoYXBwLCBmaWxlLCB0YWcpO1xuICAgICAgY29uc3QgbiA9IG5ldyBOb3RpY2UoXCJcIiwgMjAwMCk7XG4gICAgICBuLm5vdGljZUVsLmNyZWF0ZUVsKFwic3BhblwiLCB7IHRleHQ6IFwiUGxhc3RlciByZW1vdmVkOiBcIiB9KTtcbiAgICAgIG4ubm90aWNlRWwuY3JlYXRlRWwoXCJzcGFuXCIsIHsgdGV4dDogYCMke3RhZ31gLCBjbHM6IFwibmQtbnVyc2Utc3RyaWtlLXRhZ1wiIH0pO1xuICAgIH0sXG4gIH0pO1xuXG4gIGFkZENvbW1hbmQoe1xuICAgIGlkOiBcIm1hcmstaW5jb21wbGV0ZVwiLFxuICAgIG5hbWU6IFwiVGhlIE51cnNlIFx1MjAxNCBBcHBseSBwbGFzdGVyIHRhZ1wiLFxuICAgIGNhbGxiYWNrOiBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBmaWxlID0gYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCk7XG4gICAgICBpZiAoIWZpbGUpIHJldHVybjtcbiAgICAgIGlmICghaGFzVGFnKGFwcCwgZmlsZSwgdGFnKSkge1xuICAgICAgICBhd2FpdCBhZGRUYWcoYXBwLCBmaWxlLCB0YWcpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xufVxuIiwgImltcG9ydCB7IEFwcCwgVEZpbGUgfSBmcm9tIFwib2JzaWRpYW5cIjtcblxuZXhwb3J0IGNvbnN0IElOQ09NUExFVEVfVEFHID0gXCJJTkNPTVBMRVRFXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXNUYWcoYXBwOiBBcHAsIGZpbGU6IFRGaWxlLCB0YWc6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBjb25zdCBjYWNoZSA9IGFwcC5tZXRhZGF0YUNhY2hlLmdldEZpbGVDYWNoZShmaWxlKTtcbiAgaWYgKCFjYWNoZT8udGFncykgcmV0dXJuIGZhbHNlO1xuICByZXR1cm4gY2FjaGUudGFncy5zb21lKCh0KSA9PiB0LnRhZyA9PT0gYCMke3RhZ31gKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlbW92ZVRhZyhhcHA6IEFwcCwgZmlsZTogVEZpbGUsIHRhZzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gIGNvbnN0IGNhY2hlID0gYXBwLm1ldGFkYXRhQ2FjaGUuZ2V0RmlsZUNhY2hlKGZpbGUpO1xuICBpZiAoIWNhY2hlPy50YWdzKSByZXR1cm47XG5cbiAgY29uc3QgdGFyZ2V0cyA9IGNhY2hlLnRhZ3MuZmlsdGVyKCh0KSA9PiB0LnRhZyA9PT0gYCMke3RhZ31gKTtcbiAgaWYgKHRhcmdldHMubGVuZ3RoID09PSAwKSByZXR1cm47XG5cbiAgYXdhaXQgYXBwLnZhdWx0LnByb2Nlc3MoZmlsZSwgKGNvbnRlbnQpID0+IHtcbiAgICBsZXQgcmVzdWx0ID0gY29udGVudDtcbiAgICBjb25zdCBwb3NpdGlvbnMgPSB0YXJnZXRzXG4gICAgICAubWFwKCh0KSA9PiB0LnBvc2l0aW9uKVxuICAgICAgLnNvcnQoKGEsIGIpID0+IGIuc3RhcnQub2Zmc2V0IC0gYS5zdGFydC5vZmZzZXQpO1xuXG4gICAgZm9yIChjb25zdCBwb3Mgb2YgcG9zaXRpb25zKSB7XG4gICAgICBjb25zdCBiZWZvcmUgPSByZXN1bHQuc2xpY2UoMCwgcG9zLnN0YXJ0Lm9mZnNldCk7XG4gICAgICBjb25zdCBhZnRlciA9IHJlc3VsdC5zbGljZShwb3MuZW5kLm9mZnNldCk7XG4gICAgICBjb25zdCB0cmltbWVkID0gYWZ0ZXIucmVwbGFjZSgvXlxcbi8sIFwiXCIpO1xuICAgICAgcmVzdWx0ID0gYmVmb3JlICsgdHJpbW1lZDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhZGRUYWcoYXBwOiBBcHAsIGZpbGU6IFRGaWxlLCB0YWc6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICBpZiAoaGFzVGFnKGFwcCwgZmlsZSwgdGFnKSkgcmV0dXJuO1xuICBhd2FpdCBhcHAudmF1bHQucHJvY2VzcyhmaWxlLCAoY29udGVudCkgPT4ge1xuICAgIGNvbnN0IG1hcmtlciA9IGAjJHt0YWd9YDtcbiAgICBpZiAoY29udGVudC5lbmRzV2l0aChcIlxcblwiKSkgcmV0dXJuIGNvbnRlbnQgKyBtYXJrZXIgKyBcIlxcblwiO1xuICAgIHJldHVybiBjb250ZW50ICsgXCJcXG5cIiArIG1hcmtlciArIFwiXFxuXCI7XG4gIH0pO1xufVxuXG4vLyBCYWNrd2FyZHMtY29tcGF0aWJsZSBhbGlhc2VzIHVzZWQgYnkgb2xkZXIgY2FsbCBzaXRlcy5cbmV4cG9ydCBjb25zdCBoYXNJbmNvbXBsZXRlVGFnICA9IChhcHA6IEFwcCwgZmlsZTogVEZpbGUpID0+IGhhc1RhZyhhcHAsIGZpbGUsIElOQ09NUExFVEVfVEFHKTtcbmV4cG9ydCBjb25zdCByZW1vdmVJbmNvbXBsZXRlVGFnID0gKGFwcDogQXBwLCBmaWxlOiBURmlsZSkgPT4gcmVtb3ZlVGFnKGFwcCwgZmlsZSwgSU5DT01QTEVURV9UQUcpO1xuZXhwb3J0IGNvbnN0IGFkZEluY29tcGxldGVUYWcgID0gKGFwcDogQXBwLCBmaWxlOiBURmlsZSkgPT4gYWRkVGFnKGFwcCwgZmlsZSwgSU5DT01QTEVURV9UQUcpO1xuIiwgImltcG9ydCB7IEFwcCwgTW9kYWwsIE5vdGljZSB9IGZyb20gXCJvYnNpZGlhblwiO1xuaW1wb3J0IHsgSU5DT01QTEVURV9UQUcsIHJlbW92ZVRhZyB9IGZyb20gXCIuLi9zaGFyZWQvdGFnc1wiO1xuaW1wb3J0IHsgbG9hZENhbmRpZGF0ZXMsIENhcmRJdGVtIH0gZnJvbSBcIi4uL3NoYXJlZC9jYXJkU3RhY2tcIjtcblxudHlwZSBOb3RlU3RhdHVzID0gXCJwZW5kaW5nXCIgfCBcImNvbXBsZXRlXCIgfCBcImlnbm9yZWRcIjtcblxuZXhwb3J0IGNsYXNzIFRyaWFnZU1vZGFsIGV4dGVuZHMgTW9kYWwge1xuICBwcml2YXRlIGl0ZW1zOiBDYXJkSXRlbVtdID0gW107XG4gIHByaXZhdGUgbm90ZVN0YXR1cyA9IG5ldyBNYXA8c3RyaW5nLCBOb3RlU3RhdHVzPigpO1xuICBwcml2YXRlIGN1cnJlbnRJZHggPSAwO1xuICBwcml2YXRlIGJ1c3kgPSBmYWxzZTtcblxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcHJpdmF0ZSByZWFkb25seSB0YWc6IHN0cmluZyA9IElOQ09NUExFVEVfVEFHKSB7XG4gICAgc3VwZXIoYXBwKTtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0IGNvbXBsZXRlTGFiZWwoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gdGhpcy50YWcgPT09IElOQ09NUExFVEVfVEFHID8gXCJDb21wbGV0ZVwiIDogXCJIZWFsXCI7XG4gIH1cblxuICBhc3luYyBvbk9wZW4oKSB7XG4gICAgdGhpcy5tb2RhbEVsLmFkZENsYXNzKFwibm90ZS1kb2N0b3ItdHJpYWdlLW1vZGFsXCIpO1xuICAgIHRoaXMudGl0bGVFbC5zZXRUZXh0KFwiTm90ZSBEb2N0b3JcIik7XG5cbiAgICAvLyBTdWJ0aXRsZSBzaXRzIGJldHdlZW4gdGhlIG1vZGFsIHRpdGxlIGJhciBhbmQgdGhlIGNvbnRlbnQgYXJlYSBcdTIwMTRcbiAgICAvLyBpbnNlcnRlZCBhcyBhIHNpYmxpbmcgb2YgdGl0bGVFbCBzbyBpdCBuZXZlciBwYXJ0aWNpcGF0ZXMgaW4gc2xpZGUgYW5pbWF0aW9ucy5cbiAgICBjb25zdCBzdWJ0aXRsZSA9IHRoaXMuY29udGFpbmVyRWwub3duZXJEb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgIHN1YnRpdGxlLmNsYXNzTmFtZSA9IFwibm90ZS1kb2N0b3ItdHJpYWdlLXN1YnRpdGxlXCI7XG4gICAgc3VidGl0bGUudGV4dENvbnRlbnQgPSBgUXVpY2tseSByZXZpZXcgbm90ZXMgdGFnZ2VkICMke3RoaXMudGFnfWA7XG4gICAgdGhpcy50aXRsZUVsLmluc2VydEFkamFjZW50RWxlbWVudChcImFmdGVyZW5kXCIsIHN1YnRpdGxlKTtcblxuICAgIHRoaXMuc2NvcGUucmVnaXN0ZXIoW10sIFwidVwiLCAgICAgICgpID0+IHsgdGhpcy50cmlnZ2VyQ3VycmVudENvbXBsZXRlKCk7IHJldHVybiBmYWxzZTsgfSk7XG4gICAgdGhpcy5zY29wZS5yZWdpc3RlcihbXSwgXCJpXCIsICAgICAgKCkgPT4geyB0aGlzLnRyaWdnZXJDdXJyZW50SWdub3JlKCk7ICAgcmV0dXJuIGZhbHNlOyB9KTtcbiAgICB0aGlzLnNjb3BlLnJlZ2lzdGVyKFtdLCBcIm9cIiwgICAgICAoKSA9PiB7IHRoaXMudHJpZ2dlckN1cnJlbnRSZXZpZXcoKTsgICByZXR1cm4gZmFsc2U7IH0pO1xuICAgIHRoaXMuc2NvcGUucmVnaXN0ZXIoW10sIFwiRW50ZXJcIiwgICgpID0+IHsgdGhpcy50cmlnZ2VyQ3VycmVudFJldmlldygpOyAgIHJldHVybiBmYWxzZTsgfSk7XG4gICAgdGhpcy5zY29wZS5yZWdpc3RlcihbXSwgXCJFc2NhcGVcIiwgKCkgPT4geyB0aGlzLmNsb3NlKCk7ICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlOyB9KTtcblxuICAgIGNvbnN0IGxvYWRlZCA9IGF3YWl0IGxvYWRDYW5kaWRhdGVzKHRoaXMuYXBwLCB0aGlzLnRhZyk7XG4gICAgaWYgKGxvYWRlZC5sZW5ndGggPT09IDApIHtcbiAgICAgIHRoaXMuY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IGNsczogXCJub3RlLWRvY3Rvci10cmlhZ2UtZG9uZVwiLCB0ZXh0OiBcIlx1MjcxMyBObyBub3RlcyB0byByZXZpZXcuXCIgfSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdGhpcy5pdGVtcyA9IGxvYWRlZDtcbiAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgdGhpcy5pdGVtcykgdGhpcy5ub3RlU3RhdHVzLnNldChpdGVtLmZpbGUucGF0aCwgXCJwZW5kaW5nXCIpO1xuICAgIHRoaXMucmVuZGVyQ2FyZChcIm5vbmVcIik7XG4gIH1cblxuICAvLyBcdTI1MDBcdTI1MDAgaGVscGVycyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuICBwcml2YXRlIGN1cnJlbnRJdGVtKCk6IENhcmRJdGVtIHwgbnVsbCB7XG4gICAgaWYgKCF0aGlzLml0ZW1zLmxlbmd0aCkgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIHRoaXMuaXRlbXNbTWF0aC5taW4odGhpcy5jdXJyZW50SWR4LCB0aGlzLml0ZW1zLmxlbmd0aCAtIDEpXTtcbiAgfVxuXG4gIHByaXZhdGUgbmF2aWdhdGUoZGlyZWN0aW9uOiBcImZvcndhcmRcIiB8IFwiYmFja3dhcmRcIikge1xuICAgIGlmICghdGhpcy5pdGVtcy5sZW5ndGgpIHJldHVybjtcbiAgICB0aGlzLmN1cnJlbnRJZHggPSBkaXJlY3Rpb24gPT09IFwiZm9yd2FyZFwiXG4gICAgICA/ICh0aGlzLmN1cnJlbnRJZHggKyAxKSAlIHRoaXMuaXRlbXMubGVuZ3RoXG4gICAgICA6ICh0aGlzLmN1cnJlbnRJZHggLSAxICsgdGhpcy5pdGVtcy5sZW5ndGgpICUgdGhpcy5pdGVtcy5sZW5ndGg7XG4gICAgdGhpcy5yZW5kZXJDYXJkKGRpcmVjdGlvbik7XG4gIH1cblxuICBwcml2YXRlIGNoZWNrQWxsQWN0aW9uZWQoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMuaXRlbXMuZXZlcnkoaSA9PiB0aGlzLm5vdGVTdGF0dXMuZ2V0KGkuZmlsZS5wYXRoKSAhPT0gXCJwZW5kaW5nXCIpO1xuICB9XG5cbiAgLy8gXHUyNTAwXHUyNTAwIHJlbmRlciBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuICBwcml2YXRlIHJlbmRlckNhcmQoZGlyZWN0aW9uOiBcImZvcndhcmRcIiB8IFwiYmFja3dhcmRcIiB8IFwibm9uZVwiKSB7XG4gICAgaWYgKCF0aGlzLml0ZW1zLmxlbmd0aCkge1xuICAgICAgdGhpcy5jb250ZW50RWwuZW1wdHkoKTtcbiAgICAgIHRoaXMuY2xvc2UoKTtcbiAgICAgIG5ldyBOb3RpY2UoXCJcdTI3MTMgQWxsIG5vdGVzIHRyaWFnZWQuXCIsIDMwMDApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmICh0aGlzLmN1cnJlbnRJZHggPj0gdGhpcy5pdGVtcy5sZW5ndGgpIHRoaXMuY3VycmVudElkeCA9IDA7XG4gICAgY29uc3QgaXRlbSA9IHRoaXMuaXRlbXNbdGhpcy5jdXJyZW50SWR4XTtcblxuICAgIGNvbnN0IG5ld0NvbnRhaW5lciA9IHRoaXMuYnVpbGRDb250YWluZXIoaXRlbSk7XG4gICAgY29uc3Qgdmlld3BvcnQgPSB0aGlzLmNvbnRlbnRFbC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcIi5ub3RlLWRvY3Rvci1zbGlkZS12aWV3cG9ydFwiKTtcblxuICAgIC8vIFx1MjUwMFx1MjUwMCBGaXJzdCByZW5kZXIgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4gICAgaWYgKCF2aWV3cG9ydCB8fCBkaXJlY3Rpb24gPT09IFwibm9uZVwiKSB7XG4gICAgICB0aGlzLmNvbnRlbnRFbC5lbXB0eSgpO1xuICAgICAgY29uc3QgdnAgPSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVFbChcImRpdlwiLCB7IGNsczogXCJub3RlLWRvY3Rvci1zbGlkZS12aWV3cG9ydFwiIH0pO1xuICAgICAgdnAuYXBwZW5kQ2hpbGQobmV3Q29udGFpbmVyKTtcbiAgICAgIHRoaXMuYnVzeSA9IGZhbHNlO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFx1MjUwMFx1MjUwMCBBbmltYXRlZCByZW5kZXIgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4gICAgY29uc3Qgb2xkQ29udGFpbmVyID0gdmlld3BvcnQucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oXCIubm90ZS1kb2N0b3ItY2FyZC1jb250YWluZXJcIik7XG4gICAgaWYgKCFvbGRDb250YWluZXIpIHtcbiAgICAgIHZpZXdwb3J0LmlubmVySFRNTCA9IFwiXCI7XG4gICAgICB2aWV3cG9ydC5hcHBlbmRDaGlsZChuZXdDb250YWluZXIpO1xuICAgICAgdGhpcy5idXN5ID0gZmFsc2U7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdmlld3BvcnQuc3R5bGUuc2V0UHJvcGVydHkoXCItLW5kLWhcIiwgYCR7dmlld3BvcnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkuaGVpZ2h0fXB4YCk7XG4gICAgdmlld3BvcnQuY2xhc3NMaXN0LmFkZChcIm5kLWhlaWdodC1sb2NrZWRcIik7XG5cbiAgICBjb25zdCBvdXRDbGFzcyA9IGRpcmVjdGlvbiA9PT0gXCJmb3J3YXJkXCIgPyBcIm5kLXNsaWRlLW91dC1sZWZ0XCIgIDogXCJuZC1zbGlkZS1vdXQtcmlnaHRcIjtcbiAgICBjb25zdCBpbkNsYXNzICA9IGRpcmVjdGlvbiA9PT0gXCJmb3J3YXJkXCIgPyBcIm5kLXNsaWRlLWluLXJpZ2h0XCIgIDogXCJuZC1zbGlkZS1pbi1sZWZ0XCI7XG5cbiAgICB2aWV3cG9ydC5jbGFzc0xpc3QuYWRkKFwibmQtdHJhbnNpdGlvbmluZ1wiKTtcbiAgICBvbGRDb250YWluZXIuY2xhc3NMaXN0LmFkZChvdXRDbGFzcyk7XG4gICAgbmV3Q29udGFpbmVyLmNsYXNzTGlzdC5hZGQoaW5DbGFzcyk7XG4gICAgdmlld3BvcnQuYXBwZW5kQ2hpbGQobmV3Q29udGFpbmVyKTtcblxuICAgIGNvbnN0IG9uRG9uZSA9IChlOiBFdmVudCkgPT4ge1xuICAgICAgaWYgKGUudGFyZ2V0ICE9PSBuZXdDb250YWluZXIpIHJldHVybjtcbiAgICAgIG5ld0NvbnRhaW5lci5yZW1vdmVFdmVudExpc3RlbmVyKFwiYW5pbWF0aW9uZW5kXCIsIG9uRG9uZSk7XG4gICAgICBuZXdDb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZShpbkNsYXNzKTtcbiAgICAgIG9sZENvbnRhaW5lci5yZW1vdmUoKTtcbiAgICAgIHZpZXdwb3J0LmNsYXNzTGlzdC5yZW1vdmUoXCJuZC10cmFuc2l0aW9uaW5nXCIpO1xuICAgICAgdmlld3BvcnQuc3R5bGUucmVtb3ZlUHJvcGVydHkoXCItLW5kLWhcIik7XG4gICAgICB2aWV3cG9ydC5jbGFzc0xpc3QucmVtb3ZlKFwibmQtaGVpZ2h0LWxvY2tlZFwiKTtcbiAgICAgIHRoaXMuYnVzeSA9IGZhbHNlO1xuICAgIH07XG4gICAgbmV3Q29udGFpbmVyLmFkZEV2ZW50TGlzdGVuZXIoXCJhbmltYXRpb25lbmRcIiwgb25Eb25lKTtcbiAgfVxuXG4gIHByaXZhdGUgYnVpbGRDb250YWluZXIoaXRlbTogQ2FyZEl0ZW0pOiBIVE1MRWxlbWVudCB7XG4gICAgY29uc3QgY29udGFpbmVyID0gdGhpcy5jb250YWluZXJFbC5vd25lckRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgY29udGFpbmVyLmNsYXNzTmFtZSA9IFwibm90ZS1kb2N0b3ItY2FyZC1jb250YWluZXJcIjtcbiAgICBjb25zdCBzdGF0dXMgPSB0aGlzLm5vdGVTdGF0dXMuZ2V0KGl0ZW0uZmlsZS5wYXRoKSA/PyBcInBlbmRpbmdcIjtcblxuICAgIC8vIFx1MjUwMFx1MjUwMCBOYXZpZ2F0aW9uIGJhciBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbiAgICBjb25zdCBuYXZCYXIgPSBjb250YWluZXIuY3JlYXRlRWwoXCJkaXZcIiwgeyBjbHM6IFwibm90ZS1kb2N0b3ItbmF2LWJhclwiIH0pO1xuXG4gICAgY29uc3QgcHJldkJ0biA9IG5hdkJhci5jcmVhdGVFbChcImJ1dHRvblwiLCB7IGNsczogXCJub3RlLWRvY3Rvci1uYXYtYnRuXCIsIHRleHQ6IFwiXHUyMTkwIFByZXZpb3VzXCIgfSk7XG4gICAgcHJldkJ0bi5hZGRFdmVudExpc3RlbmVyKFwibW91c2Vkb3duXCIsIGUgPT4gZS5wcmV2ZW50RGVmYXVsdCgpKTtcbiAgICBwcmV2QnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB0aGlzLm5hdmlnYXRlKFwiYmFja3dhcmRcIikpO1xuXG4gICAgbmF2QmFyLmNyZWF0ZUVsKFwic3BhblwiLCB7XG4gICAgICBjbHM6IFwibm90ZS1kb2N0b3ItbmF2LWNvdW50ZXJcIixcbiAgICAgIHRleHQ6IGAke3RoaXMuY3VycmVudElkeCArIDF9IC8gJHt0aGlzLml0ZW1zLmxlbmd0aH1gLFxuICAgIH0pO1xuXG4gICAgY29uc3QgbmV4dEJ0biA9IG5hdkJhci5jcmVhdGVFbChcImJ1dHRvblwiLCB7IGNsczogXCJub3RlLWRvY3Rvci1uYXYtYnRuXCIsIHRleHQ6IFwiTmV4dCBcdTIxOTJcIiB9KTtcbiAgICBuZXh0QnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZWRvd25cIiwgZSA9PiBlLnByZXZlbnREZWZhdWx0KCkpO1xuICAgIG5leHRCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHRoaXMubmF2aWdhdGUoXCJmb3J3YXJkXCIpKTtcblxuICAgIC8vIFx1MjUwMFx1MjUwMCBDYXJkIHN0YWNrIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuICAgIGNvbnN0IHN0YWNrV3JhcCA9IGNvbnRhaW5lci5jcmVhdGVFbChcImRpdlwiLCB7IGNsczogXCJub3RlLWRvY3Rvci1zdGFjay13cmFwXCIgfSk7XG5cbiAgICBzdGFja1dyYXAuY3JlYXRlRWwoXCJkaXZcIiwgeyBjbHM6IFwibm90ZS1kb2N0b3ItY2FyZCBub3RlLWRvY3Rvci1jYXJkLWRlcHRoLTJcIiB9KTtcbiAgICBzdGFja1dyYXAuY3JlYXRlRWwoXCJkaXZcIiwgeyBjbHM6IFwibm90ZS1kb2N0b3ItY2FyZCBub3RlLWRvY3Rvci1jYXJkLWRlcHRoLTFcIiB9KTtcblxuICAgIGNvbnN0IHRvcENhcmQgPSBzdGFja1dyYXAuY3JlYXRlRWwoXCJkaXZcIiwgeyBjbHM6IFwibm90ZS1kb2N0b3ItY2FyZCBub3RlLWRvY3Rvci1jYXJkLWRlcHRoLTBcIiB9KTtcblxuICAgIHRvcENhcmQuY3JlYXRlRWwoXCJkaXZcIiwgeyBjbHM6IFwibm90ZS1kb2N0b3ItY2FyZC10aXRsZVwiLCB0ZXh0OiBpdGVtLmZpbGUuYmFzZW5hbWUgfSk7XG5cbiAgICAvLyBUYWcgY2hpcCBcdTIwMTQgc2hvd3Mgc3RydWNrLXRocm91Z2ggd2hlbiBub3RlIGlzIGFscmVhZHkgY29tcGxldGVkXG4gICAgY29uc3QgdGFnRWwgPSB0b3BDYXJkLmNyZWF0ZUVsKFwiZGl2XCIsIHtcbiAgICAgIGNsczogXCJub3RlLWRvY3Rvci1jYXJkLXRhZ1wiLFxuICAgICAgdGV4dDogYCMke3RoaXMudGFnfWAsXG4gICAgfSk7XG4gICAgaWYgKHN0YXR1cyA9PT0gXCJjb21wbGV0ZVwiKSB0YWdFbC5hZGRDbGFzcyhcIm5kLXRhZy1zdHJ1Y2tcIik7XG5cbiAgICBpZiAoaXRlbS5wcmV2aWV3KSB7XG4gICAgICB0b3BDYXJkLmNyZWF0ZUVsKFwiZGl2XCIsIHsgY2xzOiBcIm5vdGUtZG9jdG9yLWNhcmQtcHJldmlld1wiLCB0ZXh0OiBpdGVtLnByZXZpZXcgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHByZXZpZXdFbCA9IHRvcENhcmQuY3JlYXRlRWwoXCJkaXZcIiwgeyBjbHM6IFwibm90ZS1kb2N0b3ItY2FyZC1wcmV2aWV3XCIgfSk7XG4gICAgICB2b2lkIHRoaXMuYXBwLnZhdWx0LmNhY2hlZFJlYWQoaXRlbS5maWxlKS50aGVuKGNvbnRlbnQgPT4ge1xuICAgICAgICBjb25zdCB0ZXh0ID0gY29udGVudFxuICAgICAgICAgIC5yZXBsYWNlKC9eLS0tW1xcc1xcU10qPy0tLVxcbj8vLCBcIlwiKVxuICAgICAgICAgIC5yZXBsYWNlKC8jXFx3Ky9nLCBcIlwiKVxuICAgICAgICAgIC50cmltKClcbiAgICAgICAgICAuc2xpY2UoMCwgMzAwKTtcbiAgICAgICAgaXRlbS5wcmV2aWV3ID0gdGV4dDtcbiAgICAgICAgcHJldmlld0VsLnNldFRleHQodGV4dCk7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBoaW50ID0gdG9wQ2FyZC5jcmVhdGVFbChcImRpdlwiLCB7IGNsczogXCJub3RlLWRvY3Rvci1jYXJkLWhpbnRcIiB9KTtcbiAgICBoaW50LmNyZWF0ZUVsKFwic3BhblwiLCB7IHRleHQ6IGBVIFx1MjAxNCAke3RoaXMuY29tcGxldGVMYWJlbH1gIH0pO1xuICAgIGhpbnQuY3JlYXRlRWwoXCJzcGFuXCIsIHsgdGV4dDogXCJJIFx1MjAxNCBJZ25vcmVcIiB9KTtcbiAgICBoaW50LmNyZWF0ZUVsKFwic3BhblwiLCB7IHRleHQ6IFwiTyBcdTIwMTQgUmV2aWV3XCIgfSk7XG5cbiAgICBjb25zdCBhY3Rpb25zID0gdG9wQ2FyZC5jcmVhdGVFbChcImRpdlwiLCB7IGNsczogXCJub3RlLWRvY3Rvci1jYXJkLWFjdGlvbnNcIiB9KTtcblxuICAgIGNvbnN0IGNvbXBsZXRlQnRuID0gYWN0aW9ucy5jcmVhdGVFbChcImJ1dHRvblwiLCB7XG4gICAgICBjbHM6IFwibm90ZS1kb2N0b3ItdHJpYWdlLWJ0biBub3RlLWRvY3Rvci10cmlhZ2UtY29tcGxldGVcIixcbiAgICAgIHRleHQ6IHRoaXMuY29tcGxldGVMYWJlbCxcbiAgICB9KTtcbiAgICBpZiAoc3RhdHVzID09PSBcImNvbXBsZXRlXCIpIGNvbXBsZXRlQnRuLmFkZENsYXNzKFwibmQtYnRuLXNlbGVjdGVkLWdyZWVuXCIpO1xuICAgIGNvbXBsZXRlQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZWRvd25cIiwgZSA9PiBlLnByZXZlbnREZWZhdWx0KCkpO1xuICAgIGNvbXBsZXRlQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB0aGlzLmRvQ29tcGxldGUoaXRlbSwgY29tcGxldGVCdG4sIHRhZ0VsKSk7XG5cbiAgICBjb25zdCBpZ25vcmVCdG4gPSBhY3Rpb25zLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHtcbiAgICAgIGNsczogXCJub3RlLWRvY3Rvci10cmlhZ2UtYnRuIG5vdGUtZG9jdG9yLXRyaWFnZS1pbmNvbXBsZXRlXCIsXG4gICAgICB0ZXh0OiBcIklnbm9yZVwiLFxuICAgIH0pO1xuICAgIGlmIChzdGF0dXMgPT09IFwiaWdub3JlZFwiKSBpZ25vcmVCdG4uYWRkQ2xhc3MoXCJuZC1idG4tc2VsZWN0ZWQtcmVkXCIpO1xuICAgIGlnbm9yZUJ0bi5hZGRFdmVudExpc3RlbmVyKFwibW91c2Vkb3duXCIsIGUgPT4gZS5wcmV2ZW50RGVmYXVsdCgpKTtcbiAgICBpZ25vcmVCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHRoaXMuZG9JZ25vcmUoaXRlbSwgaWdub3JlQnRuKSk7XG5cbiAgICBjb25zdCByZXZpZXdCdG4gPSBhY3Rpb25zLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHtcbiAgICAgIGNsczogXCJub3RlLWRvY3Rvci10cmlhZ2UtYnRuIG5vdGUtZG9jdG9yLXRyaWFnZS1vcGVuXCIsXG4gICAgICB0ZXh0OiBcIlJldmlld1wiLFxuICAgIH0pO1xuICAgIHJldmlld0J0bi5hZGRFdmVudExpc3RlbmVyKFwibW91c2Vkb3duXCIsIGUgPT4gZS5wcmV2ZW50RGVmYXVsdCgpKTtcbiAgICByZXZpZXdCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHRoaXMuZG9PcGVuKGl0ZW0sIHJldmlld0J0bikpO1xuXG4gICAgcmV0dXJuIGNvbnRhaW5lcjtcbiAgfVxuXG4gIC8vIFx1MjUwMFx1MjUwMCBob3RrZXkgdHJpZ2dlciBoZWxwZXJzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG4gIHByaXZhdGUgdHJpZ2dlckN1cnJlbnRDb21wbGV0ZSgpIHtcbiAgICBjb25zdCBpdGVtID0gdGhpcy5jdXJyZW50SXRlbSgpO1xuICAgIGlmICghaXRlbSkgcmV0dXJuO1xuICAgIGNvbnN0IGJ0biAgPSB0aGlzLmNvbnRlbnRFbC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcIi5ub3RlLWRvY3Rvci10cmlhZ2UtY29tcGxldGVcIik7XG4gICAgY29uc3QgdGFnRWwgPSB0aGlzLmNvbnRlbnRFbC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcIi5ub3RlLWRvY3Rvci1jYXJkLXRhZ1wiKTtcbiAgICB0aGlzLmRvQ29tcGxldGUoaXRlbSwgYnRuID8/IHVuZGVmaW5lZCwgdGFnRWwgPz8gdW5kZWZpbmVkKTtcbiAgfVxuXG4gIHByaXZhdGUgdHJpZ2dlckN1cnJlbnRJZ25vcmUoKSB7XG4gICAgY29uc3QgaXRlbSA9IHRoaXMuY3VycmVudEl0ZW0oKTtcbiAgICBpZiAoIWl0ZW0pIHJldHVybjtcbiAgICBjb25zdCBidG4gPSB0aGlzLmNvbnRlbnRFbC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PihcIi5ub3RlLWRvY3Rvci10cmlhZ2UtaW5jb21wbGV0ZVwiKTtcbiAgICB0aGlzLmRvSWdub3JlKGl0ZW0sIGJ0biA/PyB1bmRlZmluZWQpO1xuICB9XG5cbiAgcHJpdmF0ZSB0cmlnZ2VyQ3VycmVudFJldmlldygpIHtcbiAgICBjb25zdCBpdGVtID0gdGhpcy5jdXJyZW50SXRlbSgpO1xuICAgIGlmICghaXRlbSkgcmV0dXJuO1xuICAgIGNvbnN0IGJ0biA9IHRoaXMuY29udGVudEVsLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KFwiLm5vdGUtZG9jdG9yLXRyaWFnZS1vcGVuXCIpO1xuICAgIHRoaXMuZG9PcGVuKGl0ZW0sIGJ0biA/PyB1bmRlZmluZWQpO1xuICB9XG5cbiAgLy8gXHUyNTAwXHUyNTAwIGFjdGlvbnMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbiAgcHJpdmF0ZSBkb0NvbXBsZXRlKGl0ZW06IENhcmRJdGVtLCBidG4/OiBIVE1MRWxlbWVudCwgdGFnRWw/OiBIVE1MRWxlbWVudCkge1xuICAgIGlmICh0aGlzLmJ1c3kpIHJldHVybjtcbiAgICB0aGlzLmJ1c3kgPSB0cnVlO1xuXG4gICAgY29uc3QgZmluaXNoID0gYXN5bmMgKCkgPT4ge1xuICAgICAgYXdhaXQgcmVtb3ZlVGFnKHRoaXMuYXBwLCBpdGVtLmZpbGUsIHRoaXMudGFnKTtcbiAgICAgIHRoaXMubm90ZVN0YXR1cy5zZXQoaXRlbS5maWxlLnBhdGgsIFwiY29tcGxldGVcIik7XG4gICAgICBpZiAodGhpcy5jaGVja0FsbEFjdGlvbmVkKCkpIHtcbiAgICAgICAgbmV3IE5vdGljZShcIlx1MjcxMyBUcmlhZ2UgY29tcGxldGUuXCIsIDMwMDApO1xuICAgICAgICB0aGlzLmNsb3NlKCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHRoaXMubmF2aWdhdGUoXCJmb3J3YXJkXCIpO1xuICAgIH07XG5cbiAgICBjb25zdCBzdHJpa2VBbmRGaW5pc2ggPSAoKSA9PiB7XG4gICAgICBpZiAoIXRhZ0VsKSB7IHZvaWQgZmluaXNoKCk7IHJldHVybjsgfVxuICAgICAgdGFnRWwuY2xhc3NMaXN0LmFkZChcIm5kLXN0cmlrZXRocm91Z2hcIik7XG4gICAgICB0YWdFbC5hZGRFdmVudExpc3RlbmVyKFwiYW5pbWF0aW9uZW5kXCIsICgpID0+IHZvaWQgZmluaXNoKCksIHsgb25jZTogdHJ1ZSB9KTtcbiAgICB9O1xuXG4gICAgaWYgKCFidG4pIHsgc3RyaWtlQW5kRmluaXNoKCk7IHJldHVybjsgfVxuICAgIGJ0bi5jbGFzc0xpc3QuYWRkKFwibmQtZmxhc2gtZ3JlZW5cIik7XG4gICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJhbmltYXRpb25lbmRcIiwgKCkgPT4ge1xuICAgICAgYnRuLmNsYXNzTGlzdC5yZW1vdmUoXCJuZC1mbGFzaC1ncmVlblwiKTtcbiAgICAgIHN0cmlrZUFuZEZpbmlzaCgpO1xuICAgIH0sIHsgb25jZTogdHJ1ZSB9KTtcbiAgfVxuXG4gIHByaXZhdGUgZG9JZ25vcmUoaXRlbTogQ2FyZEl0ZW0sIGJ0bj86IEhUTUxFbGVtZW50KSB7XG4gICAgaWYgKHRoaXMuYnVzeSkgcmV0dXJuO1xuICAgIHRoaXMuYnVzeSA9IHRydWU7XG5cbiAgICBjb25zdCBmaW5pc2ggPSAoKSA9PiB7XG4gICAgICB0aGlzLm5vdGVTdGF0dXMuc2V0KGl0ZW0uZmlsZS5wYXRoLCBcImlnbm9yZWRcIik7XG4gICAgICBpZiAodGhpcy5jaGVja0FsbEFjdGlvbmVkKCkpIHtcbiAgICAgICAgbmV3IE5vdGljZShcIlx1MjcxMyBUcmlhZ2UgY29tcGxldGUuXCIsIDMwMDApO1xuICAgICAgICB0aGlzLmNsb3NlKCk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHRoaXMubmF2aWdhdGUoXCJmb3J3YXJkXCIpO1xuICAgIH07XG5cbiAgICBpZiAoIWJ0bikgeyBmaW5pc2goKTsgcmV0dXJuOyB9XG4gICAgYnRuLmNsYXNzTGlzdC5hZGQoXCJuZC1mbGFzaC1yZWRcIik7XG4gICAgYnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJhbmltYXRpb25lbmRcIiwgKCkgPT4ge1xuICAgICAgYnRuLmNsYXNzTGlzdC5yZW1vdmUoXCJuZC1mbGFzaC1yZWRcIik7XG4gICAgICBmaW5pc2goKTtcbiAgICB9LCB7IG9uY2U6IHRydWUgfSk7XG4gIH1cblxuICBwcml2YXRlIGRvT3BlbihpdGVtOiBDYXJkSXRlbSwgYnRuPzogSFRNTEVsZW1lbnQpIHtcbiAgICBpZiAodGhpcy5idXN5KSByZXR1cm47XG4gICAgdGhpcy5idXN5ID0gdHJ1ZTtcblxuICAgIGNvbnN0IGZpbmlzaCA9ICgpID0+IHtcbiAgICAgIHRoaXMuY2xvc2UoKTtcbiAgICAgIHZvaWQgdGhpcy5hcHAud29ya3NwYWNlLmdldExlYWYoXCJ0YWJcIikub3BlbkZpbGUoaXRlbS5maWxlKTtcbiAgICB9O1xuXG4gICAgaWYgKCFidG4pIHsgZmluaXNoKCk7IHJldHVybjsgfVxuICAgIGJ0bi5jbGFzc0xpc3QuYWRkKFwibmQtZmxhc2gtYmx1ZVwiKTtcbiAgICBidG4uYWRkRXZlbnRMaXN0ZW5lcihcImFuaW1hdGlvbmVuZFwiLCAoKSA9PiB7XG4gICAgICBidG4uY2xhc3NMaXN0LnJlbW92ZShcIm5kLWZsYXNoLWJsdWVcIik7XG4gICAgICBmaW5pc2goKTtcbiAgICB9LCB7IG9uY2U6IHRydWUgfSk7XG4gIH1cblxuICBvbkNsb3NlKCkge1xuICAgIHRoaXMuY29udGVudEVsLmVtcHR5KCk7XG4gIH1cbn1cbiIsICJpbXBvcnQgeyBBcHAsIFRGaWxlIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2FyZEl0ZW0ge1xuICBmaWxlOiBURmlsZTtcbiAgcHJldmlldzogc3RyaW5nOyAvLyBmaXJzdCB+MzAwIGNoYXJzIG9mIGNvbnRlbnRcbn1cblxuZXhwb3J0IGludGVyZmFjZSBDYXJkU3RhY2tDYWxsYmFja3Mge1xuICBvbkNvbXBsZXRlOiAoZmlsZTogVEZpbGUpID0+IFByb21pc2U8dm9pZD47XG4gIG9uU2tpcDogKGZpbGU6IFRGaWxlKSA9PiB2b2lkO1xuICBvbk9wZW46IChmaWxlOiBURmlsZSkgPT4gdm9pZDtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGxvYWRDYW5kaWRhdGVzKGFwcDogQXBwLCB0YWc6IHN0cmluZywgcHJldmlld0NvdW50ID0gMyk6IFByb21pc2U8Q2FyZEl0ZW1bXT4ge1xuICBjb25zdCBmaWxlcyA9IGFwcC52YXVsdC5nZXRNYXJrZG93bkZpbGVzKCk7XG4gIGNvbnN0IGNhbmRpZGF0ZXM6IFRGaWxlW10gPSBbXTtcblxuICBmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcbiAgICBjb25zdCBjYWNoZSA9IGFwcC5tZXRhZGF0YUNhY2hlLmdldEZpbGVDYWNoZShmaWxlKTtcbiAgICBpZiAoY2FjaGU/LnRhZ3M/LnNvbWUoKHQpID0+IHQudGFnID09PSBgIyR7dGFnfWApKSB7XG4gICAgICBjYW5kaWRhdGVzLnB1c2goZmlsZSk7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgaXRlbXM6IENhcmRJdGVtW10gPSBbXTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBjYW5kaWRhdGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgZmlsZSA9IGNhbmRpZGF0ZXNbaV07XG4gICAgbGV0IHByZXZpZXcgPSBcIlwiO1xuICAgIGlmIChpIDwgcHJldmlld0NvdW50KSB7XG4gICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgYXBwLnZhdWx0LmNhY2hlZFJlYWQoZmlsZSk7XG4gICAgICBwcmV2aWV3ID0gY29udGVudFxuICAgICAgICAucmVwbGFjZSgvXi0tLVtcXHNcXFNdKj8tLS1cXG4/LywgXCJcIilcbiAgICAgICAgLnJlcGxhY2UoLyNcXHcrL2csIFwiXCIpXG4gICAgICAgIC50cmltKClcbiAgICAgICAgLnNsaWNlKDAsIDMwMCk7XG4gICAgfVxuICAgIGl0ZW1zLnB1c2goeyBmaWxlLCBwcmV2aWV3IH0pO1xuICB9XG5cbiAgcmV0dXJuIGl0ZW1zO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyQ2FyZFN0YWNrKFxuICBjb250YWluZXI6IEhUTUxFbGVtZW50LFxuICBpdGVtczogQ2FyZEl0ZW1bXSxcbiAgY2FsbGJhY2tzOiBDYXJkU3RhY2tDYWxsYmFja3MsXG4gIGFwcDogQXBwLFxuICB0YWc6IHN0cmluZ1xuKTogKCkgPT4gUHJvbWlzZTx2b2lkPiB7XG4gIGxldCBzdGFjayA9IFsuLi5pdGVtc107XG5cbiAgZnVuY3Rpb24gcmVuZGVyKCkge1xuICAgIGNvbnRhaW5lci5lbXB0eSgpO1xuXG4gICAgaWYgKHN0YWNrLmxlbmd0aCA9PT0gMCkge1xuICAgICAgY29udGFpbmVyLmNyZWF0ZUVsKFwiZGl2XCIsIHsgY2xzOiBcIm5vdGUtZG9jdG9yLXRyaWFnZS1kb25lXCIsIHRleHQ6IFwiXHUyNzEzIEFsbCBjYXVnaHQgdXAhXCIgfSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgY291bnRlciA9IGNvbnRhaW5lci5jcmVhdGVFbChcImRpdlwiLCB7IGNsczogXCJub3RlLWRvY3Rvci10cmlhZ2UtY291bnRlclwiIH0pO1xuICAgIGNvdW50ZXIuc2V0VGV4dChgJHtzdGFjay5sZW5ndGh9IG5vdGUke3N0YWNrLmxlbmd0aCAhPT0gMSA/IFwic1wiIDogXCJcIn0gcmVtYWluaW5nYCk7XG5cbiAgICBjb25zdCBzdGFja1dyYXAgPSBjb250YWluZXIuY3JlYXRlRWwoXCJkaXZcIiwgeyBjbHM6IFwibm90ZS1kb2N0b3Itc3RhY2std3JhcFwiIH0pO1xuXG4gICAgY29uc3QgdmlzaWJsZSA9IHN0YWNrLnNsaWNlKDAsIDMpO1xuICAgIHZpc2libGUuZm9yRWFjaCgoaXRlbSwgaSkgPT4ge1xuICAgICAgY29uc3QgY2FyZCA9IHN0YWNrV3JhcC5jcmVhdGVFbChcImRpdlwiLCB7IGNsczogYG5vdGUtZG9jdG9yLWNhcmQgbm90ZS1kb2N0b3ItY2FyZC1kZXB0aC0ke2l9YCB9KTtcbiAgICAgIGlmIChpID4gMCkgcmV0dXJuO1xuXG4gICAgICBjYXJkLmNyZWF0ZUVsKFwiZGl2XCIsIHsgY2xzOiBcIm5vdGUtZG9jdG9yLWNhcmQtdGl0bGVcIiwgdGV4dDogaXRlbS5maWxlLmJhc2VuYW1lIH0pO1xuXG4gICAgICBpZiAoaXRlbS5wcmV2aWV3KSB7XG4gICAgICAgIGNhcmQuY3JlYXRlRWwoXCJkaXZcIiwgeyBjbHM6IFwibm90ZS1kb2N0b3ItY2FyZC1wcmV2aWV3XCIsIHRleHQ6IGl0ZW0ucHJldmlldyB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZvaWQgYXBwLnZhdWx0LmNhY2hlZFJlYWQoaXRlbS5maWxlKS50aGVuKChjb250ZW50KSA9PiB7XG4gICAgICAgICAgY29uc3QgdGV4dCA9IGNvbnRlbnRcbiAgICAgICAgICAgIC5yZXBsYWNlKC9eLS0tW1xcc1xcU10qPy0tLVxcbj8vLCBcIlwiKVxuICAgICAgICAgICAgLnJlcGxhY2UoLyNcXHcrL2csIFwiXCIpXG4gICAgICAgICAgICAudHJpbSgpXG4gICAgICAgICAgICAuc2xpY2UoMCwgMzAwKTtcbiAgICAgICAgICBpdGVtLnByZXZpZXcgPSB0ZXh0O1xuICAgICAgICAgIGNvbnN0IHByZXZpZXdFbCA9IGNhcmQucXVlcnlTZWxlY3RvcihcIi5ub3RlLWRvY3Rvci1jYXJkLXByZXZpZXdcIik7XG4gICAgICAgICAgaWYgKCFwcmV2aWV3RWwpIHtcbiAgICAgICAgICAgIGNhcmQuY3JlYXRlRWwoXCJkaXZcIiwgeyBjbHM6IFwibm90ZS1kb2N0b3ItY2FyZC1wcmV2aWV3XCIsIHRleHQgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgYWN0aW9ucyA9IGNhcmQuY3JlYXRlRWwoXCJkaXZcIiwgeyBjbHM6IFwibm90ZS1kb2N0b3ItY2FyZC1hY3Rpb25zXCIgfSk7XG5cbiAgICAgIGNvbnN0IGNvbXBsZXRlQnRuID0gYWN0aW9ucy5jcmVhdGVFbChcImJ1dHRvblwiLCB7IGNsczogXCJub3RlLWRvY3Rvci10cmlhZ2UtYnRuIG5vdGUtZG9jdG9yLXRyaWFnZS1jb21wbGV0ZVwiLCB0ZXh0OiBcIlx1MjcxMyBDb21wbGV0ZVwiIH0pO1xuICAgICAgY29tcGxldGVCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcbiAgICAgICAgdm9pZCBjYWxsYmFja3Mub25Db21wbGV0ZShpdGVtLmZpbGUpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIHN0YWNrLnNoaWZ0KCk7XG4gICAgICAgICAgcmVuZGVyKCk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHNraXBCdG4gPSBhY3Rpb25zLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgY2xzOiBcIm5vdGUtZG9jdG9yLXRyaWFnZS1idG4gbm90ZS1kb2N0b3ItdHJpYWdlLXNraXBcIiwgdGV4dDogXCJcdTIxOTIgU2tpcFwiIH0pO1xuICAgICAgc2tpcEJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgICBjYWxsYmFja3Mub25Ta2lwKGl0ZW0uZmlsZSk7XG4gICAgICAgIHN0YWNrLnB1c2goc3RhY2suc2hpZnQoKSEpO1xuICAgICAgICByZW5kZXIoKTtcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBvcGVuQnRuID0gYWN0aW9ucy5jcmVhdGVFbChcImJ1dHRvblwiLCB7IGNsczogXCJub3RlLWRvY3Rvci10cmlhZ2UtYnRuIG5vdGUtZG9jdG9yLXRyaWFnZS1vcGVuXCIsIHRleHQ6IFwiXHUyMTk3IE9wZW5cIiB9KTtcbiAgICAgIG9wZW5CdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IGNhbGxiYWNrcy5vbk9wZW4oaXRlbS5maWxlKSk7XG4gICAgfSk7XG4gIH1cblxuICByZW5kZXIoKTtcblxuICByZXR1cm4gYXN5bmMgKCkgPT4ge1xuICAgIGNvbnN0IGZyZXNoID0gYXdhaXQgbG9hZENhbmRpZGF0ZXMoYXBwLCB0YWcpO1xuICAgIGNvbnN0IGZyZXNoUGF0aHMgPSBuZXcgU2V0KGZyZXNoLm1hcCgoaSkgPT4gaS5maWxlLnBhdGgpKTtcbiAgICBzdGFjayA9IHN0YWNrLmZpbHRlcigoaSkgPT4gZnJlc2hQYXRocy5oYXMoaS5maWxlLnBhdGgpKTtcbiAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgZnJlc2gpIHtcbiAgICAgIGlmICghc3RhY2suc29tZSgocykgPT4gcy5maWxlLnBhdGggPT09IGl0ZW0uZmlsZS5wYXRoKSkge1xuICAgICAgICBzdGFjay5wdXNoKGl0ZW0pO1xuICAgICAgfVxuICAgIH1cbiAgICByZW5kZXIoKTtcbiAgfTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLElBQUFBLG1CQUE4Qjs7O0FDQTlCLHNCQUErQztBQVN4QyxJQUFNLG1CQUF1QztBQUFBLEVBQ2xELG9CQUFvQjtBQUFBLEVBQ3BCLGNBQWM7QUFBQSxFQUNkLFdBQVc7QUFDYjtBQUVPLElBQU0sdUJBQU4sY0FBbUMsaUNBQWlCO0FBQUEsRUFHekQsWUFBWSxLQUFVLFFBQTBCO0FBQzlDLFVBQU0sS0FBSyxNQUFNO0FBQ2pCLFNBQUssU0FBUztBQUFBLEVBQ2hCO0FBQUEsRUFFQSxVQUFnQjtBQUNkLFVBQU0sRUFBRSxZQUFZLElBQUk7QUFDeEIsZ0JBQVksTUFBTTtBQUVsQixRQUFJLHdCQUFRLFdBQVcsRUFDcEIsUUFBUSxhQUFhLEVBQ3JCLFFBQVEsaUVBQWlFLEVBQ3pFO0FBQUEsTUFBUSxVQUNQLEtBQ0csZUFBZSxZQUFZLEVBQzNCLFNBQVMsS0FBSyxPQUFPLFNBQVMsU0FBUyxFQUN2QyxTQUFTLE9BQU8sVUFBVTtBQUN6QixjQUFNLFlBQVksTUFBTSxRQUFRLE9BQU8sRUFBRSxFQUFFLEtBQUssS0FBSztBQUNyRCxhQUFLLE9BQU8sU0FBUyxZQUFZO0FBQ2pDLGNBQU0sS0FBSyxPQUFPLGFBQWE7QUFBQSxNQUNqQyxDQUFDO0FBQUEsSUFDTDtBQUVGLFFBQUksd0JBQVEsV0FBVyxFQUNwQixRQUFRLFdBQVcsRUFDbkIsUUFBUSxvRkFBb0YsRUFDNUY7QUFBQSxNQUFVLFlBQ1QsT0FDRyxTQUFTLEtBQUssT0FBTyxTQUFTLGtCQUFrQixFQUNo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QUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBc1BwQixNQUFJLEtBQUssWUFBWSxLQUFLO0FBQzVCOyIsCiAgIm5hbWVzIjogWyJpbXBvcnRfb2JzaWRpYW4iLCAiaW1wb3J0X29ic2lkaWFuIiwgImltcG9ydF9vYnNpZGlhbiJdCn0K
