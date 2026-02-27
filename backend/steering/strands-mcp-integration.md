---
inclusion: always
---

# Strands MCP Integration

## MCP Server Installation

```bash
# Install via uvx (recommended)
uvx strands-agents-mcp-server

# Test with MCP Inspector
npx @modelcontextprotocol/inspector uvx strands-agents-mcp-server
```

## MCP Client Configuration Examples

### Q Developer CLI
```json
// ~/.aws/amazonq/mcp.json
{
  "mcpServers": {
    "strands": {
      "command": "uvx",
      "args": ["strands-agents-mcp-server"]
    }
  }
}
```

### Claude Code
```bash
claude mcp add strands uvx strands-agents-mcp-server
```

### Cursor
```json
// ~/.cursor/mcp.json
{
  "mcpServers": {
    "strands": {
      "command": "uvx",
      "args": ["strands-agents-mcp-server"]
    }
  }
}
```

## MCP Integration in Strands Agents

```python
from strands import Agent
from strands.tools.mcp import MCPClient
from mcp import stdio_client, StdioServerParameters

# Connect to MCP server
aws_docs_client = MCPClient(
    lambda: stdio_client(StdioServerParameters(
        command="uvx", 
        args=["awslabs.aws-documentation-mcp-server@latest"]
    ))
)

# Use MCP tools in agent
with aws_docs_client:
    agent = Agent(tools=aws_docs_client.list_tools_sync())
    response = agent("Tell me about Amazon Bedrock")
```

## MCP Tool Loading Pattern

```python
from strands import Agent
from strands.tools.mcp import MCPClient
from mcp import stdio_client, StdioServerParameters

# Multiple MCP servers
servers = [
    MCPClient(lambda: stdio_client(StdioServerParameters(
        command="uvx", args=["awslabs.aws-documentation-mcp-server@latest"]
    ))),
    MCPClient(lambda: stdio_client(StdioServerParameters(
        command="uvx", args=["strands-agents-mcp-server"]
    )))
]

# Combine tools from multiple servers
all_tools = []
for server in servers:
    with server:
        all_tools.extend(server.list_tools_sync())

agent = Agent(tools=all_tools)
```

## MCP in Visual Builder Context

For the visual builder, MCP servers could provide:
- **Documentation tools** - Access to Strands documentation
- **External APIs** - Integration with third-party services
- **Specialized tools** - Domain-specific functionality

## MCP Server Development

```bash
# Development setup
git clone https://github.com/strands-agents/mcp-server.git
cd mcp-server
python3 -m venv venv
source venv/bin/activate
pip3 install -e .

# Test locally
npx @modelcontextprotocol/inspector python -m strands_mcp_server
```

## Prerequisites

- [uv](https://github.com/astral-sh/uv) installed
- [Node.js](https://nodejs.org/) for MCP Inspector
- Python 3.10+ for development