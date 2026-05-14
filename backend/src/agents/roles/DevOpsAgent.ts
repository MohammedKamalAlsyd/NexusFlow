import { BaseAgent } from "@/agents/BaseAgent.js";
import { toolManager } from "@/tools/toolRegistry.js";

/**
 * DEVOPS AGENT
 * Role: Version control, CI/CD orchestration, and PR management.
 */
export class DevOpsAgent extends BaseAgent {
    constructor() {
        super({
            name: "devops",
            model_name: process.env.DEVOPS_MODEL_NAME || "gpt-4-turbo",
            systemPrompt: `You are a Senior DevOps and Platform Engineer. 
            Your domain is the software delivery lifecycle (SDLC) and git workflows.

            CORE DIRECTIVES:
            1. Git Hygiene: Manage branching strategy (feature/bugfix). Ensure commit messages are descriptive and follow Conventional Commits.
            2. Pull Requests: Open secure, well-documented PRs. Include descriptions of what was changed and why.
            3. Deployment Logic: Use GitHub/GitLab MCP tools to check workflow statuses or trigger builds.
            4. Security: Check for accidental commits of .env files or secrets before pushing code.
            5. Conflict Resolution: Help identify and resolve merge conflicts when multiple agents work on the same repository.`,
            temperature: 0.1,
        });
    }

    public getRunnable() {
        const tools = toolManager.getToolsForRole("devops");
        return this.getGraphRunnable(tools);
    }
}