import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { DataFactoryManagementClient } from "@azure/arm-datafactory";
import { DefaultAzureCredential } from "@azure/identity";

const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
if (!subscriptionId) throw new Error("AZURE_SUBSCRIPTION_ID environment variable is not set.");

const credential = new DefaultAzureCredential();
const adfClient = new DataFactoryManagementClient(credential, subscriptionId);

export const listAzureDataFactoriesTool = tool(
    async ({ resourceGroupName }) => {
        try {
            const factories = [];
            for await (const factory of adfClient.factories.listByResourceGroup(resourceGroupName)) {
                factories.push(`- ${factory.name}`);
            }
            return factories.length > 0 ? `Data Factories in '${resourceGroupName}':\n${factories.join("\n")}` : "No Data Factories found.";
        } catch (e: any) { return `Azure Error: ${e.message}`; }
    },
    {
        name: "list_azure_data_factories",
        description: "Lists all Azure Data Factory instances in a specific Resource Group.",
        schema: z.object({ resourceGroupName: z.string() }),
    }
);

export const listAdfPipelinesTool = tool(
    async ({ resourceGroupName, factoryName }) => {
        try {
            const pipelines = [];
            for await (const pipeline of adfClient.pipelines.listByFactory(resourceGroupName, factoryName)) {
                pipelines.push(`- ${pipeline.name}`);
            }
            return pipelines.length > 0 ? `Pipelines in '${factoryName}':\n${pipelines.join("\n")}` : `No pipelines found in '${factoryName}'.`;
        } catch (e: any) { return `Azure Error: ${e.message}`; }
    },
    {
        name: "list_adf_pipelines",
        description: "Lists all existing ETL/ELT pipelines within a specific Azure Data Factory. Use this to discover existing logic.",
        schema: z.object({
            resourceGroupName: z.string(),
            factoryName: z.string(),
        }),
    }
);