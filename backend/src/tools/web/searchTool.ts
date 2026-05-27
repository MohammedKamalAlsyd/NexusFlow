import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { DuckDuckGoSearch } from "@langchain/community/tools/duckduckgo_search";

const ddg = new DuckDuckGoSearch({ maxResults: 3 });

export const webSearchTool = tool(
    async ({ query }) => {
        try {
            const results = await ddg.invoke(query);
            return `Search Results for "${query}":\n${results}`;
        } catch (error: any) {
            return `Search failed: ${error.message}`;
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