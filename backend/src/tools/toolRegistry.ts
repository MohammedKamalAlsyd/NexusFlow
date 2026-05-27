import { DynamicStructuredTool } from "@langchain/core/tools";
import { readFileTool, writeFileTool, deleteFileTool, listFilesTool } from "./fs/fileSystem.js";
import { searchContentTool } from "./fs/searchFiles.js";
import { executeCommandTool } from "./terminal/commandUtils.js";
import { webSearchTool } from "./web/searchTool.js";
import { setupEnvironmentTool } from "./terminal/setupEnv.js";

export const localFsTools = [readFileTool, writeFileTool, deleteFileTool, listFilesTool, searchContentTool];
export const localTerminalTools = [executeCommandTool, setupEnvironmentTool];
export const webTools = [webSearchTool];

// 1. Updated Lean Roles
export type AgentRole =
    | "architect"
    | "pipeline-coder"
    | "data-ops";

/**
 * A dynamic registry that combines local code tools, terminal tools,
 * and remote MCP tools (AWS/Azure via Docker).
 */
export class ToolManager {
    private tools: Map<string, DynamicStructuredTool<any>>;

    constructor() {
        this.tools = new Map();
        this.loadLocalTools();
    }

    private loadLocalTools() {
        const allLocalTools = [
            ...localFsTools,
            ...localTerminalTools,
            ...webTools
        ];
        for (const tool of allLocalTools) {
            this.tools.set(tool.name, tool as DynamicStructuredTool<any>);
        }
    }

    public registerDynamicTool(tool: DynamicStructuredTool<any>) {
        if (this.tools.has(tool.name)) {
            console.warn(`[ToolManager] Overwriting existing tool: ${tool.name}`);
        }
        this.tools.set(tool.name, tool);
        console.log(`🔌 Registered Dynamic Tool: ${tool.name}`);
    }

    public getToolsForRole(role: AgentRole) {
        const allTools = Array.from(this.tools.values());

        switch (role) {
            case "architect":
                // Architect gets ALL discovery, catalog, and list tools from the MCP servers.
                // NO code execution or file system tools.
                return allTools.filter(t =>
                    t.name.includes("list") ||
                    t.name.includes("get_") ||
                    t.name.includes("check_") ||
                    t.name.includes("catalog")
                );

            case "pipeline-coder":
                // Coder gets File System, Terminal, Web Search, and AWS Documentation.
                return allTools.filter(t =>
                    localFsTools.some(local => local.name === t.name) ||
                    localTerminalTools.some(local => local.name === t.name) ||
                    webTools.some(web => web.name === t.name) ||
                    t.name.includes("documentation")
                );

            case "data-ops":
                // DataOps gets MCP DB querying and analysis tools, but no local FS.
                return allTools.filter(t =>
                    !localFsTools.some(local => local.name === t.name) &&
                    !localTerminalTools.some(local => local.name === t.name) &&
                    !t.name.includes("documentation")
                );

            default:
                return [];
        }
    }

    public getAllTools() {
        return Array.from(this.tools.values());
    }
}

// Export singleton
export const toolManager = new ToolManager();