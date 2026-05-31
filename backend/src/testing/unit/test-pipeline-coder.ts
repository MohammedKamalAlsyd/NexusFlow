import * as dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs/promises";
import { PipelineCoderAgent } from "@/agents/roles/PipelineCoderAgent.js";
import { runAgentTest } from "@/testing/utils/agent-runner.js";
import { configManager } from "@/config/index.js";
import { initializeMcpServers } from "@/mcp/index.js";
import { mcpManager } from "@/mcp/client.js";
import { langfuseHandler, otelSDK } from "@/tracing/index.js";

// Configure testing variables
process.env.NEXUSFLOW_TEST_MODE = "true";
dotenv.config({ path: path.join(process.cwd(), '.env') });

const WORKSPACE_PREFIX = "nexusflow-coder-test-";
let workspaceRoot: string;
let activeWorkspaces: string[] = [];

// ============================================================
// WORKSPACE GARBAGE COLLECTOR
// ============================================================
async function runGarbageCollector() {
    workspaceRoot = configManager.config.safety.workspaceRoot;
    console.log("🔍 [GC] Checking for leftover local workspaces...");
    try {
        await fs.mkdir(workspaceRoot, { recursive: true });
        const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });

        let cleaned = 0;
        for (const entry of entries) {
            if (entry.isDirectory() && entry.name.startsWith(WORKSPACE_PREFIX)) {
                const dirPath = path.join(workspaceRoot, entry.name);
                await fs.rm(dirPath, { recursive: true, force: true });
                cleaned++;
            }
        }
        if (cleaned > 0) {
            console.log(`♻️ [GC] Scrubbed ${cleaned} orphaned workspace(s).`);
        } else {
            console.log("🔍 [GC] No leftovers found.");
        }
    } catch (err: any) {
        console.warn(`⚠️ [GC] Cleanup error: ${err.message}`);
    }
}

async function teardownActiveWorkspaces() {
    console.log(`\n🧹 [TEARDOWN] Removing ${activeWorkspaces.length} test workspaces...`);
    for (const ws of activeWorkspaces) {
        try {
            await fs.rm(ws, { recursive: true, force: true });
        } catch (err: any) {
            console.warn(`⚠️ Failed to remove workspace ${ws}: ${err.message}`);
        }
    }
}

// ----- Emergency cleanup hooks -----
async function executeShutdownProcedure() {
    await teardownActiveWorkspaces();
    try {
        await mcpManager.disconnectAll();
        await configManager.setConfirmationMode("manual");

        const handler = langfuseHandler as any;
        if (typeof handler.flushAsync === "function") await handler.flushAsync();
        await otelSDK.shutdown();
    } catch { }
}

process.on("SIGINT", async () => { await executeShutdownProcedure(); process.exit(130); });
process.on("SIGTERM", async () => { await executeShutdownProcedure(); process.exit(143); });
process.on("uncaughtException", async (err) => {
    console.error("\n💥 Uncaught Exception:", err.message);
    await executeShutdownProcedure();
    process.exit(1);
});

// ============================================================
// PROMPT BUILDER (Mimics pipelineCoderNode logic exactly)
// ============================================================
function buildPrompt(workspacePath: string, cloudPlan: string, strategy: string, validationErrors?: string) {
    return `Workspace Path: ${workspacePath}
Cloud Plan: ${cloudPlan}
Strategy: '${strategy}'

${validationErrors ? `
⚠️ PULUMI DEPLOYMENT FAILED:
${validationErrors}
Use your tools to diagnose and patch the python files.` :
            `You are working in a new directory. 

INSTRUCTIONS:
1. Initialize the environment using 'setup_environment' with type: 'python' and packages: ['pulumi', 'pulumi-aws'].
2. Write your Pulumi infrastructure code inside '__main__.py'.
3. Write your PySpark ETL script (e.g., 'etl_job.py').
4. Do not output markdown files. Execute your steps and finish.`}`;
}

