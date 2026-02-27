---
inclusion: always
---

# Strands SDK Core Patterns

## Basic Agent Creation

```python
from strands import Agent
from strands_tools import calculator

# Simple agent with tools
agent = Agent(tools=[calculator])
response = agent("What is the square root of 1764")
```

## Custom Tool Creation

```python
from strands import Agent, tool

@tool
def word_count(text: str) -> int:
    """Count words in text.

    This docstring is used by the LLM to understand the tool's purpose.
    """
    return len(text.split())

agent = Agent(tools=[word_count])
response = agent("How many words are in this sentence?")
```

## Model Configuration

```python
from strands import Agent
from strands.models import BedrockModel

# Bedrock model configuration
bedrock_model = BedrockModel(
    model_id="us.amazon.nova-pro-v1:0",
    temperature=0.3,
    streaming=True,
)
agent = Agent(model=bedrock_model)
```

## Hot Reloading Tools

```python
from strands import Agent

# Agent will watch ./tools/ directory for changes
agent = Agent(load_tools_from_directory=True)
response = agent("Use any tools you find in the tools directory")
```

## MCP Integration

```python
from strands import Agent
from strands.tools.mcp import MCPClient
from mcp import stdio_client, StdioServerParameters

aws_docs_client = MCPClient(
    lambda: stdio_client(StdioServerParameters(command="uvx", args=["awslabs.aws-documentation-mcp-server@latest"]))
)

with aws_docs_client:
   agent = Agent(tools=aws_docs_client.list_tools_sync())
   response = agent("Tell me about Amazon Bedrock")
```

## Installation Requirements

```bash
# Basic installation
pip install strands-agents strands-agents-tools

# Virtual environment setup
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install strands-agents strands-agents-tools
```

## Key Imports

```python
# Core imports
from strands import Agent, tool

# Model providers
from strands.models import BedrockModel
from strands.models.ollama import OllamaModel
from strands.models.llamaapi import LlamaAPIModel

# MCP support
from strands.tools.mcp import MCPClient
from mcp import stdio_client, StdioServerParameters

# Example tools
from strands_tools import calculator, shell, python_repl
```

## Agent Constructor Parameters

- `model`: Model provider instance (defaults to Bedrock Claude 4 Sonnet)
- `tools`: List of tool functions or tool instances
- `system_prompt`: System prompt string
- `callback_handler`: Function for handling streaming events
- `load_tools_from_directory`: Boolean to enable hot-reloading from ./tools/

## Requirements

- Python 3.10+
- AWS credentials configured (for default Bedrock model)
- Model access enabled for Claude 4 Sonnet in us-west-2 region