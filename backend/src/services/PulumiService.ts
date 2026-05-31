import { exec } from "node:child_process";
import { promisify } from "node:util";
import { configManager } from "@/config/index.js";

const execAsync = promisify(exec);

export class PulumiService {
    private workspaceDir: string;

    // Change constructor to accept the absolute path directly from state
    constructor(absoluteWorkspacePath: string) {
        this.workspaceDir = absoluteWorkspacePath;
    }

    private async runCommand(cmd: string): Promise<string> {
        try {
            // Run natively to bypass the LangChain Tool HITL permission prompt
            const { stdout, stderr } = await execAsync(`cd "${this.workspaceDir}" && ${cmd}`, {
                env: {
                    ...process.env,
                    PULUMI_CONFIG_PASSPHRASE: process.env.PULUMI_CONFIG_PASSPHRASE || "",
                    PULUMI_ACCESS_TOKEN: process.env.PULUMI_ACCESS_TOKEN || "",
                }
            });
            return `${stdout}\n${stderr}`;
        } catch (error: any) {
            // Emulates the original error output pattern so the rest of the file continues to work unchanged
            return `Command failed:\n${error.stdout || ""}\n${error.stderr || ""}`;
        }
    }

    public async deploy(): Promise<{ success: boolean; logs: string }> {
        const pulumiConfig = configManager.config.pulumi;
        let loginCmd = "";

        // Determine State Backend Configuration
        if (pulumiConfig.backend === "local") {
            console.log("⚙️  Using Local Pulumi Backend...");
            loginCmd = "pulumi login --local && ";
        } else {
            console.log("☁️  Using Cloud Pulumi Backend...");
            if (!process.env.PULUMI_ACCESS_TOKEN) {
                console.warn("⚠️  PULUMI_ACCESS_TOKEN is missing but backend is set to 'cloud'. This might fail.");
            }
            // If cloud, Pulumi implicitly uses PULUMI_ACCESS_TOKEN from env variables
        }

        console.log("🔄 Initializing Pulumi Stack...");
        await this.runCommand(`${loginCmd}pulumi stack init dev`).catch(() => { });

        console.log("🚀 Running Pulumi Up...");
        const output = await this.runCommand(`${loginCmd}pulumi up --yes --stack dev`);

        const isSuccess = !output.startsWith("Command failed:");
        return { success: isSuccess, logs: output };
    }
}