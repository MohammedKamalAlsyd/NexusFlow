import { awsDiscoveryTools } from "./aws/index.js";
import { azureDiscoveryTools } from "./azure/index.js";

export const cloudDiscoveryTools = [
    ...awsDiscoveryTools,
    ...azureDiscoveryTools
];