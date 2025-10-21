# Amazon Bedrock AgentCore Overview & Architecture

## What is Amazon Bedrock AgentCore?

Amazon Bedrock AgentCore is AWS's enterprise-grade platform for deploying and operating AI agents securely at scale. It's framework-agnostic and model-agnostic, supporting any agent framework (Strands, LangGraph, CrewAI, etc.) and any LLM.

## Core Services Architecture

### 1. AgentCore Runtime
- **Purpose**: Secure, serverless runtime for deploying agents
- **Key Features**:
  - Framework agnostic (works with Strands, LangGraph, CrewAI, custom)
  - Model flexible (Bedrock, OpenAI, Anthropic, etc.)
  - Extended execution time (up to 8 hours)
  - Session isolation with dedicated microVMs
  - 100MB payload support for multi-modal content
  - Consumption-based pricing
  - Built-in authentication via AgentCore Identity

### 2. AgentCore Memory
- **Purpose**: Managed memory infrastructure for context-aware agents
- **Features**:
  - Short-term memory for multi-turn conversations
  - Long-term memory shared across agents and sessions
  - Industry-leading accuracy
  - Full control over what agents remember

### 3. AgentCore Gateway
- **Purpose**: Convert APIs and Lambda functions into MCP-compatible tools
- **Features**:
  - Managed Model Context Protocol (MCP) server
  - OAuth ingress authorization
  - Secure egress credential exchange
  - Semantic search over tools
  - Scale to hundreds/thousands of tools

### 4. AgentCore Identity
- **Purpose**: Secure agent identity and access management
- **Features**:
  - Compatible with existing identity providers (Okta, Entra, Cognito)
  - Secure token vault
  - Just-enough access principles
  - Secure permission delegation

### 5. Built-in Tools
- **Code Interpreter**: Secure sandboxed code execution
- **Browser Tool**: Cloud-based web automation with enterprise security
- Both integrate seamlessly with popular frameworks

### 6. AgentCore Observability
- **Purpose**: Trace, debug, and monitor agent performance
- **Features**:
  - OpenTelemetry compatible telemetry
  - Unified operational dashboards
  - Detailed workflow visualizations
  - Agent reasoning step capture

## Deployment Architecture

```
Local Development → AgentCore Packaging → Runtime Deployment → Production Invocation
     ↓                      ↓                    ↓                    ↓
Strands Agent Code → BedrockAgentCoreApp → Container + ARN → InvokeAgentRuntime API
```

## Integration Points for Visual Builder

### Deployment Flow
1. **Code Generation**: Visual builder generates Strands agent code
2. **AgentCore Wrapping**: Wrap with `BedrockAgentCoreApp` entrypoint
3. **Packaging**: Create requirements.txt, Dockerfile, config files
4. **Deployment**: Use Starter Toolkit or direct APIs to deploy
5. **Runtime Management**: Store ARN, monitor status, handle updates

### Invocation Flow
1. **API Call**: Use `InvokeAgentRuntime` with agent ARN
2. **Streaming**: Process real-time response chunks
3. **Session Management**: Maintain conversation context
4. **Multi-modal**: Support text, images, audio, video inputs

## Key Benefits for Production Deployment

- **Zero Infrastructure**: No servers, containers, or scaling concerns
- **Enterprise Security**: Session isolation, authentication, compliance
- **Framework Flexibility**: Keep existing agent logic, any framework
- **Scalability**: Automatic scaling, consumption-based pricing
- **Observability**: Built-in monitoring, tracing, debugging
- **Integration**: Seamless AWS service integration

## Common Use Cases

1. **Customer Service Agents**: Deploy support automation at scale
2. **Data Analysis Agents**: Secure code execution for complex workflows
3. **Web Automation**: Browser-based task automation
4. **Multi-agent Systems**: Coordinated agent collaboration
5. **API Integration**: Convert existing services to agent tools

## Prerequisites for Integration

- AWS Account with appropriate permissions
- Python 3.10+ for agent development
- Model access (e.g., Anthropic Claude 4.0 in Bedrock)
- IAM permissions for AgentCore services
- Optional: Docker for local development/testing