import fs from "node:fs/promises";
import path from "node:path";
import type { AllowlistRule, NexusConfig } from "@/types/index.js";

const DEFAULT_CONFIG: NexusConfig = {
  version: "1.1.0",
  preferences: { confirmationMode: "manual" },
  safety: {
    projectRoot: process.cwd(),
    workspaceRoot: path.resolve(process.cwd(), "CodeSandBox"),
    allowedPaths: ["CodeSandBox"],
    blockedPatterns: ["node_modules", "\\.git", "dist", "build"],
    blockedCommands: ["rm -rf", "sudo", "shutdown", "reboot", "kill", "passwd", "format"],
    readOnlyFiles: ["package.json", "package-lock.json"],
    notAllowedExtensions: [".exe", ".sh", ".bat", ".cmd"],
  },
  allowList: { files: [], commands: [], mcp: [] },
};

export class ConfigManager {
  public config: NexusConfig;
  private configPath: string;

  constructor() {
    this.configPath = path.resolve(import.meta.dirname, ".nexusflow-settings.json");
    this.config = { ...DEFAULT_CONFIG };
  }

  async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.configPath, "utf-8");
      const parsed = JSON.parse(data);
      // Merge loaded config with defaults to ensure new fields are populated
      this.config = {
        ...DEFAULT_CONFIG,
        ...parsed,
        safety: { ...DEFAULT_CONFIG.safety, ...(parsed.safety || {}) },
        allowList: { ...DEFAULT_CONFIG.allowList, ...(parsed.allowList || {}) }
      };
    } catch (err: any) {
      if (err.code !== "ENOENT") {
        console.warn(`Failed to load config: ${err.message}`);
      }
    }
  }

  async save(): Promise<void> {
    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2), "utf-8");
  }

  // --- ALLOWLIST MANAGEMENT ---
  async addRule(category: "files" | "commands" | "mcp", rule: Omit<AllowlistRule, "addedAt">): Promise<void> {
    // Avoid duplicates
    const exists = this.config.allowList[category].some(
      r => r.target === rule.target && r.operation === rule.operation
    );
    if (exists) return;

    this.config.allowList[category].push({ ...rule, addedAt: new Date().toISOString() });
    await this.save();
  }

  async setConfirmationMode(mode: "manual" | "auto"): Promise<void> {
    this.config.preferences.confirmationMode = mode;
    await this.save();
  }
}

export const configManager = new ConfigManager();