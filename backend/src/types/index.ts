export interface AgentConfig {
  name: string;
  model_name: string;
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
}