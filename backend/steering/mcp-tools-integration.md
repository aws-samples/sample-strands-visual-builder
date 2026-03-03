---
inclusion: always
---

# MCP Tools Integration Guide

This guide covers all MCP (Model Context Protocol) integration patterns for Strands agents, including standard MCP servers and AgentCore Gateway.

## Quick Reference

| Transport Type | Client | Package | Use Case |
|---------------|--------|---------|----------|
| stdio | `stdio_client` | `mcp` | Local CLI tools |
| HTTP | `streamablehttp_client` | `mcp` | HTTP MCP servers |
| IAM HTTP | `aws_iam_streamablehttp_client` | `mcp-proxy-for-aws` | AgentCore Gateway |
| SSE | `sse_client` | `mcp` | Legacy servers |

## Managed Integration (Recommended)

Pass `MCPClient` directly to `Agent(tools=[...])` - lifecycle is managed automatically:

```python
from mcp import stdio_client, StdioServerParameters
from strands import Agent
from strands.tools.mcp import MCPClient

# Create MCP client
mcp_client = MCPClient(lambda: stdio_client(
    StdioServerParameters(
        command="uvx",
        args=["awslabs.aws-documentation-mcp-server@latest"]
    )
))

# Pass directly to agent - NO 'with' block needed!
agent = Agent(tools=[mcp_client])
response = agent("What is AWS Lambda?")
```

## Transport Patterns

### 1. Standard I/O (stdio) - Local CLI Tools

```python
from mcp import stdio_client, StdioServerParameters
from strands import Agent
from strands.tools.mcp import MCPClient

mcp_client = MCPClient(lambda: stdio_client(
    StdioServerParameters(
        command="uvx",
        args=["awslabs.aws-documentation-mcp-server@latest"]
    )
))

agent = Agent(tools=[mcp_client])
```

### 2. Streamable HTTP - Remote MCP Servers

```python
from mcp.client.streamable_http import streamablehttp_client
from strands import Agent
from strands.tools.mcp import MCPClient

mcp_client = MCPClient(
    lambda: streamablehttp_client("http://localhost:8000/mcp")
)

agent = Agent(tools=[mcp_client])
```

With authentication headers:
```python
import os

mcp_client = MCPClient(
    lambda: streamablehttp_client(
        url="https://api.example.com/mcp",
        headers={"Authorization": f"Bearer {os.getenv('API_TOKEN')}"}
    )
)
```

### 3. AgentCore Gateway - IAM Authenticated HTTP

**CRITICAL**: Use `aws_iam_streamablehttp_client` from `mcp_proxy_for_aws.client` (NOT from root package).

```python
from mcp_proxy_for_aws.client import aws_iam_streamablehttp_client
from strands import Agent
from strands.tools.mcp import MCPClient

# Gateway endpoint format: https://{gateway-id}.{region}.bedrock-agentcore.amazonaws.com/mcp
gateway_client = MCPClient(
    lambda: aws_iam_streamablehttp_client(
        endpoint="https://abc123.us-east-1.bedrock-agentcore.amazonaws.com/mcp",
        aws_region="us-east-1",
        aws_service="bedrock-agentcore"
    )
)

agent = Agent(tools=[gateway_client])
```

**Parameters**:
- `endpoint` (not `url`) - Full gateway MCP endpoint URL
- `aws_region` (not `region`) - AWS region
- `aws_service` - Always `"bedrock-agentcore"` for Gateway

### 4. SSE (Legacy)

```python
from mcp.client.sse import sse_client
from strands import Agent
from strands.tools.mcp import MCPClient

mcp_client = MCPClient(lambda: sse_client("http://localhost:8000/sse"))

agent = Agent(tools=[mcp_client])
```

## Multiple MCP Servers

Combine multiple MCP clients in a single agent:

```python
from mcp import stdio_client, StdioServerParameters
from mcp.client.streamable_http import streamablehttp_client
from mcp_proxy_for_aws.client import aws_iam_streamablehttp_client
from strands import Agent
from strands.tools.mcp import MCPClient

# Standard MCP server (stdio)
docs_client = MCPClient(lambda: stdio_client(
    StdioServerParameters(command="uvx", args=["awslabs.aws-documentation-mcp-server@latest"])
))

# HTTP MCP server
api_client = MCPClient(
    lambda: streamablehttp_client("http://localhost:8000/mcp")
)

# AgentCore Gateway
gateway_client = MCPClient(
    lambda: aws_iam_streamablehttp_client(
        endpoint="https://abc123.us-east-1.bedrock-agentcore.amazonaws.com/mcp",
        aws_region="us-east-1",
        aws_service="bedrock-agentcore"
    )
)

# Combine all - managed lifecycle for each
agent = Agent(tools=[docs_client, api_client, gateway_client])
```

## Tool Name Prefixing

Prevent name conflicts when using multiple servers:

