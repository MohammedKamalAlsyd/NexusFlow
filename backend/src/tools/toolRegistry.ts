import { DynamicStructuredTool } from "@langchain/core/tools";
import { readFileTool, writeFileTool, deleteFileTool, listFilesTool } from "./fs/fileSystem.js";
import { editFileTool, restoreFileTool } from "./fs/editWithDiff.js";
import { searchContentTool } from "./fs/searchFiles.js";
import { executeCommandTool } from "./terminal/commandUtils.js";

// Export standard local tools arrays
export const localFsTools = [readFileTool, writeFileTool, deleteFileTool, listFilesTool, editFileTool, restoreFileTool, searchContentTool];
export const localTerminalTools = [executeCommandTool];

// Define roles types
export type AgentRole = "software-engineer" | "data-ops" | "devops" | "supervisor";

/**
 * A dynamic registry that combines local code tools with remote MCP tools.
 */
export class ToolManager {
    private tools: Map<string, DynamicStructuredTool<any>>;

    constructor() {
        this.tools = new Map();
        this.loadLocalTools();
    }

    /**
     * Loads the hardcoded, local machine tools.
    */
    private loadLocalTools() {
        const allLocalTools = [...localFsTools, ...localTerminalTools];
        for (const tool of allLocalTools) {
            this.tools.set(tool.name, tool as DynamicStructuredTool<any>);
        }
    }

    /**
    * Will be used to dynamically inject external MCP tools.
    */
    public registerDynamicTool(tool: DynamicStructuredTool<any>) {
        if (this.tools.has(tool.name)) {
            console.warn(`[ToolManager] Overwriting existing tool: ${tool.name}`);
        }
        this.tools.set(tool.name, tool);
        console.log(`🔌 Registered Dynamic Tool: ${tool.name}`);
    }

    /**
    * Returns a filtered array of tools based on the Agent's Role.
    */
    public getToolsForRole(role: AgentRole) {
        const allTools = Array.from(this.tools.values());

        switch (role) {
            case "software-engineer":
                return allTools.filter(t =>
                    localFsTools.some(local => local.name === t.name) ||
                    localTerminalTools.some(local => local.name === t.name)
                );

            case "data-ops":
                // Filter: Tools that are NOT local FS and NOT terminal (likely MCP)
                return allTools.filter(t =>
                    !localFsTools.some(local => local.name === t.name) &&
                    !localTerminalTools.some(local => local.name === t.name)
                );

            case "devops":
                // DevOps might want specific MCP tools (like github) and maybe terminal
                return allTools.filter(t =>
                    t.name.includes("github") ||
                    localTerminalTools.some(local => local.name === t.name)
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