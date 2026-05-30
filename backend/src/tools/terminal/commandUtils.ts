import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { spawn } from "node:child_process";
import { askForPermission } from "@/safety/interactivity.js";
import { configManager } from "@/config/index.js";

/**
 * Spawns a shell command interactively.
 * - stdin is inherited (allowing you to type answers to prompts like Passphrases).
 * - stdout/stderr are captured for the LLM *and* streamed live to your console.
 */
const runInteractiveCommand = (cmd: string): Promise<{ stdout: string; stderr: string; code: number }> => {
    return new Promise((resolve) => {
        const child = spawn(cmd, {
            shell: true,
            stdio: ["inherit", "pipe", "pipe"],
            env: {
                ...process.env,
                // Bypasses the annoying Pulumi passphrase prompt for local dev if not set
                PULUMI_CONFIG_PASSPHRASE: process.env.PULUMI_CONFIG_PASSPHRASE || "",
            },
        });

        let stdoutData = "";
        let stderrData = "";

        if (child.stdout) {
            child.stdout.on("data", (chunk) => {
                const str = chunk.toString();
                stdoutData += str;
                process.stdout.write(str); // Live stream to user console
            });
        }

        if (child.stderr) {
            child.stderr.on("data", (chunk) => {
                const str = chunk.toString();
                stderrData += str;
                process.stderr.write(str); // Live stream to user console
            });
        }

        child.on("close", (code) => {
            resolve({ stdout: stdoutData, stderr: stderrData, code: code ?? 1 });
        });

        child.on("error", (error) => {
            resolve({ stdout: stdoutData, stderr: stderrData + `\nSystem Error: ${error.message}`, code: 1 });
        });
    });
};

export const executeCommandTool = tool(
    async ({ command }) => {
        const config = configManager.config;

        // Extract the actual command, ignoring directory changes
        const actualCommand = command.includes("&&") ? command.split("&&").pop()?.trim() || command : command;

        // 1. Safety Check: Block commands defined in safety context
        const isBlocked = config.safety.blockedCommands.some((blocked) =>
            actualCommand.toLowerCase().includes(blocked.toLowerCase())
        );

        if (isBlocked) {
            return `Access Denied: The command '${actualCommand}' is blocked by security policy.`;
        }

        // 2. Human-in-the-loop: Ask before executing
        // Extract the base command (e.g., "pulumi") to avoid workspace folder name mismatch on subsequent executions
        const baseCommand = actualCommand.split(" ")[0] || actualCommand;
        
        const approved = await askForPermission(
            "commands",
            "execute",
            baseCommand,
            `Agent wants to execute command:\n> ${actualCommand}`
        );
        if (!approved) return "Operation cancelled by user.";

        try {
            const { stdout, stderr, code } = await runInteractiveCommand(command);

            if (code !== 0) {
                return `Command failed: Exit code ${code}.\nStdout:\n${stdout}\nStderr:\n${stderr}`;
            }

            return `Output:\n${stdout}\n${stderr ? `Warnings:\n${stderr}` : ""}`;
        } catch (error: any) {
            return `Command failed: System exception occurred. ${error.message}`;
        }
    },
    {
        name: "execute_command",
        description: "Executes a shell command. Automatically streams output to terminal and supports interactive inputs.",
        schema: z.object({
            command: z.string().describe("The shell command to execute"),
        }),
    }
);