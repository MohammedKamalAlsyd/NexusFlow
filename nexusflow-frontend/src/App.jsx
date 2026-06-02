import React, { useState, useEffect, useRef } from "react";
import {
  ConfigProvider,
  Typography,
  Tabs,
  Timeline,
  Input,
  Button,
  Flex,
  Avatar,
  Badge,
  Tag,
  Space,
} from "antd";
import {
  MdSend,
  MdSmartToy,
  MdArchitecture,
  MdCode,
  MdDataObject,
  MdCloud,
  MdStorage,
  MdWarning,
  MdCheckCircle,
} from "react-icons/md";

// Standard React Flow Imports
import ReactFlow, { Background, Controls, MarkerType } from "reactflow";
import "reactflow/dist/style.css";

const { Title, Text } = Typography;

// --- PREMIUM LIGHT-THEME CODE BLOCK ---
const codeBlockStyle = {
  margin: 0,
  padding: "16px",
  background: "#0f172a", // High-contrast terminal background for readability
  color: "#e2e8f0",
  borderRadius: "12px",
  overflow: "auto",
  fontSize: "13px",
  fontFamily: '"Fira Code", monospace',
  border: "1px solid #e2e8f0",
};

const MOCK_PULUMI_CODE = `import pulumi
import pulumi_aws as aws

raw_bucket = aws.s3.Bucket("raw-data-lake")
clean_bucket = aws.s3.Bucket("clean-parquet-lake")

# Dynamic Self-Healing Patch: Added Role ARN definition
glue_role = aws.iam.Role("glue-execution-role",
    assume_role_policy='{"Version":"2012-10-17","Statement":[{"Action":"sts:AssumeRole","Principal":{"Service":"glue.amazonaws.com"},"Effect":"Allow"}]}'
)

glue_job = aws.glue.Job("etl-pyspark-job",
    role_arn=glue_role.arn, # Configured correctly
    command=aws.glue.JobCommandArgs(
        script_location=f"s3://{raw_bucket.id}/scripts/clean_etl.py", 
        python_version="3"
    )
)`;

const MOCK_PYSPARK_CODE = `import sys
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext
from awsglue.context import GlueContext

args = getResolvedOptions(sys.argv, ['JOB_NAME', 'RAW_PATH', 'CLEAN_PATH'])
spark = GlueContext(SparkContext()).spark_session

# Clean Customer Emails
df = spark.read.csv(args['RAW_PATH'], header=True)
cleaned = df.dropna(subset=["email"]).withColumn("email", lower(col("email")))

cleaned.write.mode("overwrite").parquet(args['CLEAN_PATH'])`;

// --- LIGHT-MODE REACT FLOW DESIGN ---
const initialNodes = [
  {
    id: "raw-s3",
    position: { x: 30, y: 80 },
    data: { label: "🪣 S3 Raw Bucket" },
    type: "input",
    style: {
      background: "#ffffff",
      border: "2px solid #6366f1",
      borderRadius: "12px",
      padding: "12px",
      color: "#1e293b",
      fontWeight: 600,
      boxShadow: "0 4px 12px rgba(99, 102, 241, 0.08)",
    },
  },
  {
    id: "glue-job",
    position: { x: 240, y: 80 },
    data: { label: "⚙️ AWS Glue ETL" },
    style: {
      background: "#ffffff",
      border: "2px solid #f59e0b",
      borderRadius: "12px",
      padding: "12px",
      color: "#1e293b",
      fontWeight: 600,
      boxShadow: "0 4px 12px rgba(245, 158, 11, 0.08)",
    },
  },
  {
    id: "clean-s3",
    position: { x: 450, y: 80 },
    data: { label: "✨ S3 Parquet Outlet" },
    type: "output",
    style: {
      background: "#ffffff",
      border: "2px solid #10b981",
      borderRadius: "12px",
      padding: "12px",
      color: "#1e293b",
      fontWeight: 600,
      boxShadow: "0 4px 12px rgba(16, 185, 129, 0.08)",
    },
  },
];

const initialEdges = [
  {
    id: "e1",
    source: "raw-s3",
    target: "glue-job",
    animated: true,
    style: { stroke: "#6366f1", strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "#6366f1" },
  },
  {
    id: "e2",
    source: "glue-job",
    target: "clean-s3",
    animated: true,
    style: { stroke: "#f59e0b", strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "#f59e0b" },
  },
];

const PERSONAS = [
  { role: "architect", name: "Cloud Architect", color: "#6366f1" },
  { role: "coder", name: "Pipeline Coder", color: "#8b5cf6" },
  { role: "deployer", name: "Deployer Engine", color: "#f59e0b" },
  { role: "dataops", name: "DataOps Manager", color: "#10b981" },
];

