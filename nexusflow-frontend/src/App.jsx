import { useState, useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";
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
  Space,
  Modal,
  Form,
  Select,
  message,
  Spin,
  Table,
  Tag,
  Tooltip,
} from "antd";
import {
  MdSend,
  MdSmartToy,
  MdArchitecture,
  MdCode,
  MdDataObject,
  MdCloud,
  MdStorage,
  MdSettings,
  MdWifiOff,
  MdSecurity,
  MdDelete,
} from "react-icons/md";
import { DeleteOutlined } from "@ant-design/icons";
import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
} from "reactflow";
import "reactflow/dist/style.css";

const { Title, Text } = Typography;
const BACKEND_URL = "http://localhost:4000";

const codeBlockStyle = {
  margin: 0,
  padding: "16px",
  background: "#0f172a",
  color: "#e2e8f0",
  borderRadius: "12px",
  overflow: "auto",
  fontSize: "13px",
  fontFamily: '"Fira Code", monospace',
  border: "1px solid #e2e8f0",
  height: "100%",
};

const PERSONAS = {
  architect: { role: "architect", name: "Cloud Architect", color: "#6366f1" },
  "pipeline-coder": { role: "coder", name: "Pipeline Coder", color: "#8b5cf6" },
  deployer: { role: "deployer", name: "Deployer Engine", color: "#f59e0b" },
  "data-ops": { role: "dataops", name: "DataOps Manager", color: "#10b981" },
  system: { role: "system", name: "System Logs", color: "#64748b" },
};

const DEFAULT_MESSAGES = [
  {
    id: 1,
    sender: "bot",
    persona: PERSONAS["architect"],
    content:
      "Hello! I am the NexusFlow Architect. Tell me about the data pipeline we are designing today.",
  },
];

