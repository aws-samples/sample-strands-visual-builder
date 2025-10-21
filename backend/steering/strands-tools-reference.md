---
inclusion: always
---

# Strands Tools Reference

## Installation

```bash
# Basic installation
pip install strands-agents-tools

# With optional dependencies
pip install strands-agents-tools[mem0_memory, use_browser, rss, use_computer]
```

## Core Tool Categories

### File Operations
- `file_read` - Read files: `agent.tool.file_read(path="path/to/file.txt")`
- `file_write` - Write files: `agent.tool.file_write(path="path/to/file.txt", content="content")`
- `editor` - Advanced file editing: `agent.tool.editor(command="view", path="path/to/file.py")`

### System Integration
- `shell` - Execute commands: `agent.tool.shell(command="ls -la")`
- `python_repl` - Run Python: `agent.tool.python_repl(code="import pandas as pd")`
- `environment` - Manage env vars: `agent.tool.environment(action="list", prefix="AWS_")`

### Web & HTTP
- `http_request` - API calls: `agent.tool.http_request(method="GET", url="https://api.example.com")`
- `tavily_search` - Web search: `agent.tool.tavily_search(query="AI research", search_depth="advanced")`
- `exa_search` - Neural search: `agent.tool.exa_search(query="Best tools", text=True)`

### AWS Services
- `use_aws` - AWS operations: `agent.tool.use_aws(service_name="s3", operation_name="list_buckets")`
- `retrieve` - Bedrock KB: `agent.tool.retrieve(text="What is STRANDS?")`
- `memory` - Bedrock memory: `agent.tool.memory(action="retrieve", query="features")`

### Media Generation
- `generate_image` - Create images: `agent.tool.generate_image(prompt="A sunset")`
- `nova_reels` - Create videos: `agent.tool.nova_reels(action="create", text="Mountains")`
- `image_reader` - Process images: `agent.tool.image_reader(image_path="image.jpg")`

### Utilities
- `calculator` - Math operations: `agent.tool.calculator(expression="2 * sin(pi/4)")`
- `current_time` - Get time: `agent.tool.current_time()`
- `journal` - Logging: `agent.tool.journal(action="write", content="Notes")`

## Common Import Patterns

```python
# Individual tools
from strands_tools import calculator, shell, python_repl, file_read, file_write

# Multiple tools
from strands_tools import (
    calculator,
    shell, 
    python_repl,
    file_read,
    file_write,
    http_request,
    use_aws
)

# Agent with tools
from strands import Agent
from strands_tools import calculator, shell

agent = Agent(tools=[calculator, shell])
```

## Tool Usage Patterns

### Basic Tool Usage
```python
from strands import Agent
from strands_tools import calculator, file_read

agent = Agent(tools=[calculator, file_read])
response = agent("Calculate 2+2 and save result to file")
```

### Advanced Tool Configuration
```python
from strands import Agent
from strands_tools import use_aws, memory

# Tools with environment configuration
agent = Agent(tools=[use_aws, memory])
response = agent("List my S3 buckets and remember them")
```

## Security Notes

- `shell` and `python_repl` require user confirmation for security
- `use_aws` requires proper AWS credentials
- Web tools may require API keys (Tavily, Exa)
- Memory tools require Bedrock access

## Platform Compatibility

- Most tools work on Linux/macOS/Windows
- `shell` tool behavior varies by platform
- Some tools require specific system dependencies