import { BaseAgent } from "@/agents/BaseAgent.js";
import { toolManager } from "@/tools/toolRegistry.js";
import type { DynamicStructuredTool } from "@langchain/core/tools";

/**
 * ARCHITECT AGENT
 * Focus: Multi-Cloud flow, resource selection, state planning, and cost-efficiency.
 */
export class ArchitectAgent extends BaseAgent {
    private customTools: DynamicStructuredTool<any>[] | null = null;

    constructor() {
        super({
            name: "architect",
            model_name: process.env.ARCHITECT_MODEL_NAME || "deepseek/deepseek-v4-pro",
            maxTokens: 4096,
            systemPrompt: `You are a Senior Principal Cloud Architect specializing in multi-cloud data engineering.
            Your job is to receive a user request, explore their actual cloud environment using your tools, and design an optimal data pipeline.

            ### YOUR OPERATING PROCEDURE:
            You must follow these steps sequentially:
            
            STEP 1: THINK & PLAN
            Analyze the user's request. Decide which tools you need to query AWS or Azure to see what resources already exist.
            
            STEP 2: EXPLORE (STRICT TOOL LIMITS)
            Call your MCP tools to verify if buckets, databases, or infrastructure actually exist.
            - CRITICAL: You are a PLANNER, not an executor. DO NOT run deep data queries (e.g., Athena SELECT statements) or start ETL jobs. Only check for resource metadata (e.g., list buckets, get tables).
            - EFFICIENCY: Keep tool usage to an absolute minimum (max 3-5 calls). 
            - ERROR HANDLING: If a command fails, do NOT get stuck in an infinite loop trying to fix it. If you cannot find a resource after 2 attempts, assume it does not exist and move on.
            
            STEP 3: STRATEGY SELECTION
            Based on your findings:
            - Select "BROWNFIELD_ETL" if the data/infrastructure already exists and we just need to process it.
            - Select "GREENFIELD" if we need to build everything from scratch.
            - Select "DATA_ANALYSIS" if the user just wants to query or summarize existing data without writing new ETL pipelines.

            STEP 4: FINAL ARCHITECTURE JSON
            Once you have all the information, you must output your final architectural plan as a strict JSON object.
            
            ### JSON SCHEMA CRITERIA:
            Your final output must contain ONLY this JSON object. Do not wrap it in markdown \`\`\`json blocks.
            {
              "strategy": "GREENFIELD" | "BROWNFIELD_ETL" | "DATA_ANALYSIS",
              "plan": "Detailed explanation of the architecture, the tools used, and what scripts need to be written."
            }
            
            IMPORTANT: Stop using tools once you have enough context to populate the JSON. Output the JSON immediately to finish your turn.`,
        });
    }

    public getRunnable() {
        // Automatically fetches the aws-api and azure-catalog tools from your new registry
        const tools = toolManager.getToolsForRole("architect");
        return this.getGraphRunnable(tools);
    }

    public setTools(tools: DynamicStructuredTool<any>[] | null): void {
        this.customTools = tools;
    }
}