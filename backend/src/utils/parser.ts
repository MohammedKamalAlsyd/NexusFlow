import yaml from "js-yaml";
export type OutputFormat = "json" | "yaml" | "text";
import * as fs from 'fs';
import { jsonrepair } from 'jsonrepair';


/**
 * Utility to extract and parse structured data from LLM responses.
 * Supports single strings or arrays of messages/strings.
 */
export class ParserUtils {
    /**
   * The primary entry point. Extracts content from input and parses it.
   * @param input - The raw response (string or array of strings/objects)
   * @param format - The desired output format ('json' | 'yaml' | 'text')
   */
    static extractOutput(input: any, format: OutputFormat) {
        // 1. Unify input into a single string
        const rawText = this.normalizeInput(input);

        if (format === "text") return rawText;

        // 2. Try to find content within markdown code blocks first
        const codeBlockRegex = /```(?:json|yaml|yml)?\s*([\s\S]*?)\s*```/g;
        const matches = [...rawText.matchAll(codeBlockRegex)];

        // If we found code blocks, join them (in case the LLM split the JSON/YAML)
        // Otherwise, attempt to parse the entire raw string
        const cleanText = matches.length > 0
            ? matches.map(m => m[1]).join("\n").trim()
            : rawText.trim();

        return this.parseByFormat(cleanText, format);
    }


    /**
         * Parses a string containing XML-style artifact tags and extracts their contents into an object.
         * 
         * @param text - The raw string response from the LLM containing <artifact filename="..."> blocks.
         * @returns An object where keys are filenames and values contain the artifact body, type, and target.
         * @throws Error if no valid <artifact> tags are found in the input.
         */
    public static extractArtifacts(text: string): Record<string, { body: string; type: string; target: string }> {
        const artifacts: Record<string, { body: string; type: string; target: string }> = {};
        // Match anything between <artifact filename="..."> and </artifact>
        const regex = /<artifact\s+filename="([^"]+)">([\s\S]*?)<\/artifact>/g;

        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
            const filename = match[1] ?? "";
            let body = match[2]?.trim() ?? "";

            // This matches "```typescript", "```yaml", "```json", etc. at the start, and "```" at the end.
            body = body
                .replace(/^```[a-zA-Z0-9-]*\s*\r?\n/i, "") // Remove opening ```lang
                .replace(/\r?\n```\s*$/i, "")              // Remove closing ```
                .trim();

            // Only add to artifacts if filename is valid (not empty)
            if (filename) {
                artifacts[filename] = {
                    body,
                    type: "file",
                    target: "workspace"
                };
            }
        }

        if (Object.keys(artifacts).length === 0) {
            throw new Error("No valid <artifact> tags found in the response.");
        }

        return artifacts;
    }

    /**
    * Logic for specific format parsing
    */
    private static normalizeInput(input: any): string {
        if (!input) return "";

        if (Array.isArray(input)) {
            return input
                .map((item) => {
                    if (typeof item === "string") return item;
                    // Handle LangChain BaseMessage objects or objects with a 'content' field
                    return item.content || JSON.stringify(item);
                })
                .join("\n");
        }

        if (typeof input === "object" && input.content) {
            return input.content;
        }

        return String(input);
    }

    /**
    * Logic for specific format parsing
    */
    private static parseByFormat(text: string, format: OutputFormat) {
        try {
            if (format === "json") {
                try {
                    // 1. Try standard JSON parse for maximum speed
                    return JSON.parse(text);
                } catch (jsonError) {
                    console.warn("⚠️ [ParserUtils] Standard JSON.parse failed. Attempting jsonrepair...");
                    try {
                        // 2. 🛡️ Use jsonrepair to intelligently fix bad escapes, trailing commas, missing quotes, etc.
                        const repairedText = jsonrepair(text);
                        return JSON.parse(repairedText);
                    } catch (repairError) {
                        // 3. Fallback to YAML if it's completely destroyed (extremely rare now)
                        console.warn("⚠️ [ParserUtils] jsonrepair failed. Attempting YAML fallback...");
                        return yaml.load(text);
                    }
                }
            }

            if (format === "yaml") {
                return yaml.load(text);
            }
        } catch (error: any) {
            // Save the raw text for debugging purposes
            fs.writeFileSync("parsing_error_debug.txt", text, "utf-8");
            console.error(`[ParserUtils] Failed to parse as ${format}.`);

            // throw an error so LangGraph can handle it!
            throw new Error(`Parsing failed. Expected ${format}. Raw output saved to parsing_error_debug.txt. Error: ${error.message}`);
        }

        return text;
    }
}