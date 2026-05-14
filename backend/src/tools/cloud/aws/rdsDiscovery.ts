import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { RDSClient, DescribeDBInstancesCommand } from "@aws-sdk/client-rds";

const rdsClient = new RDSClient({ region: process.env.AWS_REGION || "us-east-1" });

export const listRdsInstancesTool = tool(
    async () => {
        try {
            const response = await rdsClient.send(new DescribeDBInstancesCommand({}));
            if (!response.DBInstances || response.DBInstances.length === 0) return "No RDS instances found.";

            const instances = response.DBInstances.map(db =>
                `- ${db.DBInstanceIdentifier} (Engine: ${db.Engine}, Status: ${db.DBInstanceStatus}, Endpoint: ${db.Endpoint?.Address})`
            ).join("\n");

            return `Available RDS Instances:\n${instances}`;
        } catch (error: any) {
            return `Failed to list RDS instances: ${error.message}`;
        }
    },
    {
        name: "list_rds_instances",
        description: "Lists all AWS RDS relational databases, their engines (e.g., postgres, mysql), and endpoints.",
        schema: z.object({}),
    }
);