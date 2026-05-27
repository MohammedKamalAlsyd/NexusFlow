import { executeCommandTool } from "@/tools/terminal/commandUtils.js";

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
        console.log("🔄 Initializing Pulumi Stack...");
        // stack init may fail if stack already exists – ignore
        await this.runCommand("pulumi stack init dev").catch(() => { });

        console.log("🚀 Running Pulumi Up...");
        const output = await this.runCommand("pulumi up --yes --stack dev");

        // Reliably detect failure based on the tool's error string
        const isSuccess = !output.startsWith("Command failed:");
        return { success: isSuccess, logs: output };
    }
}