import { BaseMessage } from "@langchain/core/messages";
import { Annotation } from "@langchain/langgraph";

/**
 * The shared memory for the agentic workflow.
 */
export const AgentState = Annotation.Root({
    // Append new messages to the existing list
    messages: Annotation<BaseMessage[]>({
        reducer: (currentState, newMessages) => currentState.concat(newMessages),
        default: () => [],
    }),
    // Tracks the next agent to route to, or "FINISH"
    next: Annotation<string>({
        reducer: (currentState, newValue) => newValue ?? currentState,
        default: () => "supervisor",
    }),
});