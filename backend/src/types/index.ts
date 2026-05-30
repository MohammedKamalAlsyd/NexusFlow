export interface AgentConfig {
  name: string;
  model_name: string;
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AllowlistRule {
  target: string;
  operation: "read" | "write" | "delete" | "execute" | "mcp" | "all";
  addedAt: string;
}

export interface NexusConfig {
  version: string;
  preferences: {
    confirmationMode: "manual" | "auto";
  };
  pulumi: {
    backend: "local" | "cloud";
  };
  safety: {
    projectRoot: string;
    workspaceRoot: string;
    allowedPaths: string[];
    blockedPatterns: string[];
    blockedCommands: string[];
    readOnlyFiles: string[];
    notAllowedExtensions: string[];
  };
  allowList: {
    files: AllowlistRule[];
    commands: AllowlistRule[];
    mcp: AllowlistRule[];
  };
}