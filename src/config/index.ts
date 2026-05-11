import fs from "node:fs/promises";
import path from "node:path";

export interface AllowlistRule {
  path?: string;
  command?: string;
  operation: "read" | "write" | "delete" | "execute" | "all";
  addedAt: string; // Stored as ISO string in JSON
}

export interface Preferences {
  confirmationMode: "manual" | "auto";
}

export class SettingManager {
  private _version: string = "1.0.0";
  private _allowList: { files: AllowlistRule[]; commands: AllowlistRule[] } = { files: [], commands: [] };
  private _preferences: Preferences = { confirmationMode: "manual" };
  private configPath: string;
  private _backupDir: string = path.resolve(process.cwd(), ".backups");

  constructor() {
    this.configPath = path.resolve(process.cwd(), ".agentic-settings.json");
  }

  // --- PERSISTENCE ---
  async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.configPath, "utf-8");
      const parsed = JSON.parse(data);
      this._version = parsed.version || this._version;
      this._allowList = parsed.allowList || this._allowList;
      this._preferences = parsed.preferences || this._preferences;
      this._backupDir = parsed.backupDir || this._backupDir;
    } catch (err: any) {
      if (err.code !== "ENOENT") {
        console.warn(`Failed to load settings from ${this.configPath}: ${err.message}`);
      }
      // If file doesn't exist, we just use defaults.
    }
  }

  async save(): Promise<void> {
    const data = {
      version: this._version,
      backupDir: this._backupDir,
      allowList: this._allowList,
      preferences: this._preferences,
    };
    await fs.writeFile(this.configPath, JSON.stringify(data, null, 2), "utf-8");
  }

  // --- ALLOWLIST MANAGEMENT ---
  get allowListFiles() { return this._allowList.files; }

  async addFileRule(rule: Omit<AllowlistRule, "addedAt">): Promise<void> {
    if (!rule.path) throw new Error("File rule must include a path");
    this._allowList.files.push({ ...rule, addedAt: new Date().toISOString() });
    await this.save();
  }

  // --- PREFERENCES ---
  get confirmationMode() { return this._preferences.confirmationMode; }

  async setConfirmationMode(mode: "manual" | "auto"): Promise<void> {
    this._preferences.confirmationMode = mode;
    await this.save();
  }

  // --- BACKUP DIRECTORY ---
  get backupDir() { return this._backupDir; }
  async setbackupDir(path:string): Promise<void> {
    this._backupDir = path;
    await this.save();
  }

}

export const settings = new SettingManager();