export default function NexusDashboard() {
  const chatEndRef = useRef(null);

  // Real conversational history (8 steps representing full agent life-cycle)
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: "bot",
      persona: PERSONAS[0],
      content:
        "Hello! I am the Cloud Architect. Tell me about the data pipeline we are designing today.",
    },
    {
      id: 2,
      sender: "user",
      persona: null,
      content:
        "I need a pipeline to ingest raw sales CSV files from my existing S3 bucket, clean the customer email column, and write it back to S3 in Parquet format.",
    },
    {
      id: 3,
      sender: "bot",
      persona: PERSONAS[0],
      content:
        'Understood. Scanning AWS active resources... Found matching bucket "sales-data-lake-2024". Strategy selected: BROWNFIELD_ETL. Passing blueprint to Coder Agent.',
    },
    {
      id: 4,
      sender: "bot",
      persona: PERSONAS[1],
      content:
        'Coder here! I scaffolded the workspace using uv. Generated the PySpark script "etl_job.py" and initialized Pulumi IaC. Passing manifests to Deployer.',
    },
    {
      id: 5,
      sender: "bot",
      persona: PERSONAS[2],
      content:
        '⚠️ PULUMI DEPLOYMENT FAILED:\nTypeError: Missing required argument "role_arn" for aws.glue.Job. Sending stack trace logs back to Coder for diagnostics.',
    },
    {
      id: 6,
      sender: "bot",
      persona: PERSONAS[1],
      content:
        'Analyzing error... Ah! I forgot to map the IAM Role execution ARN. Writing fix to "__main__.py" to include iam.Role mapping. Retrying deployment.',
    },
    {
      id: 7,
      sender: "bot",
      persona: PERSONAS[2],
      content:
        "Retry deployment... Success! All S3 resource hooks and AWS Glue Job definitions are active in the dev stack. Over to DataOps to trigger job run.",
    },
    {
      id: 8,
      sender: "bot",
      persona: PERSONAS[3],
      content:
        "Triggered Glue job run. Polling status checks... Job status: SUCCEEDED. Inspected target S3 directory: verified cleaned parquet files exist.",
    },
  ]);

  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    // Standard user prompt append
    setMessages((prev) => [
      ...prev,
      { id: Date.now(), sender: "user", content: inputValue },
    ]);
    setInputValue("");

    // Quick reactive swarm response
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: "bot",
          persona: PERSONAS[3],
          content:
            "Analysis request received. Scoping pipeline context and tracing schema validation hooks.",
        },
      ]);
    }, 1000);
  };

  return (
    <ConfigProvider
      theme={{
        token: {
          fontFamily: '"Inter", sans-serif',
          borderRadius: 16,
          colorPrimary: "#4f46e5", // Sleek Indigo accent
          colorBgBase: "#f8fafc",
          colorBgContainer: "#ffffff",
          colorBorder: "#e2e8f0",
        },
        components: {
          Tabs: { itemColor: "#64748b", itemSelectedColor: "#4f46e5" },
        },
      }}
    >
      {/* 2-Column Responsive Dashboard with 40/60 viewport split */}
      <div
        style={{
          height: "100vh",
          width: "100vw",
          background: "#f8fafc",
          padding: "20px",
          display: "flex",
          gap: "20px",
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      >
        {/* LEFT COLUMN: Expanded Interactive Chat Console (40% width) */}
        <div
          style={{
            width: "40%",
            flexShrink: 0,
            background: "#ffffff",
            borderRadius: "24px",
            boxShadow: "0 4px 20px -2px rgba(0,0,0,0.03)",
            display: "flex",
            flexDirection: "column",
            border: "1px solid #e2e8f0",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "24px 24px 16px",
              borderBottom: "1px solid #f1f5f9",
            }}
          >
            <Flex align="center" gap="small">
              <div
                style={{
                  background: "#eef2ff",
                  padding: "8px",
                  borderRadius: "12px",
                  display: "flex",
                }}
              >
                <MdCloud size={20} color="#4f46e5" />
              </div>
              <Title
                level={5}
                style={{ margin: 0, fontWeight: 600, color: "#0f172a" }}
              >
                NexusFlow Swarm
              </Title>
            </Flex>
            <div style={{ marginTop: 12 }}>
              <Badge
                status="processing"
                text={
                  <span style={{ color: "#475569", fontSize: "12px" }}>
                    Swarm Ready
                  </span>
                }
              />
            </div>
          </div>

          {/* Messages Feed */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
            }}
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: msg.sender === "user" ? "flex-end" : "flex-start",
                }}
              >
                {msg.sender === "bot" && (
                  <Space style={{ marginBottom: 4 }}>
                    <Avatar
                      size={22}
                      style={{ backgroundColor: msg.persona.color }}
                      icon={<MdSmartToy size={12} />}
                    />
                    <Text
                      style={{
                        fontSize: "11px",
                        color: "#64748b",
                        fontWeight: 600,
                      }}
                    >
                      {msg.persona.name}
                    </Text>
                  </Space>
                )}
                <div
                  style={{
                    background:
                      msg.sender === "user"
                        ? "#4f46e5"
                        : msg.content.includes("⚠️")
                          ? "#fef2f2"
                          : "#f1f5f9",
                    color:
                      msg.sender === "user"
                        ? "#ffffff"
                        : msg.content.includes("⚠️")
                          ? "#991b1b"
                          : "#334155",
                    padding: "12px 16px",
                    borderRadius:
                      msg.sender === "user"
                        ? "16px 16px 4px 16px"
                        : "4px 16px 16px 16px",
                    maxWidth: "90%",
                    fontSize: "13.5px",
                    lineHeight: "1.5",
                    border: msg.content.includes("⚠️")
                      ? "1px solid #fee2e2"
                      : msg.sender === "bot"
                        ? "1px solid #e2e8f0"
                        : "none",
                    whiteSpace: "pre-line", // Preserve spacing for logs
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input Prompt */}
          <div
            style={{
              padding: "20px",
              background: "#fff",
              borderRadius: "0 0 24px 24px",
              borderTop: "1px solid #f1f5f9",
            }}
          >
            <Input
              size="large"
              placeholder="Prompt the swarm..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onPressEnter={handleSendMessage}
              suffix={
                <Button
                  type="primary"
                  shape="circle"
                  icon={<MdSend size={14} />}
                  onClick={handleSendMessage}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                />
              }
              style={{
                borderRadius: "12px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
              }}
            />
          </div>
        </div>

        {/* RIGHT COLUMN: Created Assets & Diagram Canvas (60% width) */}
        <div
          style={{
            width: "60%",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            minWidth: 0,
          }}
        >
          {/* React Flow Cloud Diagram Workspace (Top Half) */}
          <div
            style={{
              flex: 1.2,
              background: "#ffffff",
              borderRadius: "24px",
              position: "relative",
              boxShadow: "0 4px 20px -2px rgba(0,0,0,0.03)",
              border: "1px solid #e2e8f0",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: "16px 24px",
                borderBottom: "1px solid #f1f5f9",
                background: "#fff",
                zIndex: 10,
              }}
            >
              <Space>
                <MdArchitecture size={18} color="#4f46e5" />
                <Text strong style={{ color: "#0f172a" }}>
                  Live Architecture Preview
                </Text>
              </Space>
            </div>

            <div style={{ flex: 1, width: "100%", height: "100%" }}>
              <ReactFlow
                nodes={initialNodes}
                edges={initialEdges}
                fitView
                attributionPosition="bottom-right"
              >
                <Background color="#94a3b8" gap={16} size={1} />
                <Controls />
              </ReactFlow>
            </div>
          </div>

          {/* Technical Assets: Code Tabs & Tracing (Bottom Half) */}
          <div
            style={{
              flex: 1,
              background: "#ffffff",
              borderRadius: "24px",
              padding: "12px 24px 24px",
              boxShadow: "0 4px 20px -2px rgba(0,0,0,0.03)",
              border: "1px solid #e2e8f0",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <Tabs
              defaultActiveKey="code1"
              style={{ height: "100%" }}
              items={[
                {
                  key: "code1",
                  label: (
                    <span
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <MdCode size={16} /> Pulumi Python
                    </span>
                  ),
                  children: (
                    <pre style={codeBlockStyle}>
                      <code>{MOCK_PULUMI_CODE}</code>
                    </pre>
                  ),
                },
                {
                  key: "code2",
                  label: (
                    <span
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <MdDataObject size={16} /> PySpark ETL
                    </span>
                  ),
                  children: (
                    <pre style={codeBlockStyle}>
                      <code>{MOCK_PYSPARK_CODE}</code>
                    </pre>
                  ),
                },
                {
                  key: "trace",
                  label: (
                    <span
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <MdStorage size={16} /> Live Trace
                    </span>
                  ),
                  children: (
                    <div
                      style={{
                        padding: "16px 24px",
                        background: "#f8fafc",
                        borderRadius: "12px",
                        overflowY: "auto",
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      <Timeline
                        items={[
                          {
                            color: "green",
                            children: (
                              <span
                                style={{ color: "#475569", fontSize: "12px" }}
                              >
                                ArchitectNode: Discovered sales-data-lake-2024
                                S3 bucket
                              </span>
                            ),
                          },
                          {
                            color: "blue",
                            children: (
                              <span
                                style={{ color: "#475569", fontSize: "12px" }}
                              >
                                PipelineCoderNode: Pulumi / PySpark manifests
                                compiled
                              </span>
                            ),
                          },
                          {
                            color: "red",
                            children: (
                              <span
                                style={{ color: "#475569", fontSize: "12px" }}
                              >
                                DeployerNode: Pulumi Up failed (missing role_arn
                                parameter)
                              </span>
                            ),
                          },
                          {
                            color: "purple",
                            children: (
                              <span
                                style={{ color: "#475569", fontSize: "12px" }}
                              >
                                PipelineCoderNode: Self-healed deployment
                                template with fixed IAM block
                              </span>
                            ),
                          },
                          {
                            color: "green",
                            children: (
                              <span
                                style={{ color: "#475569", fontSize: "12px" }}
                              >
                                DeployerNode: Stack provisioned successfully
                              </span>
                            ),
                          },
                          {
                            color: "green",
                            children: (
                              <span
                                style={{ color: "#475569", fontSize: "12px" }}
                              >
                                DataOpsNode: ETL Output validated
                              </span>
                            ),
                          },
                        ]}
                      />
                    </div>
                  ),
                },
              ]}
            />
          </div>
        </div>
      </div>
    </ConfigProvider>
  );
}