export default function NexusDashboard() {
  const chatEndRef = useRef(null);
  const socketRef = useRef(null);
  const [form] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();

  // App & Session States
  const [messages, setMessages] = useState(DEFAULT_MESSAGES);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isServerConnected, setIsServerConnected] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState(() =>
    Date.now().toString(),
  );

  // Security Modal State
  const [pendingApproval, setPendingApproval] = useState(null);

  // Tracing & Artifact States
  const [traceLogs, setTraceLogs] = useState([]);
  const [code, setCode] = useState({
    pulumi: "# Waiting for generation...",
    pyspark: "# Waiting for generation...",
  });
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [config, setConfig] = useState(null);

  useEffect(
    () => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }),
    [messages, isStreaming, pendingApproval],
  );

  const fetchConfig = useCallback(() => {
    fetch(`${BACKEND_URL}/api/config`)
      .then((res) => res.json())
      .then((data) => {
        setConfig(data);
        form.setFieldsValue({
          confirmationMode: data.preferences?.confirmationMode || "manual",
          pulumiBackend: data.pulumi?.backend || "local",
        });
      })
      .catch(console.error);
  }, [form]);

  // Establish WebSocket Connection
  useEffect(() => {
    const socket = io(BACKEND_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      setIsServerConnected(true);
      fetchConfig();
    });

    socket.on("disconnect", () => setIsServerConnected(false));

    socket.on("system_log", (data) => {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + Math.random(),
          sender: "system",
          persona: PERSONAS["system"],
          content: data.message,
        },
      ]);
    });

    socket.on("node_update", (data) => {
      const persona = PERSONAS[data.node] || PERSONAS["system"];
      let chatContent = data.message;
      if (data.errors)
        chatContent += `\n\n⚠️ DIAGNOSTIC ERRORS:\n${data.errors}`;

      if (chatContent) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + Math.random(),
            sender: "bot",
            persona,
            content: chatContent,
          },
        ]);
      }

      setTraceLogs((prev) => [
        ...prev,
        {
          color: data.errors ? "red" : "blue",
          node: data.node,
          step: data.step || "Processing",
        },
      ]);

      if (data.diagram?.nodes?.length > 0) {
        setNodes(data.diagram.nodes);
        setEdges(data.diagram.edges || []);
      }

      if (data.code?.pulumi || data.code?.pyspark) {
        setCode((prev) => ({
          pulumi: data.code.pulumi || prev.pulumi,
          pyspark: data.code.pyspark || prev.pyspark,
        }));
      }
    });

    socket.on("permission_request", (data, callback) => {
      setPendingApproval({ ...data, resolveFunction: callback });
    });

    socket.on("workflow_complete", () => setIsStreaming(false));
    socket.on("error", (data) => {
      messageApi.error(data.message);
      setIsStreaming(false);
    });

    return () => socket.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClearChat = () => {
    setMessages(DEFAULT_MESSAGES);
    setTraceLogs([]);
    setNodes([]);
    setEdges([]);
    setCode({
      pulumi: "# Waiting for generation...",
      pyspark: "# Waiting for generation...",
    });
    setCurrentSessionId(Date.now().toString());
    messageApi.success("Workspace cleared.");
  };

  const handleSaveConfig = async (values) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferences: { confirmationMode: values.confirmationMode },
          pulumi: { backend: values.pulumiBackend },
        }),
      });
      const data = await res.json();
      setConfig(data.config);
      messageApi.success("Configuration updated!");
      setIsSettingsOpen(false);
    } catch {
      messageApi.error("Failed to save config.");
    }
  };

  const handleRemoveAllowlistItem = async (category, target) => {
    const updatedList = { ...config.allowList };
    updatedList[category] = updatedList[category].filter(
      (rule) => rule.target !== target,
    );
    try {
      const res = await fetch(`${BACKEND_URL}/api/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowList: updatedList }),
      });
      const data = await res.json();
      setConfig(data.config);
      messageApi.success("Allowlist updated.");
    } catch {
      messageApi.error("Failed to update allowlist.");
    }
  };

  const handleApprove = (decision) => {
    if (!pendingApproval) return;
    pendingApproval.resolveFunction(decision);
    setPendingApproval(null);
    if (decision === "allow_always") fetchConfig();
  };

  const handleStopGeneration = () => {
    if (socketRef.current) {
      socketRef.current.emit("stop_generation", {
        sessionId: currentSessionId,
      });
      setIsStreaming(false);
      messageApi.info("Workflow execution halted.");
    }
  };

  const handleSendMessage = () => {
    if (!inputValue.trim() || isStreaming || !isServerConnected) return;

    const userPrompt = inputValue;
    setMessages((prev) => [
      ...prev,
      { id: Date.now(), sender: "user", content: userPrompt },
    ]);
    setInputValue("");
    setIsStreaming(true);

    socketRef.current.emit("start_chat", {
      prompt: userPrompt,
      sessionId: currentSessionId,
    });
  };

  const allowlistColumns = (category) => [
    {
      title: "Target",
      dataIndex: "target",
      key: "target",
      render: (text) => <Text code>{text}</Text>,
    },
    {
      title: "Operation",
      dataIndex: "operation",
      key: "operation",
      render: (text) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: "Action",
      key: "action",
      render: (_, record) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => handleRemoveAllowlistItem(category, record.target)}
        />
      ),
    },
  ];

  return (
    <ConfigProvider
      theme={{
        token: {
          fontFamily: '"Inter", sans-serif',
          borderRadius: 16,
          colorPrimary: "#4f46e5",
        },
        components: {
          Tabs: { itemColor: "#64748b", itemSelectedColor: "#4f46e5" },
        },
      }}
    >
      {contextHolder}
      <div
        style={{
          height: "100vh",
          width: "100vw",
          background: "#f8fafc",
          padding: "20px",
          display: "flex",
          gap: "20px",
          boxSizing: "border-box",
        }}
      >
        {/* Left Column: Chat Console */}
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
          <div
            style={{
              padding: "24px 24px 16px",
              borderBottom: "1px solid #f1f5f9",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Flex align="center" gap="small">
              <div
                style={{
                  background: isServerConnected ? "#eef2ff" : "#fef2f2",
                  padding: "8px",
                  borderRadius: "12px",
                  display: "flex",
                }}
              >
                {isServerConnected ? (
                  <MdCloud size={20} color="#4f46e5" />
                ) : (
                  <MdWifiOff size={20} color="#dc2626" />
                )}
              </div>
              <div>
                <Title
                  level={5}
                  style={{ margin: 0, fontWeight: 600, color: "#0f172a" }}
                >
                  NexusFlow Swarm
                </Title>
                <Badge
                  status={
                    !isServerConnected
                      ? "error"
                      : isStreaming
                        ? "processing"
                        : "success"
                  }
                  text={
                    <span
                      style={{
                        color: !isServerConnected ? "#dc2626" : "#475569",
                        fontSize: "12px",
                      }}
                    >
                      {!isServerConnected
                        ? "Server Offline"
                        : isStreaming
                          ? pendingApproval
                            ? "Waiting for Human..."
                            : "Swarm Executing..."
                          : "Swarm Ready"}
                    </span>
                  }
                />
              </div>
            </Flex>
            <Space>
              <Tooltip title="Clear Chat & Workspace">
                <Button
                  type="text"
                  danger
                  icon={<MdDelete size={20} />}
                  onClick={handleClearChat}
                  disabled={isStreaming}
                />
              </Tooltip>
              <Tooltip title="Settings">
                <Button
                  type="text"
                  icon={<MdSettings size={20} />}
                  onClick={() => setIsSettingsOpen(true)}
                  disabled={!isServerConnected}
                />
              </Tooltip>
            </Space>
          </div>

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
                  width: "100%",
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
                        : msg.sender === "system"
                          ? "#1e293b"
                          : msg.content.includes("⚠️")
                            ? "#fef2f2"
                            : "#f1f5f9",
                    color:
                      msg.sender === "user"
                        ? "#ffffff"
                        : msg.sender === "system"
                          ? "#38bdf8"
                          : msg.content.includes("⚠️")
                            ? "#991b1b"
                            : "#334155",
                    padding: msg.sender === "system" ? "8px 12px" : "12px 16px",
                    borderRadius:
                      msg.sender === "user"
                        ? "16px 16px 4px 16px"
                        : "4px 16px 16px 16px",
                    maxWidth: "90%",
                    fontSize: msg.sender === "system" ? "12px" : "13.5px",
                    lineHeight: "1.5",
                    border: msg.content.includes("⚠️")
                      ? "1px solid #fee2e2"
                      : msg.sender === "system"
                        ? "1px solid #0f172a"
                        : "none",
                    whiteSpace: "pre-wrap",
                    fontFamily:
                      msg.sender === "system"
                        ? '"Fira Code", monospace'
                        : "inherit",
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {isStreaming && !pendingApproval && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "12px 16px",
                }}
              >
                <Spin size="small" />{" "}
                <Text type="secondary" style={{ fontSize: "12px" }}>
                  Processing...
                </Text>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

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
              placeholder={
                isServerConnected
                  ? "Prompt the swarm..."
                  : "Waiting for backend server..."
              }
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onPressEnter={handleSendMessage}
              disabled={isStreaming || !isServerConnected}
              suffix={
                isStreaming ? (
                  <Button
                    type="primary"
                    danger
                    shape="circle"
                    icon={<MdDelete size={14} />}
                    onClick={handleStopGeneration}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  />
                ) : (
                  <Button
                    type="primary"
                    shape="circle"
                    icon={<MdSend size={14} />}
                    onClick={handleSendMessage}
                    disabled={!isServerConnected}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  />
                )
              }
              style={{
                borderRadius: "12px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
              }}
            />
          </div>
        </div>

        {/* Right Column: Assets & Diagram */}
        <div
          style={{
            width: "60%",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            minWidth: 0,
          }}
        >
          <div
            style={{
              flex: 1.2,
              background: "#ffffff",
              borderRadius: "24px",
              position: "relative",
              border: "1px solid #e2e8f0",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: "16px 24px",
                borderBottom: "1px solid #f1f5f9",
                zIndex: 10,
              }}
            >
              <Space>
                <MdArchitecture size={18} color="#4f46e5" />
                <Text strong>Live Architecture Preview</Text>
              </Space>
            </div>
            <div style={{ flex: 1, width: "100%", height: "100%" }}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                fitView
              >
                <Background color="#94a3b8" gap={16} size={1} />
                <Controls />
              </ReactFlow>
            </div>
          </div>

          <div
            style={{
              flex: 1,
              background: "#ffffff",
              borderRadius: "24px",
              padding: "12px 24px 24px",
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
                    <span>
                      <MdCode /> Pulumi Python
                    </span>
                  ),
                  children: (
                    <pre style={codeBlockStyle}>
                      <code>{code.pulumi}</code>
                    </pre>
                  ),
                },
                {
                  key: "code2",
                  label: (
                    <span>
                      <MdDataObject /> PySpark ETL
                    </span>
                  ),
                  children: (
                    <pre style={codeBlockStyle}>
                      <code>{code.pyspark}</code>
                    </pre>
                  ),
                },
                {
                  key: "trace",
                  label: (
                    <span>
                      <MdStorage /> Live Trace
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
                        height: "100%",
                      }}
                    >
                      <Timeline
                        items={traceLogs.map((log, i) => ({
                          color: log.color,
                          children: (
                            <span
                              key={i}
                              style={{ color: "#475569", fontSize: "12px" }}
                            >
                              <b>[{log.node}]</b> {log.step}
                            </span>
                          ),
                        }))}
                      />
                    </div>
                  ),
                },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Security Approval Modal */}
      <Modal
        title={
          <Space>
            <MdSecurity color="#dc2626" /> Action Requires Approval
          </Space>
        }
        open={!!pendingApproval}
        closable={false}
        maskClosable={false}
        footer={[
          <Button key="deny" danger onClick={() => handleApprove("deny")}>
            Deny
          </Button>,
          <Button key="once" onClick={() => handleApprove("allow_once")}>
            Allow Once
          </Button>,
          <Button
            key="always"
            type="primary"
            onClick={() => handleApprove("allow_always")}
          >
            Allow Always
          </Button>,
        ]}
      >
        <div style={{ padding: "16px 0" }}>
          <Text type="secondary">{pendingApproval?.displayMessage}</Text>
          <div
            style={{
              marginTop: 16,
              padding: 12,
              background: "#f8fafc",
              borderRadius: 8,
              border: "1px dashed #cbd5e1",
            }}
          >
            <p style={{ margin: 0 }}>
              <b>Category:</b> {pendingApproval?.category}
            </p>
            <p style={{ margin: 0 }}>
              <b>Operation:</b> {pendingApproval?.operation}
            </p>
            <p style={{ margin: 0 }}>
              <b>Target:</b> <Text code>{pendingApproval?.target}</Text>
            </p>
          </div>
        </div>
      </Modal>

      {/* Settings Modal */}
      <Modal
        title="NexusFlow Settings"
        open={isSettingsOpen}
        onCancel={() => setIsSettingsOpen(false)}
        onOk={() => form.submit()}
        okText="Save Changes"
        width={600}
      >
        <Tabs
          defaultActiveKey="general"
          items={[
            {
              key: "general",
              label: "General",
              children: (
                <Form
                  form={form}
                  layout="vertical"
                  onFinish={handleSaveConfig}
                  style={{ marginTop: 20 }}
                >
                  <Form.Item
                    name="confirmationMode"
                    label="Execution Safety Mode (HITL)"
                  >
                    <Select>
                      <Select.Option value="manual">
                        Manual (Prompt for Approval)
                      </Select.Option>
                      <Select.Option value="auto">
                        Auto-Approve (Autonomous)
                      </Select.Option>
                    </Select>
                  </Form.Item>
                  <Form.Item name="pulumiBackend" label="Pulumi Backend">
                    <Select>
                      <Select.Option value="local">
                        Local (File system)
                      </Select.Option>
                      <Select.Option value="cloud">
                        Cloud (requires PULUMI_ACCESS_TOKEN)
                      </Select.Option>
                    </Select>
                  </Form.Item>
                </Form>
              ),
            },
            {
              key: "allowlist",
              label: "Allowlist",
              children: (
                <div style={{ marginTop: 10 }}>
                  <Text type="secondary">
                    Commands and files that are automatically approved during
                    execution.
                  </Text>

                  <Title level={5} style={{ marginTop: 16 }}>
                    Commands
                  </Title>
                  <Table
                    size="small"
                    dataSource={config?.allowList?.commands || []}
                    columns={allowlistColumns("commands")}
                    pagination={false}
                    rowKey="target"
                  />

                  <Title level={5} style={{ marginTop: 16 }}>
                    Files
                  </Title>
                  <Table
                    size="small"
                    dataSource={config?.allowList?.files || []}
                    columns={allowlistColumns("files")}
                    pagination={false}
                    rowKey="target"
                  />

                  <Title level={5} style={{ marginTop: 16 }}>
                    MCP Tools
                  </Title>
                  <Table
                    size="small"
                    dataSource={config?.allowList?.mcp || []}
                    columns={allowlistColumns("mcp")}
                    pagination={false}
                    rowKey="target"
                  />
                </div>
              ),
            },
          ]}
        />
      </Modal>
    </ConfigProvider>
  );
}
