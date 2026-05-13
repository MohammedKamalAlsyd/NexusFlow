import { tool } from "@langchain/core/tools";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { validateFileOperation } from "@/safety/pathValidator.js";
import { askForPermission } from "@/safety/interactivity.js";


// --- READ FILE ---
export const readFileTool = tool(
    async ({ filePath }) => {
        const safety = await validateFileOperation("read", filePath);
        if (!safety.safe) return `Access Denied: ${safety.reason}`;

        try {
            const content = await fs.readFile(path.resolve(filePath), "utf-8");
            return content || "[File is empty]";
        } catch (error: any) {
            return `Failed to read file: ${error.message}`;
        }
    },
    {
        name: "read_file",
        description: "Reads the content of a file. Use this to inspect code before modifying.",
        schema: z.object({ filePath: z.string().describe("Path of the file to read") }),
    }
)


// --- WRITE/OVERWRITE FILE ---
export const writeFileTool = tool(
    async ({ filePath, content }) => {
        const safety = await validateFileOperation("write", filePath);
        if (!safety.safe) return `Access Denied: ${safety.reason}`;

        const approved = await askForPermission("write", filePath);
        if (!approved) return "Operation cancelled by user.";

        try {
            const resolvedPath = path.resolve(filePath);
            await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
            await fs.writeFile(resolvedPath, content, "utf-8");
            return `Successfully wrote to ${filePath}`;
        } catch (error: any) {
            return `Failed to write file: ${error.message}`;
        }
    },
    {
        name: "write_file",
        description: "Creates or completely overwrites a file. For minor changes, use edit_file instead.",
        schema: z.object({
            filePath: z.string(),
            content: z.string().describe("The full content to write to the file"),
        }),
    }
);

// --- DELETE FILE ---
export const deleteFileTool = tool(
    async ({ filePath }) => {
        const safety = await validateFileOperation("delete", filePath);
        if (!safety.safe) return `Access Denied: ${safety.reason}`;

        const approved = await askForPermission("delete", filePath);
        if (!approved) return "Operation cancelled by user.";

        try {
            await fs.unlink(path.resolve(filePath));
            return `Successfully deleted ${filePath}`;
        } catch (error: any) {
            return `Failed to delete file: ${error.message}`;
        }
    },
    {
        name: "delete_file",
        description: "Deletes a file from the file system.",
        schema: z.object({ filePath: z.string() }),
    }
)

// --- List Files in Directory ---
export const listFilesTool = tool(
    async ({ dirPath }) => {
        const safety = await validateFileOperation("read", dirPath);
        if (!safety.safe) return `Access Denied: ${safety.reason}`;

        try {
            const resolvedPath = path.resolve(dirPath);
            const entries = await fs.readdir(resolvedPath, { withFileTypes: true });

            // Format the output for the LLM: clearly mark directories vs files
            const fileList = entries.map(entry => {
                return entry.isDirectory() ? `[DIR]  ${entry.name}` : `[FILE] ${entry.name}`;
            });

            if (fileList.length === 0) return "Directory is empty.";

            return `Listing contents of ${dirPath}:\n${fileList.join("\n")}`;
        } catch (error: any) {
            return `Failed to list directory: ${error.message}`;
        }
    },
    {
        name: "list_files",
        description: "Lists all files and directories in the specified path. Use this to explore the project structure.",
        schema: z.object({
            dirPath: z.string().describe("The path of the directory to list"),
        }),
    }
);