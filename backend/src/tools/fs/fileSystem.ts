// backend/src/tools/fs/fileSystem.ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { validateFileOperation } from "@/safety/pathValidator.js";
import { askForPermission } from "@/safety/interactivity.js";

// --- READ MULTIPLE FILES ---
export const readFileTool = tool(
    async ({ filePaths }) => {
        const results: string[] = [];

        for (const filePath of filePaths) {
            const safety = await validateFileOperation("read", filePath);
            if (!safety.safe) {
                results.push(`[${filePath}]: Access Denied - ${safety.reason}`);
                continue;
            }

            try {
                const content = await fs.readFile(path.resolve(filePath), "utf-8");
                results.push(`--- BEGIN ${filePath} ---\n${content || "[File is empty]"}\n--- END ${filePath} ---`);
            } catch (error: any) {
                results.push(`[${filePath}]: Error - ${error.message}`);
            }
        }

        return results.join("\n\n");
    },
    {
        name: "read_files",
        description: "Reads the content of one or multiple files.",
        schema: z.object({
            filePaths: z.array(z.string()).describe("Array of file paths to read")
        }),
    }
);

// --- WRITE MULTIPLE FILES ---
export const writeFileTool = tool(
    async ({ files }) => {
        // 1. Validate paths for all files before making any changes
        for (const file of files) {
            const safety = await validateFileOperation("write", file.filePath);
            if (!safety.safe) {
                return `Access Denied for ${file.filePath}: ${safety.reason}. No files were written.`;
            }
        }

        // 2. Ask user for permission ONCE for the entire batch
        const fileNames = files.map(f => path.basename(f.filePath)).join(", ");
        const approved = await askForPermission("write", `Batch Write (${files.length} files): [${fileNames}]`);
        if (!approved) return "Operation cancelled by user.";

        // 3. Write all files
        const results: string[] = [];
        for (const file of files) {
            try {
                const resolvedPath = path.resolve(file.filePath);
                await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
                await fs.writeFile(resolvedPath, file.content, "utf-8");
                results.push(`✅ Successfully wrote ${file.filePath}`);
            } catch (error: any) {
                results.push(`❌ Failed to write ${file.filePath}: ${error.message}`);
            }
        }

        return results.join("\n");
    },
    {
        name: "write_files",
        description: "Creates or overwrites one or multiple files in a single execution. Use this to scaffold the whole project at once.",
        schema: z.object({
            files: z.array(
                z.object({
                    filePath: z.string().describe("Path of the file to write"),
                    content: z.string().describe("The full content to write to the file"),
                })
            ).describe("List of files to write"),
        }),
    }
);

// --- DELETE MULTIPLE FILES ---
export const deleteFileTool = tool(
    async ({ filePaths }) => {
        for (const filePath of filePaths) {
            const safety = await validateFileOperation("delete", filePath);
            if (!safety.safe) return `Access Denied for ${filePath}: ${safety.reason}. No files deleted.`;
        }

        const fileNames = filePaths.map(f => path.basename(f)).join(", ");
        const approved = await askForPermission("delete", `Batch Delete: [${fileNames}]`);
        if (!approved) return "Operation cancelled by user.";

        const results: string[] = [];
        for (const filePath of filePaths) {
            try {
                await fs.unlink(path.resolve(filePath));
                results.push(`✅ Successfully deleted ${filePath}`);
            } catch (error: any) {
                results.push(`❌ Failed to delete ${filePath}: ${error.message}`);
            }
        }

        return results.join("\n");
    },
    {
        name: "delete_files",
        description: "Deletes one or multiple files from the file system.",
        schema: z.object({
            filePaths: z.array(z.string()).describe("Array of file paths to delete")
        }),
    }
);

// --- List Files in Directory ---
export const listFilesTool = tool(
    async ({ dirPath }) => {
        const safety = await validateFileOperation("read", dirPath);
        if (!safety.safe) return `Access Denied: ${safety.reason}`;

        // a list of folder/file names to ignore
        const IGNORED_NAMES = new Set(["node_modules", "dist", "build", ".git"]);

        try {
            const resolvedPath = path.resolve(dirPath);
            const entries = await fs.readdir(resolvedPath, { withFileTypes: true });

            // Filter out hidden items and explicitly ignored folders
            const filteredEntries = entries.filter(entry => {
                const name = entry.name;
                // Exclude hidden files/folders (starting with '.') and explicitly ignored names
                return !name.startsWith(".") && !IGNORED_NAMES.has(name);
            });

            const fileList = filteredEntries.map(entry => 
                entry.isDirectory() ? `[DIR]  ${entry.name}` : `[FILE] ${entry.name}`
            );
            
            if (fileList.length === 0) return "Directory is empty (or all contents are hidden/ignored).";

            return `Listing contents of ${dirPath}:\n${fileList.join("\n")}`;
        } catch (error: any) {
            return `Failed to list directory: ${error.message}`;
        }
    },
    {
        name: "list_files",
        description: "Lists files and directories in the specified path, excluding hidden and heavy system folders.",
        schema: z.object({ dirPath: z.string() }),
    }
);