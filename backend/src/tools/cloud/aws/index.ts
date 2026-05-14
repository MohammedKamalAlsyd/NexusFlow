import { listAllS3BucketsTool, checkS3BucketContentsTool } from "./s3Discovery.js";
import { listGlueDatabasesTool, getGlueTableSchemaTool, listGlueJobsTool } from "./glueDiscovery.js";
import { listRdsInstancesTool } from "./rdsDiscovery.js";
import { listGlueIamRolesTool } from "./iamDiscovery.js";

export const awsDiscoveryTools = [
    listAllS3BucketsTool,
    checkS3BucketContentsTool,
    listGlueDatabasesTool,
    getGlueTableSchemaTool,
    listGlueJobsTool,
    listRdsInstancesTool,
    listGlueIamRolesTool
];