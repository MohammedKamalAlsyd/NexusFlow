import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { confirm } from "@inquirer/prompts";

/**
 * Runs a specific agent against a prompt, extracts tool calls, 
 * and formats the output for easy human review.
 */
export async function runAgentTest(
    agentName: string,
    runnable: any,
    testName: string,
    prompt: string
): Promise<boolean> {
    console.log(`\n======================================================`);
    console.log(`🧪 TEST: ${testName}`);
    console.log(`🤖 AGENT: ${agentName}`);
    console.log(`📝 PROMPT: ${prompt}`);
    console.log(`======================================================\n`);
    console.log(`⏳ Executing... Please wait (this might take a moment if MCP tools are called).`);

    try {
        const response = await runnable.invoke({
            messages: [{ role: "user", content: prompt }]
        });

        const messages = response.messages;

        console.log(`\n--- 🛠️  TOOL CALLS ---`);
        let toolCallCount = 0;

        // Iterate through all messages to find tool invocations and results
        for (const msg of messages) {
            if (msg instanceof AIMessage && msg.tool_calls && msg.tool_calls.length > 0) {
                msg.tool_calls.forEach((tool) => {
                    toolCallCount++;
                    console.log(`\n🔹 Tool Called: ${tool.name}`);
                    console.log(`   Arguments: ${JSON.stringify(tool.args, null, 2)}`);
                });
            } else if (msg instanceof ToolMessage) {
                // To keep logs clean, we truncate massive tool outputs (like AWS API full JSON)
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
        
        // Wait for user to review before continuing
        const shouldContinue = await confirm({ message: 'Proceed to next test?', default: true });
        return shouldContinue;

    } catch (error: any) {
        console.error(`\n❌ TEST FAILED: ${error.message}`);
        console.error(error);
        const shouldContinue = await confirm({ message: 'Error occurred. Proceed to next test anyway?', default: false });
        return shouldContinue;
    }
}