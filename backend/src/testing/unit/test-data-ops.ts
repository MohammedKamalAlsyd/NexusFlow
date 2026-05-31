import * as dotenv from "dotenv";
import path from "node:path";
import { DataOpsAgent } from "@/agents/roles/DataOpsAgent.js";
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

const BUCKET_PREFIX = "nexusflow-dataops-test-";
const TEST_BUCKET_NAME = `${BUCKET_PREFIX}run-${Math.floor(10000 + Math.random() * 90000)}`;

let needsCleanup = false;

// ============================================================
// S3 RESOURCE HELPERS (Garbage Collection)
// ============================================================
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
    console.log("🔍 [GC] Checking for leftover DataOps test buckets...");
    try {
        const data = await s3Client.send(new ListBucketsCommand({}));
        const orphaned = data.Buckets?.filter(b => b.Name?.startsWith(BUCKET_PREFIX)) || [];
        if (orphaned.length === 0) {
            console.log("🔍 [GC] No leftovers found.");
            return;
        }
        console.log(`♻️ [GC] Found ${orphaned.length} orphaned bucket(s). Scrubbing...`);
        for (const bucket of orphaned) {
            if (bucket.Name) await forceDeleteBucket(bucket.Name);
        }
    } catch (err: any) {
        console.warn(`⚠️ [GC] Cleanup error: ${err.message}`);
    }
}

async function setupDummyResources() {
    console.log(`\n🏗️  [SETUP] Provisioning ephemeral data lake: ${TEST_BUCKET_NAME}...`);
    await s3Client.send(new CreateBucketCommand({ Bucket: TEST_BUCKET_NAME }));

    // Upload a mock dataset for the agent to analyze
    const csvData = "id,product,price\n1,Alpha-Widget,15.50\n2,Beta-Gizmo,20.00\n3,Gamma-Tool,14.50";

    await s3Client.send(new PutObjectCommand({
        Bucket: TEST_BUCKET_NAME,
        Key: "raw/sales.csv",
        Body: csvData
    }));

    needsCleanup = true;
    console.log("✅ [SETUP] Dummy cloud resources and datasets ready.\n");
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
// DATA OPS TEST SUITE
// ============================================================
interface DataOpsTest {
    name: string;
    getPrompt: (bucketName: string) => string;
    verify: (lastMessageContent: string) => { success: boolean; message: string };
}

const DATA_OPS_TEST_SUITE: DataOpsTest[] = [
    {
        name: "1. Direct Data Analysis (Query Execution)",
        getPrompt: (bucket) => `Our strategy is DATA_ANALYSIS. I need you to find the 'raw/sales.csv' file inside the 's3://${bucket}' bucket. Read its contents, parse the data, and report the exact total sum of the 'price' column.`,
        verify: (content) => {
            const lower = content.toLowerCase();
            // 15.50 + 20.00 + 14.50 = 50.00
            const hasTotal = lower.includes("50.00") || lower.includes("50");
            const hasReport = lower.includes("report") || lower.includes("status");
            return {
                success: hasTotal && hasReport,
                message: `Correctly calculated total (50.00): ${hasTotal}, Formatted as report: ${hasReport}`
            };
        }
    },
    {
        name: "2. Incident Response (Failed Job Diagnostics)",
        getPrompt: (bucket) => `The infrastructure has been deployed. Trigger the AWS Glue job named 'nexusflow-deliberately-fake-job-xyz' using your tools. When it inevitably fails because the job does not exist, capture the exact error message and generate a Root-Cause Analysis incident report.`,
        verify: (content) => {
            const lower = content.toLowerCase();
            const hasError = lower.includes("entitynotfoundexception") || lower.includes("not found") || lower.includes("does not exist") || lower.includes("error");
            const hasReport = lower.includes("root-cause") || lower.includes("incident") || lower.includes("remediation");
            return {
                success: hasError && hasReport,
                message: `Caught Entity/Not Found Error: ${hasError}, Formatted as Incident Report: ${hasReport}`
            };
        }
    },
    {
        name: "3. Pipeline Output Validation",
        getPrompt: (bucket) => `A pipeline just finished. Your job is to validate the data. Check if there are any output files in 's3://${bucket}/cleaned/'. If it is empty or missing, report that the data validation failed.`,
        verify: (content) => {
            const lower = content.toLowerCase();
            const checkedPath = lower.includes("cleaned");
            const notedEmpty = lower.includes("empty") || lower.includes("missing") || lower.includes("failed") || lower.includes("does not exist");
            return {
                success: checkedPath && notedEmpty,
                message: `Checked target path: ${checkedPath}, Correctly identified missing data: ${notedEmpty}`
            };
        }
    }
];

// ============================================================
// EXECUTION ENGINE
// ============================================================
async function runAll() {
    console.log("======================================================");
    console.log("📊 Automated DataOps Validation Suite (Traced)");
    console.log("======================================================\n");

    const sessionId = `test-dataops-${Date.now()}`;

    await configManager.load();
    await configManager.setConfirmationMode("auto");

    let passed = 0;

    await runGarbageCollector();
    await setupDummyResources();

    try {
        await initializeMcpServers();
        // Uses the real, default DataOpsAgent system prompt defined in DataOpsAgent.ts
        const dataOpsAgent = new DataOpsAgent();

        for (const test of DATA_OPS_TEST_SUITE) {
            console.log(`\n--- Running: ${test.name} ---`);

            const runner = dataOpsAgent.getRunnable();
            const prompt = test.getPrompt(TEST_BUCKET_NAME);

            const agentState = await runAgentTest(
                dataOpsAgent.name,
                runner,
                test.name,
                prompt,
                true, // auto-approve MCP calls
                {
                    callbacks: [langfuseHandler],
                    metadata: { langfuseSessionId: sessionId },
                    recursionLimit: 15 // Keeps polling/retries strictly bound
                }
            );

            if (!agentState) {
                console.log(`❌ [EXECUTION ERROR] Test failed to run or timed out.`);
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
        console.log(`📊 Final Score: ${passed}/${DATA_OPS_TEST_SUITE.length} tests passed.`);
        console.log("======================================================");
        process.exit(passed === DATA_OPS_TEST_SUITE.length ? 0 : 1);
    }
}

runAll();