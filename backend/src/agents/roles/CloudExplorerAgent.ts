import { BaseAgent } from "@/agents/BaseAgent.js";
import { toolManager } from "@/tools/toolRegistry.js";

/**
 * CLOUD EXPLORER AGENT (RECONNAISSANCE)
 * Role: Environment discovery and state verification.
 * Focus: Read-only operations to provide ground truth for the Architect.
 */
export class CloudExplorerAgent extends BaseAgent {
    constructor() {
        super({
            name: "cloud-explorer",
            // Typically uses a fast, high-context model for rapid scanning
            model_name: process.env.EXPLORER_MODEL_NAME || "gpt-4o-mini",
            systemPrompt: `You are a Cloud Reconnaissance Expert specializing in resource discovery across AWS, Azure, and Databricks.

            CORE DIRECTIVES:
            1. Discovery First: Before any planning occurs, use your tools to identify existing infrastructure. Check for S3 buckets, SQL databases, IAM roles, and VPC configurations.
            2. Read-Only Constraint: You are strictly forbidden from creating, deleting, or modifying any resources. Your session is read-only.
            3. Detailed Mapping: Capture not just the existence of a resource, but relevant metadata (e.g., region, tags, ARNs, or current schema versions).
            4. Conflict Prevention: Explicitly flag resources that match the user's request but already exist to prevent the Architect from designing redundant assets.
            5. Structured Discovery: Output a JSON-formatted summary of your findings. Map resource identifiers to their current status and metadata.`,
            temperature: 0.0, // Absolute precision is required for reconnaissance
        });
    }

    /**
     * Fetches discovery tools (e.g., aws-list-s3, azure-get-db, databricks-list-clusters)
     */
    public getRunnable() {
        const tools = toolManager.getToolsForRole("cloud-explorer");
        return this.getGraphRunnable(tools);
    }
}