import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { S3Client, ListBucketsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

const s3Client = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });

export const listAllS3BucketsTool = tool(
    async () => {
        try {
            const response = await s3Client.send(new ListBucketsCommand({}));
            const buckets = response.Buckets?.map(b => b.Name).join(", ") || "No buckets found.";
            return `Available S3 Buckets:\n${buckets}`;
        } catch (error: any) {
            return `Failed to list buckets: ${error.message}`;
        }
    },
    {
        name: "list_all_s3_buckets",
        description: "Lists all AWS S3 buckets in the current account. Use this to discover existing data lake storage.",
        schema: z.object({}), // No input required
    }
);

export const checkS3BucketContentsTool = tool(
    async ({ bucketName, prefix }) => {
        try {
            const command = new ListObjectsV2Command({
                Bucket: bucketName,
                Prefix: prefix || "",
                MaxKeys: 10
            });
            const response = await s3Client.send(command);

            if (!response.Contents || response.Contents.length === 0) {
                return `Bucket '${bucketName}' is empty or prefix '${prefix}' has no files.`;
            }

            const files = response.Contents.map(item => `- ${item.Key} (${item.Size} bytes)`).join("\n");
            return `Contents of ${bucketName} (Sample):\n${files}`;
        } catch (error: any) {
            return `Failed to read bucket '${bucketName}': ${error.message}`;
        }
    },
    {
        name: "check_s3_bucket_contents",
        description: "Checks an existing S3 bucket to see what files/folders are inside. Helps identify data drift or file formats (CSV, Parquet).",
        schema: z.object({
            bucketName: z.string().describe("The exact name of the S3 bucket"),
            prefix: z.string().optional().describe("Optional folder path (e.g., 'raw-data/2023/')"),
        }),
    }
);