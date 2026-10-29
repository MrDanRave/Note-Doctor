import { App, PluginSettingTab, Setting } from "obsidian";
import type NoteDoctorPlugin from "./main";

export const FALLBACK_TAG = "INCOMPLETE";

export interface NoteDoctorSettings {
  enableCompleteNote: boolean;
  enableTriage: boolean;
  /** All plaster tags the Nurse holds (stored without #). */
  plasterTags: string[];
  /** Index into plasterTags of the active plaster. */
  activePlaster: number;
  /** @deprecated v1.1.x single-tag setting — migrated into plasterTags on load. */
  triageTag?: string;
}

export const DEFAULT_SETTINGS: NoteDoctorSettings = {
  enableCompleteNote: true,
  enableTriage: true,
  plasterTags: [FALLBACK_TAG],
  activePlaster: 0,
};

export function sanitizeTag(value: string): string {
  return value.replace(/^#+/, "").trim();
}

export class NoteDoctorSettingTab extends PluginSettingTab {
  plugin: NoteDoctorPlugin;

  constructor(app: App, plugin: NoteDoctorPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;

    new Setting(containerEl)
      .setName("Plaster Tags")
      .setDesc("Tags used to mark notes for the Doctor's review. Enter without #. Select which plaster is active.")
      .addExtraButton(btn =>
        btn
          .setIcon("plus")
          .setTooltip("Add plaster tag")
          .onClick(async () => {
            s.plasterTags.push("");
            await this.plugin.saveSettings();
            this.display();
            // Focus the freshly added input.
            const inputs = containerEl.querySelectorAll<HTMLInputElement>(".nd-plaster-row input[type=text]");
            inputs[inputs.length - 1]?.focus();
          })
      );

    s.plasterTags.forEach((tag, idx) => {
      const row = new Setting(containerEl).setClass("nd-plaster-row");
      row.infoEl.remove();

      const radio = row.controlEl.createEl("input", {
        type: "radio",
        cls: "nd-plaster-radio",
        attr: { name: "nd-active-plaster", "aria-label": "Set as active plaster" },
      });
      radio.checked = idx === s.activePlaster;
      radio.addEventListener("change", async () => {
        if (!radio.checked) return;
        s.activePlaster = idx;
        await this.plugin.saveSettings();
      });

      row.addText(text =>
        text
          .setPlaceholder(FALLBACK_TAG)
          .setValue(tag)
          .onChange(async (value) => {
            s.plasterTags[idx] = sanitizeTag(value);
            await this.plugin.saveSettings();
          })
      );

      if (s.plasterTags.length > 1) {
        row.addExtraButton(btn =>
          btn
            .setIcon("trash")
            .setTooltip("Delete plaster tag")
            .onClick(async () => {
              s.plasterTags.splice(idx, 1);
              if (s.activePlaster === idx) s.activePlaster = 0;
              else if (s.activePlaster > idx) s.activePlaster--;
              await this.plugin.saveSettings();
              this.display();
            })
        );
      }
    });

    new Setting(containerEl)
      .setName("The Nurse")
      .setDesc("Auto-tags new notes with the active plaster tag. Applies, removes and cycles plasters via hotkey.")
      .addToggle(toggle =>
        toggle
          .setValue(s.enableCompleteNote)
          .onChange(async (value) => {
            s.enableCompleteNote = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Patient Queue")
      .setDesc("Call the Doctor to review all notes with the active plaster tag.")
      .addToggle(toggle =>
        toggle
          .setValue(s.enableTriage)
          .onChange(async (value) => {
            s.enableTriage = value;
            await this.plugin.saveSettings();
          })
      );
  }

  hide(): void {
    // Drop blank rows the user added but never filled in.
    const s = this.plugin.settings;
    const active = s.plasterTags[s.activePlaster];
    const cleaned = s.plasterTags.filter(t => t !== "");
    if (cleaned.length !== s.plasterTags.length) {
      s.plasterTags = cleaned.length ? cleaned : [FALLBACK_TAG];
      const newIdx = active ? s.plasterTags.indexOf(active) : -1;
      s.activePlaster = newIdx >= 0 ? newIdx : 0;
      void this.plugin.saveSettings();
    }
  }
}
