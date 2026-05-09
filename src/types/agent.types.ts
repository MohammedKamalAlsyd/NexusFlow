export interface TokenUsageDetails {
  audio?: number;
  cache_read?: number;
  reasoning?: number;
}

export interface AgentResponse {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    inputDetails?: TokenUsageDetails;
    outputDetails?: TokenUsageDetails;
  };
  metadata: {
    id: string;
    finishReason: string | null;
    modelProvider: string | null;
    modelName: string | null;
    raw: Record<string, any>;
  };
}