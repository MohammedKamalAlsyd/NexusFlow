import * as dotenv from "dotenv";
import path from "node:path";
import { ArchitectAgent } from "@/agents/roles/ArchitectAgent.js";
import { runAgentTest } from "@/testing/utils/agent-runner.js";
import { initializeMcpServers } from "@/mcp/index.js";
import { mcpManager } from "@/mcp/client.js";

dotenv.config({ path: path.join(process.cwd(), '.env') });

const ARCHITECT_TESTS = [
    // {
    //     name: "1. AWS Discovery - List S3 Buckets",
    //     prompt: "Use your aws-api tool to list all S3 buckets in the current account. Just tell me their names."
    // },
    // {
    //     name: "2. AWS Discovery - Check for RDS Instances",
    //     prompt: "Check if there are any existing Amazon RDS instances in the environment using your AWS tools."
    // },
    {
        name: "3. Azure Discovery - List Resource Groups",
        prompt: "Use your azure-catalog tool to list all Azure Resource Groups available in the current subscription."
    },
    {
        name: "4. Cross-Cloud Discovery",
        prompt: "Check BOTH AWS (for S3 buckets) and Azure (for Storage Accounts). Give me a brief summary of what data storage exists across both clouds."
    },
    {
        name: "5. Planning - Read AWS Documentation",
        prompt: "Look up the AWS documentation for 'AWS Glue Job'. I need to know the required parameters for creating a PySpark job. Don't write code, just summarize the required arguments."
    },
    {
        name: "6. Output Formatting - Strict JSON Generation",
        prompt: `This is a final planning phase test. 
        Assume you discovered an S3 bucket named 'sales-raw', but no ETL jobs exist.
        Generate your final architectural plan for a PySpark ETL job that cleans this data.
        Remember your CORE DIRECTIVE #4: Output GREENFIELD or BROWNFIELD_ETL strategy, and your output MUST be a raw JSON object ONLY, with no markdown formatting or conversation.`
    }
];

async function runAll() {
    console.log("🚀 Starting Architect Agent Unit Tests...");
    
    // 1. Initialize MCP (Required so Architect has access to AWS/Azure tools)
    await initializeMcpServers();

    // 2. Instantiate Agent
    const architect = new ArchitectAgent();
    const runner = architect.getRunnable();

    // 3. Run Tests sequentially
    for (const test of ARCHITECT_TESTS) {
        const proceed = await runAgentTest(
            architect.name,
            runner,
            test.name,
            test.prompt
        );
        
        if (!proceed) {
            console.log("🛑 Testing aborted by user.");
            break;
        }
    }

    // 4. Cleanup
    await mcpManager.disconnectAll();
    console.log("✅ Architect Agent testing complete.");
    process.exit(0);
}

runAll();