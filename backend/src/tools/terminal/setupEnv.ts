import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";
import { isPathAllowed } from "@/safety/pathValidator.js";
import { askForPermission } from "@/safety/interactivity.js";

const execAsync = promisify(exec);

export const setupEnvironmentTool = tool(
    async ({ workspacePath, type, packages }) => {
        const resolvedPath = path.resolve(workspacePath);
        const safety = isPathAllowed(resolvedPath);
        if (!safety.safe) {
            return `Access Denied: ${safety.reason}`;
        }

        // Ask for human-in-the-loop permission as this runs an execution command
        const approved = await askForPermission("execute", `Setup ${type} Env in ${path.basename(resolvedPath)}`);
        if (!approved) {
            return "Operation cancelled by user.";
        }

        try {
            await fs.mkdir(resolvedPath, { recursive: true });
            let log = `Initializing ${type} in ${resolvedPath}...\n`;

            if (type === "nodejs") {
                const pkgJsonPath = path.join(resolvedPath, "package.json");

                // Scaffold package.json if it doesn't exist
                try {
                    await fs.access(pkgJsonPath);
                } catch {
                    const defaultPkg = {
                        name: "nexusflow-deployment",
                        version: "1.0.0",
                        main: "index.ts",
                        dependencies: {
                            "@pulumi/pulumi": "^3.0.0",
                        },
                        devDependencies: {
                            "typescript": "^5.0.0",
                            "@types/node": "^18.0.0"
                        }
                    };
                    await fs.writeFile(pkgJsonPath, JSON.stringify(defaultPkg, null, 2), "utf-8");
                    log += "✅ Created default package.json\n";
                }

                // Run npm install with optional additional packages
                const installCmd = packages && packages.length > 0
                    ? `npm install ${packages.join(" ")}`
                    : "npm install";

                log += `📦 Running: ${installCmd}...\n`;
                const { stdout, stderr } = await execAsync(`cd "${resolvedPath}" && ${installCmd}`);
                log += `${stdout}\n${stderr ? `Errors/Warnings:\n${stderr}` : ""}`;
            }

            if (type === "python") {
                const venvPath = path.join(resolvedPath, ".venv");

                try {
                    await fs.access(venvPath);
                } catch {
                    log += "⚡ Creating Python Virtual Environment using uv (with pip seed)...\n";
                    await execAsync(`cd "${resolvedPath}" && uv venv --seed`);
                }

                if (packages && packages.length > 0) {
                    // uv automatically detects the .venv folder in the current directory
                    const installCmd = `uv pip install ${packages.join(" ")}`;

                    log += `⚡ Installing Python packages: ${installCmd}...\n`;
                    try {
                        const { stdout, stderr } = await execAsync(`cd "${resolvedPath}" && ${installCmd}`);
                        log += `${stdout}\n${stderr ? `Errors/Warnings:\n${stderr}` : ""}`;
                    } catch (error: any) {
                        log += `❌ Install failed: ${error.message}\n${error.stdout || ''}\n${error.stderr || ''}`;
                    }
                }
            }

            return `Workspace initialized successfully!\n\nExecution Logs:\n${log}`;
        } catch (error: any) {
            return `Failed to initialize environment: ${error.message}`;
        }
    },
    {
        name: "setup_environment",
        description: "Initializes nodejs (npm install) or python (uv venv / uv pip) dependencies inside a specific workspace directory.",
        schema: z.object({
            workspacePath: z.string().describe("The absolute path to the workspace folder"),
            type: z.enum(["nodejs", "python"]).describe("The runtime environment stack to set up"),
            packages: z.array(z.string()).optional().describe("Optional list of extra dependencies to install (e.g. ['@pulumi/aws'] or ['pandas', 'numpy'])")
        })
    }
);