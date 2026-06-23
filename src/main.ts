import { Plugin, TFile } from "obsidian";
import { DEFAULT_SETTINGS, NoteDoctorSettings, NoteDoctorSettingTab } from "./settings";
import { registerCompleteNoteCommands } from "./features/completeNote";
import { TriageModal } from "./features/triage";

export default class NoteDoctorPlugin extends Plugin {
  settings: NoteDoctorSettings;
  private pendingTag = new Set<string>();

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new NoteDoctorSettingTab(this.app, this));

    injectTriageStyles(this.app.workspace.containerEl.ownerDocument);

    if (this.settings.enableCompleteNote) {
      registerCompleteNoteCommands(this.app, this.settings.triageTag, (cmd) =>
        this.addCommand(cmd as Parameters<Plugin["addCommand"]>[0])
      );

      // On create: mark the file as pending.
      // 60 s ctime window is generous enough for slow/older hardware.
      this.registerEvent(
        this.app.vault.on("create", (file) => {
          if (!(file instanceof TFile) || file.extension !== "md") return;
          if (Date.now() - file.stat.ctime > 60_000) return;
          this.pendingTag.add(file.path);
        })
      );

      // On file-open: by this point every template plugin has finished
      // writing, so we append the tag to whatever content is already there.
      this.registerEvent(
        this.app.workspace.on("file-open", async (file) => {
          if (file instanceof TFile) await this.applyPendingTag(file);
        })
      );
    }

    if (this.settings.enableTriage) {
      this.addCommand({
        id: "open-triage",
        name: "Open Patient Queue",
        callback: () => new TriageModal(this.app, this.settings.triageTag).open(),
      });
    }
  }

  onunload() {}

  private async applyPendingTag(file: TFile) {
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
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<NoteDoctorSettings>);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

function injectTriageStyles(doc: Document) {
  if (doc.getElementById("note-doctor-triage-styles")) return;
  const style = doc.createElement("style");
  style.id = "note-doctor-triage-styles";
  style.textContent = `
    /* ── Modal shell ─────────────────────────────────────────────────── */
    .note-doctor-triage-modal {
      width: 480px;
    }
    .note-doctor-triage-modal .modal-content {
      display: flex;
      flex-direction: column;
      padding: 16px;
      overflow: hidden;
    }

    /* ── Subtitle — lives between titleEl and contentEl ──────────────── */
    .note-doctor-triage-subtitle {
      padding: 0 0 10px 0;
      font-size: 12px;
      color: var(--text-muted);
    }

    /* ── Slide viewport ──────────────────────────────────────────────── */
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

    /* ── Card container (one per render, slides in/out) ──────────────── */
    .note-doctor-card-container {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    /* ── Navigation bar ──────────────────────────────────────────────── */
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

    /* ── "No notes" state ────────────────────────────────────────────── */
    .note-doctor-triage-done {
      text-align: center;
      color: var(--text-muted);
      margin-top: 40px;
      font-size: 16px;
    }

    /* ── Card stack ──────────────────────────────────────────────────── */
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

    /* ── Hotkey hints ─────────────────────────────────────────────────── */
    .note-doctor-card-hint {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: var(--text-faint);
      margin-top: auto;
      padding: 0 2px;
    }

    /* ── Action buttons ──────────────────────────────────────────────── */
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

    /* ── Button flash animations ─────────────────────────────────────── */
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

    /* ── Tag chip ────────────────────────────────────────────────────── */
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
    /* Animated strikethrough — line draws left to right */
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

    /* ── Nurse notice strikethrough ──────────────────────────────────── */
    .nd-nurse-strike-tag {
      text-decoration: line-through;
      text-decoration-color: currentColor;
    }

    /* ── Card slide animations ───────────────────────────────────────── */
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
