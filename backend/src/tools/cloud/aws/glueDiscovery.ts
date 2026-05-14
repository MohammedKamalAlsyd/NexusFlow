import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { GlueClient, GetDatabasesCommand, GetTablesCommand, GetJobsCommand, GetJobCommand } from "@aws-sdk/client-glue";

const glueClient = new GlueClient({ region: process.env.AWS_REGION || "us-east-1" });

export const listGlueDatabasesTool = tool(
    async () => {
        try {
            const response = await glueClient.send(new GetDatabasesCommand({}));
            const dbs = response.DatabaseList?.map(db => db.Name).join(", ") || "No Glue databases found.";
            return `Available Glue Databases:\n${dbs}`;
        } catch (error: any) {
            return `Failed to list Glue databases: ${error.message}`;
        }
    },
    {
        name: "list_glue_databases",
        description: "Lists all AWS Glue Data Catalog databases.",
        schema: z.object({}),
    }
);

export const getGlueTableSchemaTool = tool(
    async ({ databaseName }) => {
        try {
            const response = await glueClient.send(new GetTablesCommand({ DatabaseName: databaseName }));
            if (!response.TableList || response.TableList.length === 0) return `No tables in '${databaseName}'.`;

            const schemas = response.TableList.map(t => {
                const cols = t.StorageDescriptor?.Columns?.map(c => `${c.Name} (${c.Type})`).join(", ");
                return `Table: ${t.Name} | Location: ${t.StorageDescriptor?.Location} | Columns: ${cols}`;
            });
            return `Schema for '${databaseName}':\n${schemas.join("\n")}`;
        } catch (error: any) {
            return `Failed to get schema for '${databaseName}': ${error.message}`;
        }
    },
    {
        name: "get_glue_table_schema",
        description: "Gets the tables and columns for a specific Glue database. Vital for writing ETL transformation logic.",
        schema: z.object({ databaseName: z.string() }),
    }
);

export const listGlueJobsTool = tool(
    async () => {
        try {
            const response = await glueClient.send(new GetJobsCommand({ MaxResults: 10 }));
            if (!response.Jobs || response.Jobs.length === 0) return "No Glue jobs found.";

            const jobs = response.Jobs.map(j => `- ${j.Name} (Role: ${j.Role})`).join("\n");
            return `Existing Glue Jobs:\n${jobs}`;
        } catch (error: any) {
            return `Failed to list Glue jobs: ${error.message}`;
        }
    },
    {
        name: "list_glue_jobs",
        description: "Lists existing AWS Glue ETL Jobs.",
        schema: z.object({}),
    }
);