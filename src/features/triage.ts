import { App, MarkdownRenderer, Modal, Notice } from "obsidian";
import { INCOMPLETE_TAG, removeTag } from "../shared/tags";
import { loadCandidates, CardItem } from "../shared/cardStack";

type NoteStatus = "pending" | "complete" | "ignored";

export class TriageModal extends Modal {
  private items: CardItem[] = [];
  private noteStatus = new Map<string, NoteStatus>();
  private currentIdx = 0;
  private busy = false;

  constructor(app: App, private readonly tag: string = INCOMPLETE_TAG) {
    super(app);
  }

  private get completeLabel(): string {
    return this.tag === INCOMPLETE_TAG ? "Complete" : "Heal";
  }

  async onOpen() {
    this.modalEl.addClass("note-doctor-triage-modal");
    this.titleEl.setText("Note Doctor");

    // Subtitle sits between the modal title bar and the content area —
    // inserted as a sibling of titleEl so it never participates in slide animations.
    const subtitle = this.containerEl.ownerDocument.createElement("div");
    subtitle.className = "note-doctor-triage-subtitle";
    subtitle.textContent = `Quickly review notes tagged #${this.tag}`;
    this.titleEl.insertAdjacentElement("afterend", subtitle);

    this.scope.register([], "u",      () => { this.triggerCurrentComplete(); return false; });
    this.scope.register([], "i",      () => { this.triggerCurrentIgnore();   return false; });
    this.scope.register([], "o",      () => { this.triggerCurrentReview();   return false; });
    this.scope.register([], "Enter",  () => { this.triggerCurrentReview();   return false; });
    this.scope.register([], "Escape", () => { this.close();                  return false; });

    const loaded = await loadCandidates(this.app, this.tag);
    if (loaded.length === 0) {
      this.contentEl.createEl("p", { cls: "note-doctor-triage-done", text: "✓ No notes to review." });
      return;
    }

    this.items = loaded;
    for (const item of this.items) this.noteStatus.set(item.file.path, "pending");
    this.renderCard("none");
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private currentItem(): CardItem | null {
    if (!this.items.length) return null;
    return this.items[Math.min(this.currentIdx, this.items.length - 1)];
  }

  private navigate(direction: "forward" | "backward") {
    if (!this.items.length) return;
    this.currentIdx = direction === "forward"
      ? (this.currentIdx + 1) % this.items.length
      : (this.currentIdx - 1 + this.items.length) % this.items.length;
    this.renderCard(direction);
  }

  private checkAllActioned(): boolean {
    return this.items.every(i => this.noteStatus.get(i.file.path) !== "pending");
  }

  // ── render ────────────────────────────────────────────────────────────────

  private renderCard(direction: "forward" | "backward" | "none") {
    if (!this.items.length) {
      this.contentEl.empty();
      this.close();
      new Notice("✓ All notes triaged.", 3000);
      return;
    }

    if (this.currentIdx >= this.items.length) this.currentIdx = 0;
    const item = this.items[this.currentIdx];

    const newContainer = this.buildContainer(item);
    const viewport = this.contentEl.querySelector<HTMLElement>(".note-doctor-slide-viewport");

    // ── First render ──────────────────────────────────────────────────────
    if (!viewport || direction === "none") {
      this.contentEl.empty();
      const vp = this.contentEl.createEl("div", { cls: "note-doctor-slide-viewport" });
      vp.appendChild(newContainer);
      this.busy = false;
      return;
    }

    // ── Animated render ───────────────────────────────────────────────────
    const oldContainer = viewport.querySelector<HTMLElement>(".note-doctor-card-container");
    if (!oldContainer) {
      viewport.innerHTML = "";
      viewport.appendChild(newContainer);
      this.busy = false;
      return;
    }

    viewport.style.setProperty("--nd-h", `${viewport.getBoundingClientRect().height}px`);
    viewport.classList.add("nd-height-locked");

    const outClass = direction === "forward" ? "nd-slide-out-left"  : "nd-slide-out-right";
    const inClass  = direction === "forward" ? "nd-slide-in-right"  : "nd-slide-in-left";

    viewport.classList.add("nd-transitioning");
    oldContainer.classList.add(outClass);
    newContainer.classList.add(inClass);
    viewport.appendChild(newContainer);

    const onDone = (e: Event) => {
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

  private buildContainer(item: CardItem): HTMLElement {
    const container = this.containerEl.ownerDocument.createElement("div");
    container.className = "note-doctor-card-container";
    const status = this.noteStatus.get(item.file.path) ?? "pending";

    // ── Navigation bar ────────────────────────────────────────────────────
    const navBar = container.createEl("div", { cls: "note-doctor-nav-bar" });

    const prevBtn = navBar.createEl("button", { cls: "note-doctor-nav-btn", text: "← Previous" });
    prevBtn.addEventListener("mousedown", e => e.preventDefault());
    prevBtn.addEventListener("click", () => this.navigate("backward"));

    navBar.createEl("span", {
      cls: "note-doctor-nav-counter",
      text: `${this.currentIdx + 1} / ${this.items.length}`,
    });

    const nextBtn = navBar.createEl("button", { cls: "note-doctor-nav-btn", text: "Next →" });
    nextBtn.addEventListener("mousedown", e => e.preventDefault());
    nextBtn.addEventListener("click", () => this.navigate("forward"));

    // ── Card stack ────────────────────────────────────────────────────────
    const stackWrap = container.createEl("div", { cls: "note-doctor-stack-wrap" });

    stackWrap.createEl("div", { cls: "note-doctor-card note-doctor-card-depth-2" });
    stackWrap.createEl("div", { cls: "note-doctor-card note-doctor-card-depth-1" });

    const topCard = stackWrap.createEl("div", { cls: "note-doctor-card note-doctor-card-depth-0" });

    topCard.createEl("div", { cls: "note-doctor-card-title", text: item.file.basename });

    // Tag chip — shows struck-through when note is already completed
    const tagEl = topCard.createEl("div", {
      cls: "note-doctor-card-tag",
      text: `#${this.tag}`,
    });
    if (status === "complete") tagEl.addClass("nd-tag-struck");

    const previewEl = topCard.createEl("div", { cls: "note-doctor-card-preview" });
    if (item.preview) {
      void MarkdownRenderer.render(this.app, item.preview, previewEl, item.file.path, this);
    } else {
      void this.app.vault.cachedRead(item.file).then(async content => {
        const text = content
          .replace(/^---[\s\S]*?---\n?/, "")
          .replace(/#\w+/g, "")
          .trim()
          .slice(0, 300);
        item.preview = text;
        await MarkdownRenderer.render(this.app, text, previewEl, item.file.path, this);
      });
    }

    const hint = topCard.createEl("div", { cls: "note-doctor-card-hint" });
    hint.createEl("span", { text: `U — ${this.completeLabel}` });
    hint.createEl("span", { text: "I — Ignore" });
    hint.createEl("span", { text: "O — Review" });

    const actions = topCard.createEl("div", { cls: "note-doctor-card-actions" });

    const completeBtn = actions.createEl("button", {
      cls: "note-doctor-triage-btn note-doctor-triage-complete",
      text: this.completeLabel,
    });
    if (status === "complete") completeBtn.addClass("nd-btn-selected-green");
    completeBtn.addEventListener("mousedown", e => e.preventDefault());
    completeBtn.addEventListener("click", () => this.doComplete(item, completeBtn, tagEl));

    const ignoreBtn = actions.createEl("button", {
      cls: "note-doctor-triage-btn note-doctor-triage-incomplete",
      text: "Ignore",
    });
    if (status === "ignored") ignoreBtn.addClass("nd-btn-selected-red");
    ignoreBtn.addEventListener("mousedown", e => e.preventDefault());
    ignoreBtn.addEventListener("click", () => this.doIgnore(item, ignoreBtn));

    const reviewBtn = actions.createEl("button", {
      cls: "note-doctor-triage-btn note-doctor-triage-open",
      text: "Review",
    });
    reviewBtn.addEventListener("mousedown", e => e.preventDefault());
    reviewBtn.addEventListener("click", () => this.doOpen(item, reviewBtn));

    return container;
  }

  // ── hotkey trigger helpers ────────────────────────────────────────────────

  private triggerCurrentComplete() {
    const item = this.currentItem();
    if (!item) return;
    const btn  = this.contentEl.querySelector<HTMLElement>(".note-doctor-triage-complete");
    const tagEl = this.contentEl.querySelector<HTMLElement>(".note-doctor-card-tag");
    this.doComplete(item, btn ?? undefined, tagEl ?? undefined);
  }

  private triggerCurrentIgnore() {
    const item = this.currentItem();
    if (!item) return;
    const btn = this.contentEl.querySelector<HTMLElement>(".note-doctor-triage-incomplete");
    this.doIgnore(item, btn ?? undefined);
  }

  private triggerCurrentReview() {
    const item = this.currentItem();
    if (!item) return;
    const btn = this.contentEl.querySelector<HTMLElement>(".note-doctor-triage-open");
    this.doOpen(item, btn ?? undefined);
  }

  // ── actions ───────────────────────────────────────────────────────────────

  private doComplete(item: CardItem, btn?: HTMLElement, tagEl?: HTMLElement) {
    if (this.busy) return;
    this.busy = true;

    const finish = async () => {
      await removeTag(this.app, item.file, this.tag);
      this.noteStatus.set(item.file.path, "complete");
      if (this.checkAllActioned()) {
        new Notice("✓ Triage complete.", 3000);
        this.close();
        return;
      }
      this.navigate("forward");
    };

    const strikeAndFinish = () => {
      if (!tagEl) { void finish(); return; }
      tagEl.classList.add("nd-strikethrough");
      tagEl.addEventListener("animationend", () => void finish(), { once: true });
    };

    if (!btn) { strikeAndFinish(); return; }
    btn.classList.add("nd-flash-green");
    btn.addEventListener("animationend", () => {
      btn.classList.remove("nd-flash-green");
      strikeAndFinish();
    }, { once: true });
  }

  private doIgnore(item: CardItem, btn?: HTMLElement) {
    if (this.busy) return;
    this.busy = true;

    const finish = () => {
      this.noteStatus.set(item.file.path, "ignored");
      if (this.checkAllActioned()) {
        new Notice("✓ Triage complete.", 3000);
        this.close();
        return;
      }
      this.navigate("forward");
    };

    if (!btn) { finish(); return; }
    btn.classList.add("nd-flash-red");
    btn.addEventListener("animationend", () => {
      btn.classList.remove("nd-flash-red");
      finish();
    }, { once: true });
  }

  private doOpen(item: CardItem, btn?: HTMLElement) {
    if (this.busy) return;
    this.busy = true;

    const finish = () => {
      this.close();
      void this.app.workspace.getLeaf("tab").openFile(item.file);
    };

    if (!btn) { finish(); return; }
    btn.classList.add("nd-flash-blue");
    btn.addEventListener("animationend", () => {
      btn.classList.remove("nd-flash-blue");
      finish();
    }, { once: true });
  }

  onClose() {
    this.contentEl.empty();
  }
}