// Helper to check file contents safely
async function safeReadFile(filePath: string): Promise<string | null> {
    try {
        return await fs.readFile(filePath, "utf-8");
    } catch {
        return null;
    }
}

// ============================================================
// CODER TEST SUITE
// ============================================================
interface CoderTest {
    name: string;
    setup?: (workspacePath: string) => Promise<void>;
    getPrompt: (workspacePath: string) => string;
    verify: (workspacePath: string) => Promise<{ success: boolean; message: string }>;
}

const CODER_TEST_SUITE: CoderTest[] = [
    {
        name: "1. Greenfield AWS Glue + PySpark Generation",
        getPrompt: (ws) => buildPrompt(
            ws,
            "Create a new S3 bucket named 'nf-greenfield-data'. Create an IAM role for Glue. Create an AWS Glue Spark job named 'nf-greenfield-job' that runs a PySpark script to clean sales data. Output the PySpark script as well.",
            "GREENFIELD"
        ),
        verify: async (ws) => {
            const mainContent = await safeReadFile(path.join(ws, "__main__.py"));

            // Look for any file ending in .py that is not __main__.py
            const files = await fs.readdir(ws);
            const etlFile = files.find(f => f.endsWith(".py") && f !== "__main__.py");
            const etlContent = etlFile ? await safeReadFile(path.join(ws, etlFile)) : null;

            // Verify Environment was setup
            const venvExists = files.includes(".venv");

            if (!mainContent) return { success: false, message: "__main__.py was not created." };
            if (!etlContent) return { success: false, message: "No PySpark script was created." };
            if (!venvExists) return { success: false, message: "setup_environment tool was not called (.venv missing)." };

            const hasBucket = mainContent.includes("s3.Bucket");
            const hasRole = mainContent.includes("iam.Role");
            const hasJob = mainContent.includes("glue.Job");
            const hasPySpark = etlContent.includes("SparkSession");

            const success = hasBucket && hasRole && hasJob && hasPySpark;
            return {
                success,
                message: `Bucket: ${hasBucket}, Role: ${hasRole}, GlueJob: ${hasJob}, PySpark Context: ${hasPySpark}`
            };
        }
    },
    {
        name: "2. Brownfield ETL Integration (No Bucket Creation)",
        getPrompt: (ws) => buildPrompt(
            ws,
            "The S3 bucket 'existing-sales-data' already exists in the environment. Do NOT create a new bucket. Create a Pulumi script to deploy a Glue Job that processes data in 's3://existing-sales-data/raw/', and output a simple PySpark script for it.",
            "BROWNFIELD_ETL"
        ),
        verify: async (ws) => {
            const mainContent = await safeReadFile(path.join(ws, "__main__.py"));
            if (!mainContent) return { success: false, message: "__main__.py was not created." };

            const hasJob = mainContent.includes("glue.Job");
            // The agent should reference the bucket via string, but NOT create it using s3.Bucket("...")
            const createsBucket = mainContent.includes("s3.Bucket(") || mainContent.includes("s3.BucketV2(");

            const success = hasJob && !createsBucket;
            return {
                success,
                message: `Created Glue Job: ${hasJob}, Correctly skipped Bucket Creation: ${!createsBucket}`
            };
        }
    },
    {
        name: "3. Self-Healing Code Loop (Diagnostics & Patching)",
        setup: async (ws) => {
            // Intentionally write a broken Pulumi script missing the required 'role_arn' parameter
            const badCode = `import pulumi
import pulumi_aws as aws

# BROKEN: Missing role_arn parameter which is required by Pulumi AWS
my_job = aws.glue.Job("broken-job",
    command=aws.glue.JobCommandArgs(
        script_location="s3://my-bucket/script.py"
    )
)
`.trim();
            await fs.writeFile(path.join(ws, "__main__.py"), badCode);
        },
        getPrompt: (ws) => buildPrompt(
            ws,
            "Fix the broken Glue Job infrastructure.",
            "BROWNFIELD_ETL",
            "TypeError: Missing required argument 'role_arn' for aws.glue.Job"
        ),
        verify: async (ws) => {
            const mainContent = await safeReadFile(path.join(ws, "__main__.py"));
            if (!mainContent) return { success: false, message: "__main__.py missing after patch." };

            // The agent should have read the error, read the file, and injected an IAM role + role_arn
            const hasRoleArn = mainContent.includes("role_arn");
            const hasIamRole = mainContent.includes("iam.Role");

            const success = hasRoleArn && hasIamRole;
            return {
                success,
                message: `Agent successfully patched file. Added IAM Role: ${hasIamRole}, Added role_arn mapping: ${hasRoleArn}`
            };
        }
    }
];

