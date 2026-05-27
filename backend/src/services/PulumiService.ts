import fs from "node:fs/promises";
import path from "node:path";
import { executeCommandTool } from "@/tools/terminal/commandUtils.js";
import { safetyManager } from "@/safety/safetyContext.js";

export class PulumiService {
    private workspaceDir: string;

    constructor(projectName: string = "nexusflow-deployment") {
        // Read the workspace root (CodeSandBox) from our safety settings
        const context = safetyManager.getContext();
        this.workspaceDir = path.resolve(context.workspaceRoot, projectName);
    }

    private async runCommand(cmd: string): Promise<string> {
        const result = await executeCommandTool.invoke({
            command: `cd "${this.workspaceDir}" && ${cmd}`
        });
        return result;
    }

    public async deploy(): Promise<{ success: boolean; logs: string }> {
        try {
            // 1. Force Local Mode (fixes your auth token issue permanently)
            console.log("🔐 Forcing Pulumi to use Local State Backend...");
            await this.runCommand("pulumi login --local");

            // 2. Install dependencies (required for TypeScript Pulumi)
            console.log("📦 Installing NPM dependencies...");
            await this.runCommand("npm install");

            console.log("🔄 Initializing Pulumi Stack...");
            await this.runCommand("pulumi stack init dev").catch(() => { });

            console.log("🚀 Running Pulumi Up...");
            const output = await this.runCommand("pulumi up --yes --stack dev");

            const isSuccess = !output.includes("error:") && !output.includes("failed");

            return { success: isSuccess, logs: output };
        } catch (error: any) {
            return { success: false, logs: error.message };
        }
    }
}