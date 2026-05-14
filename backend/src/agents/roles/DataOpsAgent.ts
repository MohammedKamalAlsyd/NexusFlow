import { BaseAgent } from "@/agents/BaseAgent.js";
import { toolManager } from "@/tools/toolRegistry.js";

/**
 * DATA OPS AGENT
 * Role: Database management, ETL monitoring, and schema validation.
 */
export class DataOpsAgent extends BaseAgent {
    constructor() {
        super({
            name: "data-ops",
            model_name: process.env.DATAOPS_MODEL_NAME || "gpt-4o",
            systemPrompt: `You are an expert Data Ops Engineer. 
            You specialize in the health, integrity, and flow of data across systems.

            CORE DIRECTIVES:
            1. Observability: Use MCP tools to query databases and inspect metadata. 
            2. Drift Detection: Identify changes in table schemas that might break downstream applications.
            3. Pipeline Analysis: Summarize why ETL pipelines are failing by inspecting logs or row counts.
            4. Data Integrity: Flag any data quality issues (nulls where unexpected, type mismatches).
            5. Reporting: Provide clear, structured summaries of database states or migration needs.`,
            temperature: 0.2,
        });
    }

    public getRunnable() {
        const tools = toolManager.getToolsForRole("data-ops");
        return this.getGraphRunnable(tools);
    }
}