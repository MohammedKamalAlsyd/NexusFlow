import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { SqlManagementClient } from "@azure/arm-sql";
import { DefaultAzureCredential } from "@azure/identity";

const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
if (!subscriptionId) throw new Error("AZURE_SUBSCRIPTION_ID environment variable is not set.");

const credential = new DefaultAzureCredential();
const sqlClient = new SqlManagementClient(credential, subscriptionId);

export const listAzureSqlServersTool = tool(
    async () => {
        try {
            const servers = [];
            for await (const server of sqlClient.servers.list()) {
                servers.push(`- ${server.name} (Location: ${server.location})`);
            }
            return servers.length > 0 ? `Available Azure SQL Servers:\n${servers.join("\n")}` : "No Azure SQL Servers found.";
        } catch (e: any) { return `Azure Error: ${e.message}`; }
    },
    {
        name: "list_azure_sql_servers",
        description: "Lists all Azure SQL server instances, which contain databases to be used as sources.",
        schema: z.object({}),
    }
);

export const listAzureSqlDatabasesTool = tool(
    async ({ resourceGroupName, serverName }) => {
        try {
            const dbs = [];
            for await (const db of sqlClient.databases.listByServer(resourceGroupName, serverName)) {
                dbs.push(`- ${db.name} (Status: ${db.status})`);
            }
            return dbs.length > 0 ? `Databases in '${serverName}':\n${dbs.join("\n")}` : `No databases found in '${serverName}'.`;
        } catch (e: any) { return `Azure Error: ${e.message}`; }
    },
    {
        name: "list_azure_sql_databases",
        description: "Lists all databases within a specific Azure SQL server.",
        schema: z.object({
            resourceGroupName: z.string(),
            serverName: z.string(),
        }),
    }
);