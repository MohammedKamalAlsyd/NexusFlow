import { tool } from "@langchain/core/tools";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { isPathAllowed, isPathBlocked } from "@/safety/pathValidator.js";
import { safetyManager } from "@/safety/safetyContext.js";

async function isBinary(filePath: string): Promise<boolean> {
    try {
        const fd = await fs.open(filePath, "r");
        const buffer = Buffer.alloc(4000);
        const { bytesRead } = await fd.read(buffer, 0, 4000, 0);
        await fd.close();
        for (let i = 0; i < bytesRead; i++) if (buffer[i] === 0) return true;
        return false;
    } catch {
        return true; // Assume binary if unreadable
    }
}

export const searchContentTool = tool(
    async ({ pattern, dirPath }) => {
        const context = safetyManager.getContext();

        // Check if the root search directory is allowed
        const check = isPathAllowed(dirPath, context);
        if (!check.safe) return `Access Denied: ${check.reason}`;

        const results: string[] = [];
        const regex = new RegExp(pattern, "g");

        async function walk(currentDir: string) {
            if (results.length > 50) return; // Prevent massive outputs crashing the LLM context

            const entries = await fs.readdir(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);

                // Dynamically check against blocked patterns from the safety context
                if (isPathBlocked(fullPath, context)) {
                    continue; // Skip this file or entire directory
                }

                if (entry.isDirectory()) {
                    await walk(fullPath);
                } else if (entry.isFile()) {
                    // Check extensions to prevent reading massive built .exe files
                    const ext = path.extname(fullPath).toLowerCase();
                    if (context.notAllowedExtensions.includes(ext)) continue;

                    if (await isBinary(fullPath)) continue;

                    const content = await fs.readFile(fullPath, "utf-8");
                    const lines = content.split("\n");

                    lines.forEach((line, index) => {
                        if (regex.test(line)) {
                            results.push(`${fullPath}:${index + 1}: ${line.trim()}`);
                        }
                        regex.lastIndex = 0; // Reset regex index for global matches
                    });
                }
            }
        }

        try {
            await walk(path.resolve(context.projectRoot, dirPath));
            if (results.length === 0) return "No matches found.";
            return results.join("\n");
        } catch (err: any) {
            return `Search error: ${err.message}`;
        }
    },
    {
        name: "search_file_content",
        description: "Searches for a regex pattern inside files within a directory (like grep). Ignores blocked directories like node_modules.",
        schema: z.object({
            pattern: z.string().describe("Regex pattern to search for"),
            dirPath: z.string().describe("Directory to start search in (e.g. 'src/')"),
        }),
    }
);