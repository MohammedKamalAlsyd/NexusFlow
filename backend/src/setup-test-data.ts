import { S3Client, CreateBucketCommand, HeadBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import * as dotenv from "dotenv";
import path from "node:path";

// Load env variables from backend/.env
dotenv.config({ path: path.join(process.cwd(), '.env') });

const BUCKET_NAME = "sales-data-lake-2024";
const s3Client = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });

async function setupTestData() {
    console.log(`Checking for bucket: ${BUCKET_NAME}...`);

    try {
        // 1. Check if bucket exists
        await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
        console.log(`✅ Bucket '${BUCKET_NAME}' already exists.`);
    } catch (err: any) {
        if (err.$metadata.httpStatusCode === 404) {
            console.log(`🏗️ Bucket not found. Creating '${BUCKET_NAME}'...`);
            await s3Client.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }));
            console.log(`✅ Bucket created.`);
        } else {
            console.error("❌ Error accessing S3:", err.message);
            process.exit(1);
        }
    }

    // 2. Create Sample Data
    const sampleData = [
        "id,customer_email,amount,date",
        "1, Ahmed.Kamal@Example.com ,150.50,2024-01-01",
        "2, JANE.DOE@test.org , 200.00,2024-01-02",
        "3, invalid-email, 50.00,2024-01-03",
        "4, bob.smith@work.com, 75.25,2024-01-04"
    ].join("\n");

    // 3. Upload to raw/ folder
    try {
        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: "raw/sales_data_001.csv",
            Body: sampleData
        }));
        console.log(`✅ Uploaded sample data to 'raw/sales_data_001.csv'`);
    } catch (err: any) {
        console.error("❌ Failed to upload sample data:", err.message);
    }
}

setupTestData();