# 🌌 NexusFlow: Agentic Cross-Cloud Data Orchestrator

NexusFlow is an intelligent, agent-driven data engineering platform designed to automate the end-to-end lifecycle of ETL pipelines across heterogeneous cloud environments (AWS, Azure, and Databricks).

---

### **🛠️ Tech Stack & Programming Languages**

#### **Languages & Runtimes**
![NodeJS](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![SQL](https://img.shields.io/badge/SQL-CC2927?style=for-the-badge&logo=microsoftsqlserver&logoColor=white)

#### **Cloud & Infrastructure**
![AWS](https://img.shields.io/badge/AWS-232F3E?style=for-the-badge&logo=amazonwebservices&logoColor=white)
![Azure](https://img.shields.io/badge/Azure-0089D6?style=for-the-badge&logo=microsoftazure&logoColor=white)
![Pulumi](https://img.shields.io/badge/Pulumi-8A3391?style=for-the-badge&logo=pulumi&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)

#### **Orchestration, Frameworks & Libraries**
![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socketdotio&logoColor=white)
![Apache Spark](https://img.shields.io/badge/Apache%20Spark-E25A1C?style=for-the-badge&logo=apachespark&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Ant Design](https://img.shields.io/badge/Ant%20Design-0170FE?style=for-the-badge&logo=antdesign&logoColor=white)

---

## 📺 Demonstration Video
*A walk-through showing real-time execution, human-in-the-loop approvals, and pipeline deployments is available below:*

[![Demonstration Video](https://img.shields.io/badge/Video-Demonstration-red?style=for-the-badge&logo=youtube&logoColor=white)](#) *(Replace this text with your direct video URL or embedding when ready)*

---

## 💡 The Engineering Challenge: Why NexusFlow?

Building, deploying, and maintaining cloud data pipelines at scale presents several systemic challenges that manual engineering struggles to solve:

*   **Manual Transformations are Highly Error-Prone:** Writing ETL code (such as PySpark or SQL) alongside Infrastructure-as-Code (IaC) requires perfect synchronization. A single typo in an S3 bucket URI, a mismatched schema definition, or an improperly configured IAM trust policy will cause the entire pipeline to fail during execution. 
*   **Limitations of Native Cloud Tooling:** Native orchestration services (like AWS CloudFormation or Azure Resource Manager) are rigid and verbose. They do not easily allow for **dynamic environment discovery**—meaning they cannot scan your active cloud first to see if a resource already exists before trying to create it. This leads to deployment collisions, state drift, and orphaned resources.
*   **The Multi-Cloud Paradigm Barrier:** Orchestrating data across different clouds (e.g., migrating clickstream data from Azure Blobs to AWS S3) requires engineers to switch between completely different authentication models, CLI tools, and API paradigms. No native single-cloud tool spans this gap cleanly.
*   **High Debugging Latency:** When a traditional deployment fails, tracing the root cause is highly fragmented. Engineers must manually correlate logs across AWS CloudWatch, Glue Console errors, IAM policy simulators, and local terminal output. 

### How NexusFlow Bridges the Gap
*   **Dynamic Discovery:** It scans your environment *before* writing code, preventing duplicate resource collisions.
*   **Self-Healing Feedback Loops:** If a Pulumi deployment fails, the engine captures the direct compiler `stderr`, feeds it back to the Coder Agent, and corrects the infrastructure code automatically.
*   **Unified Multi-Cloud Translation:** It translates natural language requirements into concrete, cross-cloud Python IaC and PySpark scripts under a unified safety sandbox.

---

## ⚡ Core Technical Features

### 1. Bi-Directional WebSocket Communication (Socket.io)
NexusFlow replaces traditional, stateless HTTP SSE streams with a unified **Socket.io** WebSocket server. This allows real-time, bi-directional event emission between the backend LangGraph runtime and the frontend React application over a single TCP connection.

### 2. Thread-Isolated Session Context (`AsyncLocalStorage`)
To prevent concurrent requests from clashing, NexusFlow implements Node.js `AsyncLocalStorage`. The active WebSocket client connection and session state are preserved across the deep asynchronous boundaries of the agent executions. Any tool or node called by the graph natively targets the exact socket that initiated the thread.

### 3. Native Socket HITL Acknowledgements (`emitWithAck`)
Human-in-the-Loop (HITL) safety checks use Socket.io's native acknowledgment API. When an agent requests permission to write files or execute commands, the backend pauses using `emitWithAck`. The frontend resolves this pause directly via an event callback, eliminating complex database persistence maps and preventing zombie execution hangs.

### 4. Interactive State "Time Travel" (Timeline Rewind)
Users can rewind the conversation to any previous step. The frontend slices the message history and updates the session timeline, prompting the backend to initiate a clean run seeded with the truncated history. The agent receives the exact historical context and branches off to evaluate alternative architectures seamlessly.

### 5. Resilient JSON Parsing and Self-Correction
The `architectNode` implements an aggressive parsing filter that isolates and validates the agent's structural JSON payload. If parsing fails, the backend self-corrects using a prompt that instructs the LLM to strip all conversational conversational preambles and double-check string escape rules.

---

## 🧠 System Architecture

The workflow separation between the real-time orchestration engine and the agent swarm is illustrated below:

```mermaid
graph TD
    A[React Flow Frontend] -- 1. socket.emit('start_chat') --> B[Socket.io Server]
    B -- 2. Bind Socket to thread context --> C[AsyncLocalStorage]
    C --> D[LangGraph Workflow Engine]
    
    subgraph Agent Swarm
        D --> E[Architect Agent]
        D --> F[Pipeline Coder Agent]
        D --> G[DataOps Agent]
    end
    
    subgraph Tool Executions & HITL Gate
        E & F & G --> H[Tool Execution]
        H -- 3. askForPermission() --> I{Is Auto-Approved?}
        I -- No --> J[socket.emitWithAck('permission_request')]
        J -- 4. User clicks Allow --> A
        A -- 5. Resolve callback --> J
        J -- 6. Resume Tool --> K[Execute Cloud / FS Command]
    end

🤖 The Agent Personas

Each node in the LangGraph invokes a specialized agent extending BaseAgent.ts:

1.  Cloud Architect (architectNode): Analyzes the user request + Explorer's
    findings. Outputs a JSON plan and assigns an execution strategy (GREENFIELD,
    BROWNFIELD_ETL, or DATA_ANALYSIS).
2.  Pipeline Coder (pipelineCoderNode): Writes high-performance PySpark, ADF
    JSON, or SQL, alongside Pulumi Python scripts. Uses context to know whether
    to provision new resources (GREENFIELD) or look up existing ones
    (BROWNFIELD).
3.  Data Ops (dataOpsNode): Activated for data queries and validation. Connects
    to existing databases via MCP (Model Context Protocol).

📂 Directory Structure

NexusFlow/
├── backend/
│   ├── src/
│   │   ├── agents/            # LLM Prompts and Base classes
│   │   │   └── roles/         # Specialized agent personas (Architect, Coder, DataOps)
│   │   ├── config/            # System configuration & setting managers
│   │   ├── graph/             # LangGraph state machine definition
│   │   │   ├── nodes.ts       # Function handlers for each graph node
│   │   │   ├── state.ts       # Central memory state definition
│   │   │   └── workflow.ts    # Edge routing and conditional loop definitions
│   │   ├── mcp/               # Model Context Protocol clients & server config
│   │   ├── safety/            # HITL permission gates & path blocklists
│   │   ├── services/          # External services (Pulumi execution engine)
│   │   ├── tools/             # Capabilities granted to LLMs
│   │   └── server.ts          # Socket.io Entry point server
│   ├── .env                   # Local env secrets & model routing
│   └── package.json
└── nexusflow-frontend/        # React Flow / AntD UI Dashboard
    ├── src/
    │   ├── App.jsx            # Main interactive dashboard
    │   ├── main.jsx
    │   └── index.css
    └── package.json

🚀 Getting Started

1. Prerequisites

Ensure you have the following installed locally:

  - Node.js (v18+)
  - Pulumi CLI (for local backend compilation)
  - Python & uv (virtualenv manager used by the Coder Agent)
  - Docker (to run the external AWS/Azure MCP servers)

2. Backend Installation & Setup

1.  Navigate to the backend directory and install dependencies:

    cd backend
    npm install

2.  Create a .env file in the backend/ directory:

    # OpenRouter LLM Routing
    OPENROUTER_API_KEY="sk-or-v1-..."
    OPENROUTER_BASE_URL="https://openrouter.ai/api/v1"
    APP_URL="http://localhost:5173"

    # Target LLM Models (Llama 70B models are recommended for JSON strictness)
    ARCHITECT_MODEL_NAME="meta-llama/llama-3.3-70b-instruct"
    PIPELINE_MODEL_NAME="meta-llama/llama-3.3-70b-instruct"
    DATAOPS_MODEL_NAME="meta-llama/llama-3.3-70b-instruct"
    DIAGRAM_MODEL_NAME="meta-llama/llama-3.1-8b-instruct"

    # Web Search Integration
    TAVILY_API_KEY="tvly-..."

    # Cloud Credentials (Injected into active shell commands)
    AWS_REGION="us-east-1"
    AWS_ACCESS_KEY_ID="..."
    AWS_SECRET_ACCESS_KEY="..."
    AZURE_SUBSCRIPTION_ID="..."

3.  Start the backend Socket.io server:

    npm run dev

3. Frontend Installation & Setup

1.  Navigate to the frontend directory and install dependencies:

    cd nexusflow-frontend
    npm install

2.  Start the development server:

    npm run dev

3.  Open your browser and navigate to http://localhost:5173 to interact with the
    dashboard.

🔒 Safety and Sandboxing

  - Allowed Directory Constraints: The Coder Agent is strictly limited to
    reading and writing inside the designated CodeSandBox/ folder. All target
    paths are checked against directory traversal vectors (..) before file
    system execution.
  - Blocked Commands: High-risk actions such as shell access requests containing
    strings like sudo, rm -rf /, kill, and standard partition formatting
    utilities are immediately rejected by the security validator.
  - User Configurable Allowlist: Users can add verified commands, file targets,
    and MCP services to .nexusflow-settings.json via the frontend settings
    dashboard to auto-approve repetitive pipeline tasks.

