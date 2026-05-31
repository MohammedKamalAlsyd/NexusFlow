import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { confirm } from "@inquirer/prompts";
import type { RunnableConfig } from "@langchain/core/runnables";

/**
 * Runs a specific agent against a prompt, extracts tool calls, 
 * formats the output, and returns the full state response.
 */
export async function runAgentTest(
    agentName: string,
    runnable: any,
    testName: string,
    prompt: string,
    autoApprove: boolean = false,
    config?: RunnableConfig
): Promise<any | null> {
    console.log(`\n======================================================`);
    console.log(`🧪 TEST: ${testName}`);
    console.log(`🤖 AGENT: ${agentName}`);
    console.log(`📝 PROMPT: ${prompt}`);
    console.log(`======================================================\n`);
    console.log(`⏳ Executing... Please wait (this might take a moment if MCP tools are called).`);

    try {
        // Pass the tracing callbacks down to the underlying LLM/Graph
        const response = await runnable.invoke({
            messages: [{ role: "user", content: prompt }]
        }, config);

        const messages = response.messages;

        console.log(`\n--- 🛠️  TOOL CALLS ---`);
        let toolCallCount = 0;

        for (const msg of messages) {
            if (msg instanceof AIMessage && msg.tool_calls && msg.tool_calls.length > 0) {
                msg.tool_calls.forEach((tool) => {
                    toolCallCount++;
                    console.log(`\n🔹 Tool Called: ${tool.name}`);
                    console.log(`   Arguments: ${JSON.stringify(tool.args, null, 2)}`);
                });
            } else if (msg instanceof ToolMessage) {
                const contentStr = String(msg.content);
                const truncated = contentStr.length > 500 ? contentStr.substring(0, 500) + `\n... [TRUNCATED, TOTAL LENGTH: ${contentStr.length}]` : contentStr;
                console.log(`   Result: ${truncated}`);
            }
        }

        if (toolCallCount === 0) {
            console.log("No tools were called by the agent.");
        }

        console.log(`\n--- 🗣️  FINAL AGENT OUTPUT ---`);
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.content) {
            console.log(lastMessage.content);
        } else {
            console.log("(No final text output)");
        }

        console.log(`\n------------------------------------------------------`);

        if (autoApprove) {
            console.log(`✅ Auto-proceeding to next step...`);
            return response;
        }

        const shouldContinue = await confirm({ message: 'Proceed to next test?', default: true });
        return shouldContinue ? response : null;

    } catch (error: any) {
        console.error(`\n❌ TEST FAILED: ${error.message}`);
        console.error(error);
        return null;
    }
}