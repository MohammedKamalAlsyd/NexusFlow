import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { StorageManagementClient } from "@azure/arm-storage";
import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";

const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
if (!subscriptionId) throw new Error("AZURE_SUBSCRIPTION_ID environment variable is not set.");

const credential = new DefaultAzureCredential();
const storageClient = new StorageManagementClient(credential, subscriptionId);

export const listAzureStorageAccountsTool = tool(
    async () => {
        try {
            const accounts = [];
            for await (const account of storageClient.storageAccounts.list()) {
                accounts.push(`- ${account.name} (Location: ${account.location})`);
            }
            return accounts.length > 0 ? `Available Storage Accounts:\n${accounts.join("\n")}` : "No storage accounts found.";
        } catch (e: any) { return `Azure Error: ${e.message}`; }
    },
    {
        name: "list_azure_storage_accounts",
        description: "Lists all Azure Storage Accounts in the subscription. The first step to finding an ADLS Gen2 data lake.",
        schema: z.object({}),
    }
);

export const checkAdlsContainerContentsTool = tool(
    async ({ containerName }) => {
        try {
            const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
            if (!connStr) return "Error: AZURE_STORAGE_CONNECTION_STRING is not set.";

            const blobServiceClient = BlobServiceClient.fromConnectionString(connStr);
            const containerClient = blobServiceClient.getContainerClient(containerName);
            if (!await containerClient.exists()) return `Container '${containerName}' does not exist.`;

            let files = [];
            for await (const blob of containerClient.listBlobsFlat()) {
                files.push(`- ${blob.name} (${blob.properties.contentLength} bytes)`);
                if (files.length >= 10) break;
            }
            return `Contents of container '${containerName}':\n${files.join("\n")}`;
        } catch (e: any) { return `Azure Error: ${e.message}`; }
    },
    {
        name: "check_adls_container_contents",
        description: "Checks an existing ADLS Gen2 container (file system) to see what files/folders are inside.",
        schema: z.object({
            containerName: z.string().describe("The name of the container to inspect."),
        }),
    }
);