```python
aws_client = MCPClient(
    lambda: stdio_client(StdioServerParameters(
        command="uvx", args=["awslabs.aws-documentation-mcp-server@latest"]
    )),
    prefix="aws_docs"  # Tools become: aws_docs_search_documentation, etc.
)

other_client = MCPClient(
    lambda: stdio_client(StdioServerParameters(
        command="uvx", args=["other-server@latest"]
    )),
    prefix="other"
)

agent = Agent(tools=[aws_client, other_client])
```

## Tool Filtering

Control which tools are loaded:

```python
import re

# Allow only specific tools
filtered_client = MCPClient(
    lambda: stdio_client(StdioServerParameters(
        command="uvx", args=["awslabs.aws-documentation-mcp-server@latest"]
    )),
    tool_filters={"allowed": ["search_documentation", "read_documentation"]}
)

# Regex patterns
regex_client = MCPClient(
    lambda: stdio_client(StdioServerParameters(
        command="uvx", args=["awslabs.aws-documentation-mcp-server@latest"]
    )),
    tool_filters={"allowed": [re.compile(r"^search_.*")]}
)
```

## Combining MCP with Regular Tools

```python
from strands import Agent, tool
from strands_tools import calculator
from strands.tools.mcp import MCPClient

@tool
def my_custom_tool(query: str) -> str:
    """Custom tool description."""
    return f"Processed: {query}"

mcp_client = MCPClient(lambda: stdio_client(...))

# Combine MCP client with regular tools
agent = Agent(tools=[mcp_client, calculator, my_custom_tool])
```

## AgentCore Gateway Notes

### Semantic Search Tool

Gateway automatically provides `x_amz_bedrock_agentcore_search` for semantic tool discovery. This is useful when you have many tools (100+) and want the LLM to search for relevant ones.

For small tool sets (< 10 tools), the LLM typically picks the right tool directly without needing semantic search.

### AgentCore Deployment with Gateway (CRITICAL)

When deploying agents with Gateway to AgentCore, use **lazy initialization** to avoid connection failures:

```python
from bedrock_agentcore import BedrockAgentCoreApp
from strands import Agent
from strands.models import BedrockModel
from strands.tools.mcp import MCPClient
from mcp_proxy_for_aws.client import aws_iam_streamablehttp_client

app = BedrockAgentCoreApp()

# Configuration
GATEWAY_ENDPOINT = "https://your-gateway.us-west-2.bedrock-agentcore.amazonaws.com/mcp"
REGION = "us-west-2"

# Lazy initialization - agent created on first invoke
_agent = None

def get_agent():
    """Lazy initialization of agent with Gateway client."""
    global _agent
    if _agent is None:
        gateway_client = MCPClient(lambda: aws_iam_streamablehttp_client(
            endpoint=GATEWAY_ENDPOINT,
            aws_region=REGION,
            aws_service="bedrock-agentcore"
        ))
        _agent = Agent(tools=[gateway_client])
    return _agent

@app.entrypoint
def invoke(payload):
    user_message = payload.get("prompt", "")
    agent = get_agent()  # Created on first call, reused after
    result = agent(user_message)
    return {"result": str(result)}

if __name__ == "__main__":
    app.run()
```

**Why lazy initialization?**
- MCPClient connects to Gateway during `Agent.__init__`
- At module load time, network may not be ready in AgentCore container
- Lazy init defers connection until first invoke when network is ready
- Agent is cached after first creation for performance

### Authentication Flow

When using Gateway created by our app:
1. **Runtime → Gateway**: IAM SigV4 (handled by `aws_iam_streamablehttp_client`)
2. **Gateway → Lambda**: Gateway's IAM role with `lambda:InvokeFunction` permission

### Requirements

Add to `requirements.txt` when using Gateway:
```
mcp-proxy-for-aws>=0.1.0
```

## Manual Context Management (Alternative)

For explicit lifecycle control, use context managers:

```python
with mcp_client:
    tools = mcp_client.list_tools_sync()
    agent = Agent(tools=tools)
    response = agent("Your prompt")  # Must be within 'with' block
```

**CRITICAL**: When using manual context management:
- Agent creation AND usage must be inside the `with` block
- Multiple clients: `with client1, client2:`
- Functions must return results, not agents

## Visual Builder Integration

When processing MCP components from visual configurations:

1. **Detect type**: Check for `command`+`args` (stdio), `url` (HTTP), or `gatewayEndpoint` (Gateway)
2. **Extract config**: Parse the `configuration` field (raw JSON string)
3. **Generate client**: Use appropriate transport based on type
4. **Use managed pattern**: `Agent(tools=[mcp_client])` - no `with` blocks needed

## Troubleshooting

### MCPClientInitializationError
If using manual context management, ensure agent is used within the `with` block.

### Connection Failures
- Verify server is running and accessible
- Check network/firewall settings
- Verify URL/command is correct

### Import Errors for Gateway
Wrong: `from mcp_proxy_for_aws import aws_iam_streamablehttp_client`
Correct: `from mcp_proxy_for_aws.client import aws_iam_streamablehttp_client`

### Wrong Parameters for Gateway
Wrong: `url=...`, `region=...`
Correct: `endpoint=...`, `aws_region=...`, `aws_service="bedrock-agentcore"`
