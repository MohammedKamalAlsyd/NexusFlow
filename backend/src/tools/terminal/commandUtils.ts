import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { askForPermission } from "@/safety/interactivity.js";
import { safetyManager } from "@/safety/safetyContext.js";

const execAsync = promisify(exec);

export const executeCommandTool = tool(
    async ({ command }) => {
        const context = safetyManager.getContext();

        // Extract the actual command, ignoring directory changes (e.g., "cd /workspace && npm install" -> "npm install")
        const actualCommand = command.includes("&&") ? command.split("&&").pop()?.trim() || command : command;

        // 1. Safety Check: Block commands defined in safety context
        const isBlocked = context.blockedCommands.some((blocked) =>
            actualCommand.toLowerCase().includes(blocked.toLowerCase())
        );

        if (isBlocked) {
            return `Access Denied: The command '${actualCommand}' is blocked by security policy.`;
        }

        // 2. Human-in-the-loop: Ask before executing using the clean command name
        const approved = await askForPermission("execute", actualCommand);
        if (!approved) return "Operation cancelled by user.";

        try {
            const { stdout, stderr } = await execAsync(command);
            return `Output:\n${stdout}\n${stderr ? `Errors:\n${stderr}` : ""}`;
        } catch (error: any) {
            return `Command failed: ${error.message}`;
        }
    },
    {
        name: "execute_command",
        description: "Executes a shell command. Use for tasks like running tests or installing packages.",
        schema: z.object({
            command: z.string().describe("The shell command to execute"),
        }),
    }
);