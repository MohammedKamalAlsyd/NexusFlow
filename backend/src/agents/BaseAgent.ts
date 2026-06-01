import { ChatOpenAI } from "@langchain/openai";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { StateGraph, START, END, MessagesAnnotation } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AIMessage } from "@langchain/core/messages";
import * as dotenv from "dotenv";
import path from "node:path";
import type { AgentConfig } from "@/types/index.js";
dotenv.config({ path: path.join(process.cwd(), '.env') });

// Shared guidelines to prevent LLMs from over-engineering
const SYSTEM_GOLDEN_RULES = `

### PRINCIPLE OF MINIMAL COMPLEXITY (Occam's Razor):
To ensure reliable, fail-safe executions, you must always choose the simplest working architecture.

1. DATA INGESTION & STORAGE:
   - SIMPLE (Preferred): Read/write directly from S3 or Blob URIs (e.g., 'spark.read.csv("s3://bucket/raw/")'). It is completely stateless and has zero execution dependencies.
   - COMPLEX (Avoid): Relying on Glue Crawlers, Databases, or the Data Catalog to read data. Crawlers introduce asynchronous execution steps and cold-start dependencies that easily fail.
   - RULE: Only use a Catalog Table if the discovery tools confirm it already exists and is populated. Otherwise, use direct S3 paths.

2. INFRASTRUCTURE SCALABILITY:
   - SIMPLE (Preferred): Deploy serverless resources natively with standard defaults (e.g., S3 buckets, serverless Glue, native IAM policies).
   - COMPLEX (Avoid): Creating custom VPCs, private subnets, NAT Gateways, or redundant Security Groups unless the user request strictly demands private networking.

3. STATE & PROCESS POLLING:
   - SIMPLE (Preferred): When monitoring jobs, pause/sleep between status checks. Run command delays (e.g., sleep 30) so you do not hit API rate-limits or exhaust your maximum agent turns.
   - COMPLEX (Avoid): Running tight, continuous polling loops that flood the cloud APIs.
`;

export class BaseAgent {
    public readonly name: string;
    public systemPrompt: string;
    public readonly model_name: string;
    protected llm: ChatOpenAI;

    constructor(config: AgentConfig) {
        this.name = config.name;
        this.model_name = config.model_name;

        // Automatically append simplicity guidelines to the system prompt of every agent
        this.systemPrompt = `${config.systemPrompt}\n${SYSTEM_GOLDEN_RULES}`;

        // 1. Load and Validate Env Variables
        const apiKey = String(process.env.OPENROUTER_API_KEY || "");
        const baseURL = String(process.env.OPENROUTER_BASE_URL || "");
        const appUrl = String(process.env.APP_URL || "");

        const missingVars = [];
        if (!apiKey) missingVars.push("OPENROUTER_API_KEY");
        if (!this.model_name) missingVars.push("MODEL_NAME");
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
            modelName: this.model_name,
            apiKey: apiKey,
            temperature: config.temperature ?? 0.2,
            maxTokens: config.maxTokens ?? 1024,
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

    public get model() {
        return this.llm;
    }

    public setSystemPrompt(newPrompt: string): void {
        // Keeps the Golden Rules intact even when we overwrite prompts during unit testing
        this.systemPrompt = `${newPrompt}\n${SYSTEM_GOLDEN_RULES}`;
    }
}