import yaml from "js-yaml";
export type OutputFormat = "json" | "yaml" | "text";
import * as fs from 'fs';


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
                // Remove common LLM artifacts like trailing commas or non-standard comments if needed
                return JSON.parse(text);
            }

            if (format === "yaml") {
                return yaml.load(text);
            }
        } catch (error) {
            // Saving The raw text for debugging purposes before exiting
            fs.writeFileSync("parsing_error_debug.txt", text, "utf-8");
            process.exit(1);
            console.error(`[ParserUtils] Failed to parse as ${format}.Raw text: `, text);
            // Fallback: if parsing fails, return the raw text to avoid crashing the workflow
            return text;
        }

        return text;
    }
}