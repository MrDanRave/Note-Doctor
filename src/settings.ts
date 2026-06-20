import { App, PluginSettingTab, Setting } from "obsidian";
import type NoteDoctorPlugin from "./main";

export interface NoteDoctorSettings {
  enableCompleteNote: boolean;
  enableTriage: boolean;
  triageTag: string;
}

export const DEFAULT_SETTINGS: NoteDoctorSettings = {
  enableCompleteNote: true,
  enableTriage: true,
  triageTag: "INCOMPLETE",
};

export class NoteDoctorSettingTab extends PluginSettingTab {
  plugin: NoteDoctorPlugin;

  constructor(app: App, plugin: NoteDoctorPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName("Note Doctor Settings").setHeading();

    new Setting(containerEl)
      .setName("Plaster Tag")
      .setDesc("Tag used to mark notes for the Doctor's review. Enter without #")
      .addText(text =>
        text
          .setPlaceholder("INCOMPLETE")
          .setValue(this.plugin.settings.triageTag)
          .onChange(async (value) => {
            const sanitized = value.replace(/^#+/, "").trim() || "INCOMPLETE";
            this.plugin.settings.triageTag = sanitized;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("The Nurse")
      .setDesc("Auto-tags new notes with the plaster tag. Removes plasters when called via hotkey.")
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.enableCompleteNote)
          .onChange(async (value) => {
            this.plugin.settings.enableCompleteNote = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Patient Queue")
      .setDesc("Call the Doctor to review all notes with the plaster tag.")
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.enableTriage)
          .onChange(async (value) => {
            this.plugin.settings.enableTriage = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