// ============================================================
// EXECUTION ENGINE
// ============================================================
async function runAll() {
    console.log("======================================================");
    console.log("👨‍💻 Automated PipelineCoder Validation Suite (Traced)");
    console.log("======================================================\n");

    const sessionId = `test-coder-${Date.now()}`;

    // Load configs and auto-approve file/terminal edits for the test
    await configManager.load();
    await configManager.setConfirmationMode("auto");

    let passed = 0;

    await runGarbageCollector();

    try {
        await initializeMcpServers();
        const coderAgent = new PipelineCoderAgent();

        for (const test of CODER_TEST_SUITE) {
            console.log(`\n--- Running: ${test.name} ---`);

            // 1. Scaffold unique workspace for this specific test
            const testId = Math.floor(10000 + Math.random() * 90000);
            const currentWorkspace = path.resolve(workspaceRoot, `${WORKSPACE_PREFIX}${testId}`);
            activeWorkspaces.push(currentWorkspace);

            await fs.mkdir(currentWorkspace, { recursive: true });

            // Scaffold the Pulumi.yaml (like the real nodes.ts does)
            const pulumiYaml = `name: nexusflow-test\nruntime:\n  name: python\n  options:\n    virtualenv: .venv\n`;
            await fs.writeFile(path.join(currentWorkspace, "Pulumi.yaml"), pulumiYaml);

            // 2. Run Test-Specific Setup (e.g., injecting broken code)
            if (test.setup) await test.setup(currentWorkspace);

            // 3. Execute Agent
            const runner = coderAgent.getRunnable();
            const prompt = test.getPrompt(currentWorkspace);

            const agentState = await runAgentTest(
                coderAgent.name,
                runner,
                test.name,
                prompt,
                true, // auto-approve MCP calls
                {
                    callbacks: [langfuseHandler],
                    metadata: { langfuseSessionId: sessionId },
                    recursionLimit: 25 // Allowed higher limit due to heavy file ops and env setups
                }
            );

            if (!agentState) {
                console.log(`❌ [EXECUTION ERROR] Test failed to run or timed out.`);
                continue;
            }

            // 4. Verify Physical Outputs
            console.log(`\n🔍 Verifying Workspace Artifacts...`);
            const check = await test.verify(currentWorkspace);

            if (check.success) {
                console.log(`✅ PASS: ${check.message}`);
                passed++;
            } else {
                console.log(`❌ FAIL: ${check.message}`);
            }
        }
    } catch (error: any) {
        console.error("\n💥 Fatal error in suite:", error);
    } finally {
        await teardownActiveWorkspaces();
        await mcpManager.disconnectAll();
        await configManager.setConfirmationMode("manual");

        console.log("\n⏳ Uploading traces to Langfuse...");
        try {
            const handler = langfuseHandler as any;
            if (typeof handler.flushAsync === "function") {
                await handler.flushAsync();
            } else if (typeof handler.shutdownAsync === "function") {
                await handler.shutdownAsync();
            }
            await otelSDK.shutdown();
        } catch (e) {
            console.warn("Minor issue flushing traces, but execution completed.");
        }

        console.log("\n======================================================");
        console.log(`📊 Final Score: ${passed}/${CODER_TEST_SUITE.length} tests passed.`);
        console.log("======================================================");
        process.exit(passed === CODER_TEST_SUITE.length ? 0 : 1);
    }
}

runAll();