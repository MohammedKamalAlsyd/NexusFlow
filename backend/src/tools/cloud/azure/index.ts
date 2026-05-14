import { listAzureStorageAccountsTool, checkAdlsContainerContentsTool } from "./adlsDiscovery.js";
import { listAzureDataFactoriesTool, listAdfPipelinesTool } from "./adfDiscovery.js";
import { listAzureSqlServersTool, listAzureSqlDatabasesTool } from "./sqlDiscovery.js";

export const azureDiscoveryTools = [
    listAzureStorageAccountsTool,
    checkAdlsContainerContentsTool,
    listAzureDataFactoriesTool,
    listAdfPipelinesTool,
    listAzureSqlServersTool,
    listAzureSqlDatabasesTool
];