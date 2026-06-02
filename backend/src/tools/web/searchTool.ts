// backend/src/tools/web/searchTool.ts
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { tavily } from "@tavily/core";
import { approvalEmitter } from "@/safety/interactivity.js";

export const webSearchTool = tool(
    async ({ query }) => {
        const apiKey = process.env.TAVILY_API_KEY;

        if (!apiKey) {
            return `System Error: Web search is currently disabled because TAVILY_API_KEY is not set in the backend environment.`;
        }

        // Real-time telemetry log
        approvalEmitter.emit("system_log", `🌐 [WEB]: Fetching internet search results for query: "${query}"...`);

        try {
            const tvly = tavily({ apiKey });
            const response = await tvly.search(query, {
                searchDepth: "basic", // or "advanced" for deeper research
                maxResults: 3
            });

            // If the structure returns a result array, format it cleanly for the LLM context
            if (response && response.results) {
                const formattedResults = response.results
                    .map((res: any, index: number) => `[${index + 1}] ${res.title}\nURL: ${res.url}\nSnippet: ${res.content}\n`)
                    .join("\n");

                return `Search Results for "${query}":\n\n${formattedResults}`;
            }

            return `No meaningful results returned for: "${query}"`;
        } catch (error: any) {
            return `Search failed via Tavily: ${error.message}`;
        }
    },
    {
        name: "search_web",
        description: "Searches the internet for up-to-date documentation, API references, or code solutions.",
        schema: z.object({
            query: z.string().describe("The search query (e.g., 'Pulumi AWS Glue Job extra_py_files syntax')"),
        }),
    }
);