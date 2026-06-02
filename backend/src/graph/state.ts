import { BaseMessage } from "@langchain/core/messages";
import { Annotation } from "@langchain/langgraph";

/**
 * The shared memory for the agentic workflow.
 */
export const AgentState = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
        reducer: (curr, next) => curr.concat(next),
        default: () => [],
    }),
    // ==========================================
    // UI VISUALIZATION TRACKING
    // ==========================================
    // Tracks the exact node currently executing so the UI can highlight it
    currentStep: Annotation<string>({
        reducer: (curr, next) => next ?? curr,
        default: () => "reception",
    }),

    // Diagram data in React Flow format to visualize the architecture plan. Updated by DiagramGeneratorAgent and read by the Frontend.
    diagram: Annotation<{ nodes: any[], edges: any[] }>({
        reducer: (curr, next) => next ?? curr,
        default: () => ({ nodes: [], edges: [] }),
    }),

    // ==========================================
    // CONTEXT & DISCOVERY
    // ==========================================
    // Stores data about existing cloud infra (e.g., existing buckets, schemas)
    environmentContext: Annotation<Record<string, any>>({
        reducer: (curr, next) => ({ ...curr, ...next }),
        default: () => ({}),
    }),
    // Determines the branch the graph will take
    executionStrategy: Annotation<"GREENFIELD" | "BROWNFIELD_ETL" | "DATA_ANALYSIS" | "PENDING">({
        reducer: (curr, next) => next ?? curr,
        default: () => "PENDING",
    }),

    // ==========================================
    // ARTIFACTS & EXECUTION
    // ==========================================
    cloudPlan: Annotation<any>({
        reducer: (curr, next) => next ?? curr,
        default: () => null,
    }),
    // physical folder path where tools will create/edit files
    workspacePath: Annotation<string>({
        reducer: (curr, next) => next ?? curr,
        default: () => "",
    }),
    // Captured logs from Validator or Pulumi deployment
    validationErrors: Annotation<string | null>({
        reducer: (curr, next) => next,
        default: () => null,
    }),
    // Tracks if deployment was successful to end the graph
    deploymentStatus: Annotation<"PENDING" | "SUCCESS" | "FAILED" | "FATAL_ERROR">({
        reducer: (curr, next) => next ?? curr,
        default: () => "PENDING",
    }),
    // Retry count for handling transient errors and implementing backoff strategies
    retryCount: Annotation<number>({
        reducer: (curr, next) => curr + (next ?? 1),
        default: () => 0,
    }),
});