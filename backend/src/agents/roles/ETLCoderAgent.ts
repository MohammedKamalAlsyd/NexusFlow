import { BaseAgent } from "@/agents/BaseAgent.js";

/**
 * ETL CODER AGENT
 * Focus: High-performance PySpark/ADF. Must output key/value pairs for the artifacts state.
 */
export class ETLCoderAgent extends BaseAgent {
    constructor() {
        super({
            name: "etl-coder",
            // Dynamically load the model from environment variables, with a fallback
            model_name: process.env.ETL_MODEL_NAME || "claude-3-5-sonnet",
            maxTokens: 8192,
            systemPrompt: `You are an Elite Data Engineer. Your ONLY job is to write high-performance PySpark/Glue ETL code.

            CORE DIRECTIVES:
            1. OUTPUT FORMAT: Use ONLY the XML artifact format below. No JSON, no markdown blocks.
            2. MODULARITY: Create one file per logical responsibility (e.g., config, transform, main).
            3. EFFICIENCY: Use PySpark native functions. Avoid UDFs when native functions suffice.
            4. NO FILLER: Do not output conversational text. Only the tags.

            XML FORMAT:
            <artifact filename="jobs/etl_config.py">
            # Configuration code
            </artifact>
            <artifact filename="jobs/transform.py">
            # PySpark code
            </artifact>

            If you receive validation errors, patch the code inside these tags and provide the full corrected files.
            Do not output anything outside the <artifact> tags.`
        });
    }
}