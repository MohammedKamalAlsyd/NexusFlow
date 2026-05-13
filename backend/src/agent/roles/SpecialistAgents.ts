import { BaseAgent } from "@/agent/BaseAgent.js";
import { toolManager } from "@/tools/toolRegistry.js";

/**
 * SOFTWARE ENGINEER AGENT
 * Inherits the LLM backbone, applies SWE persona, and fetches FS/Terminal tools.
 */
export class SoftwareEngineerAgent extends BaseAgent {
    constructor() {
        super({
            name: "software-engineer",
            systemPrompt: `You are a Senior Software Engineer. 
                           1. Prioritize safety and security.
                           2. Aim for minimal code changes.
                           3. Explain your reasoning briefly.`,
            temperature: 0.1, // Strict coding
        });
    }

    public getRunnable() {
        const tools = toolManager.getToolsForRole("software-engineer");
        return this.getGraphRunnable(tools);
    }
}

/**
 * DATA OPS AGENT
 * Connects to MCP databases and checks data drift.
 */
export class DataOpsAgent extends BaseAgent {
    constructor() {
        super({
            name: "data-ops",
            systemPrompt: `You are a Data Ops Engineer. 
                           Your job is to query databases via MCP tools, identify schema drifts, 
                           and summarize broken ETL pipelines.`,
            temperature: 0.2,
        });
    }

    public getRunnable() {
        const tools = toolManager.getToolsForRole("data-ops");
        return this.getGraphRunnable(tools);
    }
}

/**
 * DEVOPS AGENT
 * Manages GitHub interactions via MCP.
 */
export class DevOpsAgent extends BaseAgent {
    constructor() {
        super({
            name: "devops",
            systemPrompt: `You are a DevOps Engineer. 
                           You handle git branching, committing, and opening PRs securely.`,
            temperature: 0.1,
        });
    }

    public getRunnable() {
        const tools = toolManager.getToolsForRole("devops");
        return this.getGraphRunnable(tools);
    }
}