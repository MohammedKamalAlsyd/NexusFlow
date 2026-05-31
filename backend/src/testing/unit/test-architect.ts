import * as dotenv from "dotenv";
import path from "node:path";
import { ArchitectAgent } from "@/agents/roles/ArchitectAgent.js";
import { runAgentTest } from "@/testing/utils/agent-runner.js";
import { initializeMcpServers } from "@/mcp/index.js";
import { mcpManager } from "@/mcp/client.js";
import { configManager } from "@/config/index.js";
import { langfuseHandler, otelSDK } from "@/tracing/index.js";
import { 
    S3Client, 
    CreateBucketCommand, 
    DeleteBucketCommand, 
    PutObjectCommand, 
    DeleteObjectCommand,
    ListBucketsCommand,
    ListObjectsV2Command,
    DeleteObjectsCommand
} from "@aws-sdk/client-s3";

// Configure testing variables
process.env.NEXUSFLOW_TEST_MODE = "true";
dotenv.config({ path: path.join(process.cwd(), '.env') });

const s3Client = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });

const BUCKET_PREFIX = "nexusflow-architect-test-";
const TEST_BUCKET_NAME = `${BUCKET_PREFIX}run-${Math.floor(100000 + Math.random() * 900000)}`;
const TEST_FILE_KEY = "raw/sample_sales.csv";

let needsCleanup = false;

// ----- S3 resource helpers -----
async function forceDeleteBucket(bucketName: string) {
    try {
        const listData = await s3Client.send(new ListObjectsV2Command({ Bucket: bucketName }));
        if (listData.Contents && listData.Contents.length > 0) {
            const deleteParams = {
                Bucket: bucketName,
                Delete: {
                    Objects: listData.Contents.map(obj => ({ Key: obj.Key! }))
                }
            };
            await s3Client.send(new DeleteObjectsCommand(deleteParams));
        }
        await s3Client.send(new DeleteBucketCommand({ Bucket: bucketName }));
        console.log(`🧹 [CLEANUP] Removed bucket: ${bucketName}`);
    } catch (err: any) {
        if (err.name !== "NoSuchBucket" && err.$metadata?.httpStatusCode !== 404) {
            console.warn(`⚠️ [CLEANUP] Failed to destroy bucket ${bucketName}: ${err.message}`);
        }
    }
}

async function runGarbageCollector() {
    console.log("🔍 [GC] Checking for leftover test resources...");
    try {
        const data = await s3Client.send(new ListBucketsCommand({}));
        const orphaned = data.Buckets?.filter(b => b.Name?.startsWith(BUCKET_PREFIX)) || [];
        if (orphaned.length === 0) {
            console.log("🔍 [GC] No leftovers.");
            return;
        }
        console.log(`♻️ [GC] Found ${orphaned.length} orphaned bucket(s). Scrubbing...`);
        for (const bucket of orphaned) {
            if (bucket.Name) await forceDeleteBucket(bucket.Name);
        }
    } catch (err: any) {
        console.warn(`⚠️ [GC] Skipping pre-run collection: ${err.message}`);
    }
}

async function setupDummyResources() {
    console.log(`\n🏗️  [SETUP] Creating ephemeral bucket: ${TEST_BUCKET_NAME}...`);
    await s3Client.send(new CreateBucketCommand({ Bucket: TEST_BUCKET_NAME }));
    await s3Client.send(new PutObjectCommand({
        Bucket: TEST_BUCKET_NAME,
        Key: TEST_FILE_KEY,
        Body: "id,amount,customer_email\n1,250.00,user@domain.com"
    }));
    needsCleanup = true;
    console.log("✅ [SETUP] Dummy cloud resources ready.\n");
}

async function teardownDummyResources() {
    if (!needsCleanup) return;
    await forceDeleteBucket(TEST_BUCKET_NAME);
    needsCleanup = false;
}

// ----- Emergency cleanup hooks -----
async function executeShutdownProcedure() {
    if (needsCleanup) {
        console.log("\n🚨 [EMERGENCY] Revoking cloud assets...");
        await teardownDummyResources();
    }
    try {
        await mcpManager.disconnectAll();
        await configManager.setConfirmationMode("manual");

        const handler = langfuseHandler as any;
        if (typeof handler.flushAsync === "function") await handler.flushAsync();
        await otelSDK.shutdown();
    } catch {}
}

