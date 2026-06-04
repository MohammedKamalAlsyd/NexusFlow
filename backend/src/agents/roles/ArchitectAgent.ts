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
            model_name: process.env.ARCHITECT_MODEL_NAME || "meta-llama/llama-3.1-70b-instruct", // Defaulted to Llama 3.1 70B
            maxTokens: 4096,
            systemPrompt: `You are a Senior Principal Cloud Architect specializing in multi-cloud data engineering.
            Your job is to receive a user request, explore their actual cloud environment using your tools, and design an optimal data pipeline.

            ### YOUR OPERATING PROCEDURE:
            STEP 1: EXPLORE
            Call your MCP tools to verify if buckets, databases, or infrastructure actually exist. Keep tool usage to an absolute minimum (max 3-5 calls).
            
            STEP 2: STRATEGY SELECTION
            - "BROWNFIELD_ETL": Data/infrastructure exists; we need to process it.
            - "GREENFIELD": Build everything from scratch.
            - "DATA_ANALYSIS": Query/summarize existing data (no new ETL/infra).

            STEP 3: FINAL ARCHITECTURE JSON
            You must output your final architectural plan as a strict JSON object.
            
            🚨 CRITICAL JSON FORMATTING RULES 🚨
            1. You MUST output ONLY valid, raw JSON. 
            2. Do NOT wrap the JSON in markdown blocks (e.g., no \`\`\`json).
            3. Do NOT output ANY conversational text, preamble, or postscript. Do NOT say "Here is the plan".
            4. Start your response EXACTLY with { and end EXACTLY with }.
            5. Escape all internal quotes and newlines properly.
            
            REQUIRED SCHEMA:
            {
              "strategy": "GREENFIELD" | "BROWNFIELD_ETL" | "DATA_ANALYSIS",
              "plan": "Detailed explanation of the architecture, tools, and scripts."
            }
            
            You have access to tools for multiple cloud providers (AWS, Azure, GCP). CRITICAL: You must ONLY use the tools that match the cloud provider requested by the user. Do not call Azure tools for an AWS task, and do not call AWS tools for an Azure task. Do not perform generic environment sweeps of unrelated cloud providers.
            `,
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