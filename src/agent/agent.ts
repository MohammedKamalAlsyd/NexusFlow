import { ChatOpenAI } from "@langchain/openai";
import * as dotenv from "dotenv";
import type { AgentResponse } from "@/types/agent.types.js";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), '.env') });

export async function runAgent(input: string): Promise<AgentResponse> {
    // loading Env
    const apiKey = String(process.env.OPENROUTER_API_KEY)
    const modelName = String(process.env.MODEL_NAME)
    const baseURL = String(process.env.OPENROUTER_BASE_URL)
    const appUrl = String(process.env.APP_URL)

    // Check for Env
    const missingVars = [];
    if (!apiKey) missingVars.push("apiKey");
    if (!modelName) missingVars.push("modelName");
    if (!baseURL) missingVars.push("baseURL");
    if (!appUrl) missingVars.push("appUrl");

    if (missingVars.length > 0) {
        throw new Error(
            `Configuration Error: Missing required environment variables: ${missingVars.join(", ")}. ` +
            "Check your .env file or deployment settings."
        );
    }

    // Agent Defination & Calling

    try {
        const llm = new ChatOpenAI({
            modelName: modelName,
            apiKey: apiKey,
            temperature: 0.2,
            maxTokens: 4096,
            configuration: {
                baseURL: baseURL,
                defaultHeaders: {
                    Authorization: `Bearer ${apiKey}`,
                    "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
                    "X-Title": "Agentic Code Assistant",
                },
            },
        });

        const response = await llm.invoke([
            {
                role: "system",
                content: `You are a senior software engineer. 
                        When suggesting code changes:
                        1. Prioritize safety and security.
                        2. Aim for minimal code changes to achieve the goal.
                        3. Explain your reasoning briefly.`,
            },
            {
                role: "user",
                content: input,
            },
        ]) as any;

        // Mapping the data
        const meta = response.response_metadata;
        const usage = response.usage_metadata;

        return {
            content: String(response.content),
            usage: {
                inputTokens: usage?.input_tokens ?? 0,
                outputTokens: usage?.output_tokens ?? 0,
                totalTokens: usage?.total_tokens ?? 0,
                inputDetails: usage?.input_token_details,
                outputDetails: usage?.output_token_details,
            },
            metadata: {
                id: (response.id as string) ?? "",
                // Cast meta fields to string, ensuring we handle potential objects
                finishReason: meta?.finish_reason ? String(meta.finish_reason) : null,
                modelProvider: meta?.model_provider ? String(meta.model_provider) : null,
                modelName: meta?.model_name ? String(meta.model_name) : modelName,
                raw: response,
            },
        };
    } catch (error) {
        console.error("Error in runAgent:", error);
        throw new Error(
            `Agent failed to process request: ${error instanceof Error ? error.message : String(error)
            }`
        );
    }
}

runAgent('say hi')