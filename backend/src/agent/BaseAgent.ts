import { ChatOpenAI } from "@langchain/openai";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { StateGraph, START, END, MessagesAnnotation } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AIMessage } from "@langchain/core/messages";
import * as dotenv from "dotenv";
import path from "node:path";
import type { AgentResponse } from "@/types/agent.types.js";

dotenv.config({ path: path.join(process.cwd(), '.env') });

export interface AgentConfig {
    name: string;
    systemPrompt: string;
    temperature?: number;
    maxTokens?: number;
}

export class BaseAgent {
    public readonly name: string;
    public readonly systemPrompt: string;
    protected llm: ChatOpenAI;

    constructor(config: AgentConfig) {
        this.name = config.name;
        this.systemPrompt = config.systemPrompt;

        // 1. Load and Validate Env Variables
        const apiKey = String(process.env.OPENROUTER_API_KEY || "");
        const modelName = String(process.env.MODEL_NAME || "");
        const baseURL = String(process.env.OPENROUTER_BASE_URL || "");
        const appUrl = String(process.env.APP_URL || "");

        const missingVars = [];
        if (!apiKey) missingVars.push("OPENROUTER_API_KEY");
        if (!modelName) missingVars.push("MODEL_NAME");
        if (!baseURL) missingVars.push("OPENROUTER_BASE_URL");
        if (!appUrl) missingVars.push("APP_URL");

        if (missingVars.length > 0) {
            throw new Error(
                `Configuration Error: Missing required environment variables: ${missingVars.join(", ")}. ` +
                "Check your .env file."
            );
        }

        // 2. Initialize the shared LLM Backbone
        this.llm = new ChatOpenAI({
            modelName: modelName,
            apiKey: apiKey,
            temperature: config.temperature ?? 0.2,
            maxTokens: config.maxTokens ?? 4096,
            configuration: {
                baseURL: baseURL,
                defaultHeaders: {
                    Authorization: `Bearer ${apiKey}`,
                    "HTTP-Referer": appUrl,
                    "X-Title": "Agentic AIOps Platform",
                },
            },
        });
    }

    /**
     * Executes a raw string query and returns a strictly typed AgentResponse.
     * Useful for direct one-off questions without tools.
     */
    public async invokeRaw(input: string): Promise<AgentResponse> {
        try {
            const response = await this.llm.invoke([
                { role: "system", content: this.systemPrompt },
                { role: "user", content: input },
            ]) as any;

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
                    finishReason: meta?.finish_reason ? String(meta.finish_reason) : null,
                    modelProvider: meta?.model_provider ? String(meta.model_provider) : null,
                    modelName: meta?.model_name ? String(meta.model_name) : this.llm.model,
                    raw: response,
                },
            };
        } catch (error) {
            console.error(`Error in ${this.name} invokeRaw:`, error);
            throw new Error(`Agent [${this.name}] failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Returns a LangGraph-compatible worker agent equipped with tools.
     * Manually constructs the StateGraph to replace the deprecated createReactAgent.
     */
    public getGraphRunnable(tools: DynamicStructuredTool<any>[]) {
        // 1. Create a node to execute tools
        const toolNode = new ToolNode(tools);

        // 2. Bind tools to the LLM so it knows what it can call
        const modelWithTools = this.llm.bindTools(tools);

        // 3. Define the Graph Workflow
        const workflow = new StateGraph(MessagesAnnotation)
            .addNode("agent", async (state) => {
                const response = await modelWithTools.invoke([
                    { role: "system", content: this.systemPrompt },
                    ...state.messages
                ]);
                return { messages: [response] };
            })
            .addNode("tools", toolNode)

            // Define the flow
            .addEdge(START, "agent")
            .addConditionalEdges("agent", (state) => {
                const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
                // Check if the LLM decided to invoke a tool
                if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
                    return "tools";
                }
                // If no tool was called, we are finished
                return END;
            })
            .addEdge("tools", "agent"); // Loop back to agent after tool execution

        // 4. Compile and return the executable graph
        return workflow.compile();
    }
}