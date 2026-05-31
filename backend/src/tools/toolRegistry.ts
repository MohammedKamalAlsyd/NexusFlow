// backend/src/tools/toolRegistry.ts
import { DynamicStructuredTool } from "@langchain/core/tools";
import { readFileTool, writeFileTool, deleteFileTool, listFilesTool } from "./fs/fileSystem.js";
import { searchContentTool } from "./fs/searchFiles.js";
import { executeCommandTool } from "./terminal/commandUtils.js";
import { webSearchTool } from "./web/searchTool.js";
import { setupEnvironmentTool } from "./terminal/setupEnv.js";

export const localFsTools = [readFileTool, writeFileTool, deleteFileTool, listFilesTool, searchContentTool];
export const localTerminalTools = [executeCommandTool, setupEnvironmentTool];
export const webTools = [webSearchTool];

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

    /**
     * Filters available tools based on the Agent's persona.
     * External MCP tools are automatically namespaced in client.ts as `${serverName}_${toolName}`
     * (e.g., "aws-api_call_aws", "aws-data-processing_list_s3_buckets").
     */
    public getToolsForRole(role: AgentRole) {
        const allTools = Array.from(this.tools.values());

        switch (role) {
            case "architect":
                // 🧠 ARCHITECT FOCUS: Discovery, Environment scanning, Planning.
                return allTools.filter(t => {
                    const n = t.name.toLowerCase();
                    
                    // Allow Web Search
                    if (n === "search_web") return true;
                    
                    // Allow universal AWS API (call_aws, suggest_aws_commands)
                    if (n.startsWith("aws-api")) return true;
                    
                    // Allow Azure Catalog for environment discovery
                    if (n.startsWith("azure-catalog")) return true;
                    
                    // Allow AWS Documentation for planning limits/features
                    if (n.startsWith("aws-documentation")) return true;
                    
                    // Allow AWS Data Processing (ONLY read/list/analyze/get tools)
                    // We block "manage_aws_glue_jobs" here to prevent the architect from deploying,
                    // and to save massive amounts of context window limits.
                    if (n.startsWith("aws-data-processing")) {
                        if (n.includes("list") || n.includes("get") || n.includes("analyze") || n.includes("describe")) {
                            return true;
                        }
                    }
                    
                    return false;
                });

            case "pipeline-coder":
                // 👨‍💻 CODER FOCUS: Writing code, local execution, reading docs.
                return allTools.filter(t => {
                    const n = t.name.toLowerCase();
                    
                    // Allow all local file system, terminal, and web tools
                    if (localFsTools.some(local => local.name === t.name)) return true;
                    if (localTerminalTools.some(local => local.name === t.name)) return true;
                    if (webTools.some(web => web.name === t.name)) return true;
                    
                    // Allow Documentation for coding references (boto3, Pulumi syntax, etc.)
                    if (n.startsWith("aws-documentation")) return true;
                    
                    // Allow specific data processing tools for script uploads
                    if (n === "aws-data-processing_upload_to_s3") return true;

                    return false;
                });

            case "data-ops":
                // 📊 DATA-OPS FOCUS: Triggering pipelines, validating data in the cloud.
                return allTools.filter(t => {
                    const n = t.name.toLowerCase();
                    
                    // Allow Web Search
                    if (n === "search_web") return true;
                    
                    // Allow universal AWS API
                    if (n.startsWith("aws-api")) return true;
                    
                    // Allow ALL AWS Data Processing (to trigger glue jobs, query Athena, etc)
                    if (n.startsWith("aws-data-processing")) return true;
                    
                    // Allow Azure Catalog (for DB queries, Cosmos, SQL)
                    if (n.startsWith("azure-catalog")) return true;
                    
                    // Local terminal fallback (execute_command only, no workspace scaffolding)
                    if (n === "execute_command") return true;

                    return false;
                });

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