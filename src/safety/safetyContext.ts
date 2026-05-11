import fs from "node:fs/promises";
import path from "node:path";

export interface SafetyContext {
    projectRoot: string;
    allowedPaths: string[];
    blockedPatterns: string[];
    blockedCommands: string[];
    requiredConfirmation: boolean;
    readOnlyFiles: string[];
    notAllowedExtensions: string[];
}

const DEFAULT_CONTEXT: SafetyContext = {
    projectRoot: process.cwd(),
    allowedPaths: ["CodeSandBox"], // "." means allow all inside project root. Change to ["CodeSandBox"] if strictly isolated.
    blockedPatterns: ["node_modules", "\\.git", "dist", "build"],
    blockedCommands: ["rm -rf", "sudo", "shutdown", "reboot", "kill", "passwd", "format"],
    requiredConfirmation: true,
    readOnlyFiles: ["package.json", "package-lock.json"],
    notAllowedExtensions: [".exe", ".sh", ".bat", ".cmd"],
};

export class SafetyContextManager {
    private context: SafetyContext;
    private readonly configPath: string;

    constructor() {
        this.context = { ...DEFAULT_CONTEXT };
        this.configPath = path.resolve(process.cwd(), ".agentic-safety.json");
    }

    /**
     * Loads the safety context from the local JSON file.
     */
    async load(): Promise<void> {
        try {
            const data = await fs.readFile(this.configPath, "utf-8");
            const parsed = JSON.parse(data);
            this.context = { ...this.context, ...parsed };
        } catch (err: any) {
            if (err.code !== "ENOENT") {
                console.warn(`Failed to load safety config, using defaults: ${err.message}`);
            }
        }
    }

    /**
     * Saves the current safety context to the local JSON file.
     */
    async save(): Promise<void> {
        await fs.writeFile(this.configPath, JSON.stringify(this.context, null, 2), "utf-8");
    }

    getContext(): SafetyContext {
        return this.context;
    }

    // Example Helper to update allow paths dynamically
    async addAllowedPath(dirName: string): Promise<void> {
        if (!this.context.allowedPaths.includes(dirName)) {
            this.context.allowedPaths.push(dirName);
            await this.save();
        }
    }

    // Example Helper to add blocked patterns dynamically
    async addBlockedPattern(pattern: string): Promise<void> {
        if (!this.context.blockedPatterns.includes(pattern)) {
            this.context.blockedPatterns.push(pattern);
            await this.save();
        }
    }
}

// Export a singleton instance
export const safetyManager = new SafetyContextManager();