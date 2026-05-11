import { tool } from "@langchain/core/tools";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import * as Diff from "diff";
import { settings } from "@/config/index.js";
import { validateFileOperation } from "@/safety/pathValidator.js";
import { askForPermission } from "@/safety/interactivity.js";

// --- EDIT FILE TOOL ---
export const editFileTool = tool(
    async ({ filePath, oldText, newText }) => {
        const safety = await validateFileOperation("write", filePath);
        if (!safety.safe) return `Access Denied: ${safety.reason}`;

        const approved = await askForPermission("write", filePath);
        if (!approved) return "Operation cancelled by user.";

        const resolvedPath = path.resolve(filePath);
        const originalContent = await fs.readFile(resolvedPath, "utf-8");

        if (!originalContent.includes(oldText)) {
            return `Error: 'oldText' not found. Please read the file again.`;
        }

        // Create Backup
        await fs.mkdir(settings.backupDir, { recursive: true });
        const timestamp = Date.now();
        const backupPath = path.join(settings.backupDir, `${path.basename(filePath)}.${timestamp}.bak`);
        await fs.writeFile(backupPath, originalContent, "utf-8");

        const updatedContent = originalContent.replace(oldText, newText);
        await fs.writeFile(resolvedPath, updatedContent, "utf-8");

        const patch = Diff.createPatch(filePath, originalContent, updatedContent);
        return `Edit successful. Backup saved to ${backupPath}. Diff:\n\n${patch}`;
    },
    {
        name: "edit_file",
        description: "Replaces text in a file. Automatically creates a backup.",
        schema: z.object({
            filePath: z.string(),
            oldText: z.string(),
            newText: z.string(),
        }),
    }
);

// --- RESTORE FILE TOOL ---
export const restoreFileTool = tool(
    async ({ filePath, backupFilePath }) => {
        const safety = await validateFileOperation("write", filePath);
        if (!safety.safe) return `Access Denied: ${safety.reason}`;

        const approved = await askForPermission("write", filePath);
        if (!approved) return "Operation cancelled by user.";

        try {
            const content = await fs.readFile(backupFilePath, "utf-8");
            await fs.writeFile(path.resolve(filePath), content, "utf-8");
            return `Successfully restored ${filePath} from ${backupFilePath}`;
        } catch (err: any) {
            return `Restore failed: ${err.message}`;
        }
    },
    {
        name: "restore_file",
        description: "Restores a file to a previous version using a backup file.",
        schema: z.object({
            filePath: z.string().describe("Original file path"),
            backupFilePath: z.string().describe("Full path to the .bak file"),
        }),
    }
);