process.on("SIGINT", async () => { await executeShutdownProcedure(); process.exit(130); });
process.on("SIGTERM", async () => { await executeShutdownProcedure(); process.exit(143); });
process.on("uncaughtException", async (err) => {
    console.error("\n💥 Uncaught Exception:", err.message);
    await executeShutdownProcedure();
    process.exit(1);
});

// ============================================================
// FLEXIBLE SYSTEM PROMPT FOR MODEL SELECTION/TESTING
// ============================================================
const TEST_SYSTEM_PROMPT = `You are a Senior Principal Cloud Architect specializing in multi-cloud data engineering.
Your job is to receive a user request, explore the actual cloud environment using your tools, and design an optimal data pipeline strategy.

### YOUR OPERATING PROCEDURE:
You must follow these steps sequentially:

STEP 1: THINK & PLAN
Analyze the user's request. Decide which tools you need to query AWS or Azure to discover what infrastructure or datasets currently exist.

STEP 2: EXPLORE (STRICT TOOL LIMITS)
Call your MCP tools to verify if buckets, databases, tables, or configurations exist.
- CRITICAL: You are a PLANNER, not an executor. DO NOT execute deep queries (e.g. Athena SELECT statements, database query statements) or run/trigger jobs yourself. Only retrieve metadata or list resources to verify existence.
- EFFICIENCY: Keep tool usage to an absolute minimum (max 3-5 calls total).
- ERROR HANDLING: If a command fails, do NOT get stuck in an infinite retry loop. If you cannot find a resource after 2 attempts, assume it does not exist and move on.

STEP 3: STRATEGY SELECTION
Based on your findings, autonomously select the correct strategic pattern:
- Select "BROWNFIELD_ETL" if the target datasets, buckets, or processing engines already exist in the cloud, and your goal is simply to clean, process, or restructure them.
- Select "GREENFIELD" if the request requires constructing a pipeline entirely from scratch where none of the referenced files, S3 buckets, databases, or container systems currently exist.
- Select "DATA_ANALYSIS" if the request is strictly to query, summarize, inspect active catalogs, or run diagnostics on existing resources without creating any new ETL jobs, scripts, or infrastructure.

STEP 4: OUTPUT PLAN
Generate your plan in plain English. Ensure you explicitly state the selected strategy name (GREENFIELD, BROWNFIELD_ETL, or DATA_ANALYSIS) and outline the architecture you designed. Avoid markdown JSON wrappers.`;

// ============================================================
// HINT-FREE TEST SUITE (REALISTIC USER REQUESTS)
// ============================================================
interface ArchitectTest {
    name: string;
    prompt: string;
    verify: (lastMessageContent: string) => { success: boolean; message: string };
}

