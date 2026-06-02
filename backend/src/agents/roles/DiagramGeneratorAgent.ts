// backend/src/agents/roles/DiagramGeneratorAgent.ts
import { BaseAgent } from "@/agents/BaseAgent.js";

export class DiagramGeneratorAgent extends BaseAgent {
    constructor() {
        super({
            name: "diagram-generator",
            // Use a very fast/cheap model for this secondary task
            model_name: process.env.DIAGRAM_MODEL_NAME || "deepseek/deepseek-v4-flash",
            maxTokens: 1024,
            systemPrompt: `You are an expert Frontend Data Visualization Agent.
            Your job is to read a cloud architecture plan and convert it into a valid JSON object compatible with React Flow.
            
            RULES:
            1. Extract the main resources (e.g., S3 buckets, Glue Jobs, Azure Data Factory, etc.).
            2. Map them into a sequence of nodes (from left to right). Increment the 'x' position by 200 for each step.
            3. Create connecting edges.
            4. Output ONLY the JSON object. Do NOT wrap it in markdown blockquotes.
            
            REQUIRED JSON SCHEMA:
            {
              "nodes": [
                {
                  "id": "node-1",
                  "position": { "x": 0, "y": 80 },
                  "data": { "label": "🪣 Source S3" },
                  "style": { "background": "#ffffff", "border": "2px solid #6366f1", "padding": "12px", "borderRadius": "12px" }
                }
              ],
              "edges": [
                {
                  "id": "e1",
                  "source": "node-1",
                  "target": "node-2",
                  "animated": true,
                  "style": { "stroke": "#6366f1", "strokeWidth": 2 }
                }
              ]
            }`,
            temperature: 0.1,
        });
    }

    // A helper method to parse the model's text output cleanly
    public async generateReactFlowJSON(cloudPlan: string) {
        const response = await this.llm.invoke([
            { role: "system", content: this.systemPrompt },
            { role: "user", content: `Generate a React Flow diagram for this architecture plan:\n${cloudPlan}` }
        ]);

        let rawOutput = String(response.content).trim();
        rawOutput = rawOutput.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        rawOutput = rawOutput.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

        try {
            return JSON.parse(rawOutput);
        } catch (error) {
            console.warn("⚠️ Failed to parse Diagram JSON, returning empty canvas.");
            return { nodes: [], edges: [] };
        }
    }
}