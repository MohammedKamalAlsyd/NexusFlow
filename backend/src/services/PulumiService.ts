import { executeCommandTool } from "@/tools/terminal/commandUtils.js";
import { configManager } from "@/config/index.js";

export class PulumiService {
    private workspaceDir: string;

    // Change constructor to accept the absolute path directly from state
    constructor(absoluteWorkspacePath: string) {
        this.workspaceDir = absoluteWorkspacePath;
    }

    private async runCommand(cmd: string): Promise<string> {
        const result = await executeCommandTool.invoke({
            command: `cd "${this.workspaceDir}" && ${cmd}`
        });
        return result;
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