const ARCHITECT_TEST_SUITE: ArchitectTest[] = [
    {
        name: "1. AWS S3 Environment Discovery",
        prompt: `Can you scan my active S3 environment to find an active bucket starting with 'nexusflow-architect-test-'? I need to know the exact bucket name and what files are stored in it.`,
        verify: (content) => {
            const lower = content.toLowerCase();
            const hasBucket = lower.includes("nexusflow-architect-test-");
            const hasStrategy = lower.includes("brownfield_etl");
            return {
                success: hasBucket && hasStrategy,
                message: `Bucket found: ${hasBucket}, Strategy Autonomously Resolved (BROWNFIELD_ETL): ${hasStrategy}`
            };
        }
    },
    {
        name: "2. Strategic Planning (BROWNFIELD)",
        prompt: `We have a dataset named 'raw/sample_sales.csv' inside our active test bucket. I need a plan to build a PySpark script that can read this CSV, perform cleaning operations, and save the output back to the same bucket in Parquet format. Can you check what resources exist and design the pipeline?`,
        verify: (content) => {
            const lower = content.toLowerCase();
            const hasStrategy = lower.includes("brownfield_etl");
            const mentionsPysparkOrParquet = lower.includes("pyspark") || lower.includes("parquet");
            return {
                success: hasStrategy && mentionsPysparkOrParquet,
                message: `Strategy Autonomously Resolved (BROWNFIELD_ETL): ${hasStrategy}, Pipeline details: ${mentionsPysparkOrParquet}`
            };
        }
    },
    {
        name: "3. Multi-Cloud Target Planning (GREENFIELD)",
        prompt: `I want to set up an ingestion flow where clickstream telemetry data is regularly moved from a new Azure Blob Storage Container to a brand new AWS S3 bucket. Neither resource is created yet. What is the recommended serverless or managed way to establish this?`,
        verify: (content) => {
            const lower = content.toLowerCase();
            const hasGreenfield = lower.includes("greenfield");
            const mentionsAws = lower.includes("s3") || lower.includes("aws");
            const mentionsAzure = lower.includes("azure") || lower.includes("blob");
            return {
                success: hasGreenfield && (mentionsAws || mentionsAzure),
                message: `Strategy Autonomously Resolved (GREENFIELD): ${hasGreenfield}, Multi-cloud: ${mentionsAws && mentionsAzure}`
            };
        }
    },
    {
        name: "4. Direct Queries (DATA_ANALYSIS)",
        prompt: `The executive team wants a quick summary of high-value client transactions from our active sales tables. We don't want to design or build any new ETL pipelines, and we don't want to configure new databases. How can they run this analysis on their current datasets directly?`,
        verify: (content) => {
            const lower = content.toLowerCase();
            const hasStrategy = lower.includes("data_analysis");
            return {
                success: hasStrategy,
                message: `Strategy Autonomously Resolved (DATA_ANALYSIS): ${hasStrategy}`
            };
        }
    },
    {
        name: "5. Technical Documentation Reference",
        prompt: `We are configuring our very first AWS Glue PySpark job from scratch. Before we write any code, can you look up the official AWS Glue documentation to confirm the necessary parameters and arguments we need to specify when instantiating the Spark context inside a Glue job environment?`,
        verify: (content) => {
            const lower = content.toLowerCase();
            const hasGreenfield = lower.includes("greenfield");
            const hasGlueOrPyspark = lower.includes("glue") || lower.includes("pyspark") || lower.includes("role") || lower.includes("command");
            return {
                success: hasGreenfield && hasGlueOrPyspark,
                message: `Strategy Autonomously Resolved (GREENFIELD): ${hasGreenfield}, Glue/PySpark parameters: ${hasGlueOrPyspark}`
            };
        }
    },
    {
        name: "6. Azure Catalog Discovery",
        prompt: `Can you scan our Azure directory using your tools to see which subscriptions and resource groups are currently accessible in our sandbox environment, and provide a list of what you find?`,
        verify: (content) => {
            const lower = content.toLowerCase();
            const hasStrategy = lower.includes("data_analysis");
            const hasContent = content.length > 30;
            return {
                success: hasStrategy && hasContent,
                message: `Strategy Autonomously Resolved (DATA_ANALYSIS): ${hasStrategy}, Discovered content: ${hasContent}`
            };
        }
    }
];

// ============================================================
// EXECUTION ENGINE
// ============================================================
async function runAll() {
    console.log("======================================================");
    console.log("🌌 Automated Architect Validation Suite (Flexible Traced)");
    console.log("======================================================\n");

    const sessionId = `test-architect-${Date.now()}`;

    await configManager.load();
    await configManager.setConfirmationMode("auto");

    let passed = 0;

    await runGarbageCollector();
    await setupDummyResources();
    
    try {
        await initializeMcpServers();
        const architect = new ArchitectAgent();

        for (const test of ARCHITECT_TEST_SUITE) {
            console.log(`\n--- Running: ${test.name} ---`);
            
            // Set the hint-free testing system prompt containing step-by-step logic rules
            architect.setSystemPrompt(TEST_SYSTEM_PROMPT);
            const runner = architect.getRunnable();
            
            const agentState = await runAgentTest(
                architect.name,
                runner,
                test.name,
                test.prompt,
                true, // auto-approve MCP calls
                {
                    callbacks: [langfuseHandler],
                    metadata: { langfuseSessionId: sessionId },
                    recursionLimit: 20 // Safeguards against recursion failures
                }
            );

            if (!agentState) {
                console.log(`❌ [EXECUTION ERROR] Test failed to run.`);
                continue;
            }

            const lastMsg = agentState.messages[agentState.messages.length - 1]?.content || "";
            console.log(`\n📝 FINAL OUTPUT:\n${lastMsg.slice(0, 500)}${lastMsg.length > 500 ? '...' : ''}`);

            const check = test.verify(lastMsg);
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
        await teardownDummyResources();
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
        console.log(`📊 Final Score: ${passed}/${ARCHITECT_TEST_SUITE.length} tests passed.`);
        console.log("======================================================");
        process.exit(passed === ARCHITECT_TEST_SUITE.length ? 0 : 1);
    }
}

runAll();