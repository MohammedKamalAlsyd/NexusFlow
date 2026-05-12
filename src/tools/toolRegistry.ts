import { DynamicStructuredTool } from "@langchain/core/tools";
import { readFileTool, writeFileTool, deleteFileTool, listFilesTool } from "./fs/fileSystem.js";
import { editFileTool, restoreFileTool } from "./fs/editWithDiff.js";
import { searchContentTool } from "./fs/searchFiles.js";
import { executeCommandTool } from "./terminal/commandUtils.js";

// Export standard local tools arrays
export const localFsTools = [readFileTool, writeFileTool, deleteFileTool, listFilesTool, editFileTool, restoreFileTool, searchContentTool];
export const localTerminalTools = [executeCommandTool];

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
    public getToolsForRole(role: "software-engineer" | "data-analyst" | "supervisor") {
        const allTools = Array.from(this.tools.values());

        switch (role) {
            case "software-engineer":
                // SWE gets FS and Terminal tools
                return allTools.filter(t =>
                    localFsTools.some(local => local.name === t.name) ||
                    localTerminalTools.some(local => local.name === t.name)
                );

            case "data-analyst":
                // Data analyst gets Read tools and MCP database tools (which aren't in localFsTools)
                return []; // return empty for now

            case "supervisor":
                // Supervisor usually just routes, doesn't execute tools directly
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