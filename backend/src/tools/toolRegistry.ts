import { DynamicStructuredTool } from "@langchain/core/tools";
import { readFileTool, writeFileTool, deleteFileTool, listFilesTool } from "./fs/fileSystem.js";
import { editFileTool, restoreFileTool } from "./fs/editWithDiff.js";
import { searchContentTool } from "./fs/searchFiles.js";
import { executeCommandTool } from "./terminal/commandUtils.js";
import { webSearchTool } from "./web/searchTool.js";
import { cloudDiscoveryTools } from "./cloud/index.js";

export const localFsTools = [readFileTool, writeFileTool, deleteFileTool, listFilesTool, editFileTool, restoreFileTool, searchContentTool];
export const localTerminalTools = [executeCommandTool];
export const webTools = [webSearchTool];

// 1. Updated Roles
export type AgentRole =
    | "software-engineer"
    | "data-ops"
    | "devops"
    | "supervisor"
    | "cloud-explorer"
    | "pipeline-coder";

/**
 * A dynamic registry that combines local code tools, terminal tools,
 * and remote cloud discovery/MCP tools.
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
            ...cloudDiscoveryTools,
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
            case "pipeline-coder":
                // The pipeline coder gets File System, Terminal, and Web Search!
                return allTools.filter(t =>
                    localFsTools.some(local => local.name === t.name) ||
                    localTerminalTools.some(local => local.name === t.name) ||
                    webTools.some(web => web.name === t.name)
                );

            case "software-engineer":
                return allTools.filter(t =>
                    localFsTools.some(local => local.name === t.name) ||
                    localTerminalTools.some(local => local.name === t.name)
                );

            case "data-ops":
                // MCP Tools + Cloud Discovery Tools
                return allTools.filter(t =>
                    !localFsTools.some(local => local.name === t.name) &&
                    !localTerminalTools.some(local => local.name === t.name)
                );

            case "devops":
                return allTools.filter(t =>
                    t.name.includes("github") ||
                    localTerminalTools.some(local => local.name === t.name)
                );

            case "cloud-explorer":
                // Specifically returns the cloud discovery tools
                return allTools.filter(t =>
                    cloudDiscoveryTools.some(cloud => cloud.name === t.name)
                );

            case "supervisor":
                return [];

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