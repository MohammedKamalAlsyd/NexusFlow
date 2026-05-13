import { SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { BaseAgent } from "@/agent/BaseAgent.js";
import { AgentState } from "@/agent/state.js";

// Define the routing schema
const routingSchema = z.object({
  next: z.enum(["software-engineer", "data-ops", "devops", "FINISH"]),
});

export class SupervisorAgent extends BaseAgent {
  constructor() {
    super({
      name: "supervisor",
      systemPrompt: `You are a Supervisor orchestrating a Self-Healing Data Infrastructure task.
You manage the following workers:
- 'software-engineer': Modifies local code, runs tests, searches codebase.
- 'data-ops': Interacts with databases via MCP tools, identifies schema drift, summarizes data anomalies.
- 'devops': Handles git operations, commits, and PRs via GitHub MCP.

If the user request is resolved or no further actions are needed, respond with FINISH.
Otherwise, respond with the name of the next specialist agent required to progress the task.`,
      temperature: 0.1, // Very low temperature for consistent routing
    });
  }

  /**
   * Unlike specialist agents, the supervisor uses a structured output chain
   * instead of a ReAct agent loop.
   */
  public async route(state: typeof AgentState.State) {
    const supervisorChain = this.llm.withStructuredOutput(routingSchema);


    try {
      const messages = [
        new SystemMessage(this.systemPrompt),
        ...state.messages,
      ];
      const response = await supervisorChain.invoke(messages);
      return { next: response.next };
    } catch (e) {
      console.error("Supervisor JSON parsing failed, defaulting to FINISH", e);
      return { next: "FINISH" };
    }
  }
}