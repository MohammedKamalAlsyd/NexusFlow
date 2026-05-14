import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { IAMClient, ListRolesCommand } from "@aws-sdk/client-iam";

const iamClient = new IAMClient({ region: process.env.AWS_REGION || "us-east-1" });

export const listGlueIamRolesTool = tool(
    async () => {
        try {
            const response = await iamClient.send(new ListRolesCommand({ MaxItems: 50 }));
            if (!response.Roles) return "No IAM roles found.";

            // Filter for roles that are likely used for AWS Glue
            const glueRoles = response.Roles
                .filter(r => r.RoleName?.toLowerCase().includes("glue") || r.AssumeRolePolicyDocument?.includes("glue.amazonaws.com"))
                .map(r => r.RoleName)
                .join(", ");

            return glueRoles ? `Existing Glue IAM Roles: ${glueRoles}` : "No specific Glue IAM roles found.";
        } catch (error: any) {
            return `Failed to list IAM roles: ${error.message}`;
        }
    },
    {
        name: "list_glue_iam_roles",
        description: "Finds existing IAM Roles that can be assumed by AWS Glue. Use this to avoid creating new roles in Pulumi if a valid one already exists.",
        schema: z.object({}),
    }
);