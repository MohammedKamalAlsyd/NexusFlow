import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState } from "@/agent/state.js"; // Importing the Annotation.Root we defined
import { SupervisorAgent } from "@/agent/supervisor.js";
import { SoftwareEngineerAgent, DataOpsAgent, DevOpsAgent } from "@/agent/roles/SpecialistAgents.js";

// 1. Initialize our specialized agents
// These classes now handle their own tools, prompt, and LLM backbone
const sweAgent = new SoftwareEngineerAgent();
const dataOpsAgent = new DataOpsAgent();
const devOpsAgent = new DevOpsAgent();
const supervisorAgent = new SupervisorAgent();

/**
 * Node: Software Engineer Agent
 * Responsible for local FS, searching, and fixing code.
 */
const softwareEngineerNode = async (state: typeof AgentState.State) => {
    const runner = sweAgent.getRunnable();
    const result = await runner.invoke({ messages: state.messages });
    // We append the result of the agent's work to the history
    return { messages: [result.messages[result.messages.length - 1]] };
};

/**
 * Node: Data Ops Agent
 * Responsible for database querying and schema validation via MCP.
 */
const dataOpsNode = async (state: typeof AgentState.State) => {
    const runner = dataOpsAgent.getRunnable();
    const result = await runner.invoke({ messages: state.messages });
    return { messages: [result.messages[result.messages.length - 1]] };
};

/**
 * Node: DevOps Agent
 * Responsible for Git and GitHub PR management via MCP.
 */
const devOpsNode = async (state: typeof AgentState.State) => {
    const runner = devOpsAgent.getRunnable();
    const result = await runner.invoke({ messages: state.messages });
    return { messages: [result.messages[result.messages.length - 1]] };
};

/**
 * Node: Supervisor Agent
 * The Supervisor Node now just calls the route method
 */
const supervisorNode = async (state: typeof AgentState.State) => {
    return await supervisorAgent.route(state);
};


// 2. Build the Workflow Graph
const workflow = new StateGraph(AgentState)
    .addNode("supervisor", supervisorNode)
    .addNode("software-engineer", softwareEngineerNode)
    .addNode("data-ops", dataOpsNode)
    .addNode("devops", devOpsNode)

    // Start at the supervisor
    .addEdge(START, "supervisor")

    // The supervisor decides who goes next based on the 'next' field in State
    .addConditionalEdges(
        "supervisor",
        (state) => state.next,
        {
            "software-engineer": "software-engineer",
            "data-ops": "data-ops",
            "devops": "devops",
            "FINISH": END,
        }
    )

    // After a worker completes a task, they MUST return to the supervisor 
    // to evaluate if the task is "FINISH" or if another agent needs to step in.
    .addEdge("software-engineer", "supervisor")
    .addEdge("data-ops", "supervisor")
    .addEdge("devops", "supervisor");

// 3. Compile the graph into an executable runnable
export const appGraph = workflow.compile();