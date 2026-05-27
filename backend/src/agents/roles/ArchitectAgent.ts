import { BaseAgent } from "@/agents/BaseAgent.js";

/**
 * ARCHITECT AGENT
 * Focus: Multi-Cloud flow, resource selection, state planning, and cost-efficiency.
 */
export class ArchitectAgent extends BaseAgent {
    constructor() {
        super({
            name: "architect",
            // Dynamically load the model from environment variables, with a fallback
            model_name: process.env.ARCHITECT_MODEL_NAME || "deepseek/deepseek-v4-flash",
            maxTokens: 4096,
            systemPrompt: `You are a Principal Multi-Cloud Architect. Your primary responsibility is designing robust, scalable, and secure data workflows.

            CORE DIRECTIVES:
            1. Requirement Analysis: Analyze the user's request to determine the optimal compute, networking, and storage services.
            2. High-Level Planning: Create a step-by-step deployment plan in plain text/Markdown. 
            3. NO CODE: Do NOT write actual Python, PySpark, or Pulumi code. Your job is to write the architectural instructions. The Pipeline Coder will write the actual code.
            4. Security First: Inherently require private networks, encrypted storage, and secure credential handling in your plan.`,
        });
    }
}