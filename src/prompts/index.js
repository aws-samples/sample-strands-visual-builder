/**
 * Prompt System - Loads and manages system prompts and steering files
 * This module provides utilities for loading prompts and steering files
 * that will be used by the expert agent for code generation
 */

// System prompt content (embedded as string for bundling)
const SYSTEM_PROMPT = `# STRANDS VISUAL BUILDER EXPERT

You are an expert at generating complete, production-ready Strands agent code from visual configurations. You specialize in creating self-extending AI agents that can autonomously expand their capabilities.

## Core Philosophy: Self-Extending AI Development Framework

Strands is fundamentally designed for **autonomous capability expansion**. Unlike traditional frameworks, Strands agents can:
- **Write their own tools** that are instantly available for use
- **Modify their capabilities** in real-time without restarts
- **Progressively enhance their functionality** through self-improvement

### The Self-Extending Loop
1. **Ideation**: Agent identifies need for new capability
2. **Implementation**: Agent writes code to \`tools/new_tool.py\`
3. **Instantaneous Loading**: Tool becomes available immediately
4. **Immediate Use**: Agent calls \`agent.tool.new_tool()\` with no restart
5. **Enhancement**: Agent iteratively improves its own tools

## Architecture Fundamentals

### Dynamic Tool Discovery & Hot-Reloading
Strands automatically watches and loads tools from your environment:
\`\`\`python
from strands import Agent
from strands_tools import load_tool, shell, editor

# Tools directory automatically watched
agent = Agent(
    system_prompt="You create your own tools.", 
    tools=[load_tool, shell, editor],
    load_tools_from_directory=True  # Auto load from tools/
)

# Any saved .py file in tools/ is instantly available
# No restart or manual registration required
\`\`\`

### Direct Tool Access Pattern
Tools are available as direct methods on the agent:
\`\`\`python
# Direct method-style access to tools
result = agent.tool.shell("ls -la")

# Chain multiple tools together
weather_data = agent.tool.http_request(method="GET", url=f"{api_base_url}/weather")
agent.tool.python_repl(code=f"process_weather({weather_data})")

# No need for complex function call formatting
\`\`\`

## Your Task

Generate complete, production-ready Strands agent code based on the user's visual configuration. The code should:

1. **Follow Strands best practices** and self-extending philosophy
2. **Use appropriate tools** for the specified functionality
3. **Include proper error handling** and response formats
4. **Be immediately runnable** using the user's configured values
5. **Include helpful comments** explaining key concepts
6. **Implement the self-extending paradigm** where appropriate
7. **Use the most suitable model provider** based on configuration
8. **Include streaming support** if requested
9. **Follow security best practices** for production deployment

Focus on creating agents that can autonomously extend their capabilities and progressively enhance their functionality through self-improvement. Remember that Strands agents are designed to be self-modifying systems that grow more capable over time.

The generated code should be complete, well-documented, and ready to run immediately. Include installation requirements, environment setup, and usage examples as needed.`;

// Steering files content (embedded as strings for bundling)
const STEERING_FILES = {
  'strands-tools-reference.md': `# Strands Tools Reference

## Installation

\`\`\`bash
# Basic installation
pip install strands-agents-tools

# With optional dependencies
pip install strands-agents-tools[mem0_memory, use_browser, rss, use_computer]
\`\`\`

## Core Tool Categories

### File Operations
- \`file_read\` - Read files: \`agent.tool.file_read(path="path/to/file.txt")\`
- \`file_write\` - Write files: \`agent.tool.file_write(path="path/to/file.txt", content="content")\`
- \`editor\` - Advanced file editing: \`agent.tool.editor(command="view", path="path/to/file.py")\`

### System Integration
- \`shell\` - Execute commands: \`agent.tool.shell(command="ls -la")\`
- \`python_repl\` - Run Python: \`agent.tool.python_repl(code="import pandas as pd")\`
- \`environment\` - Manage env vars: \`agent.tool.environment(action="list", prefix="AWS_")\`

### Web & HTTP
- \`http_request\` - API calls: \`agent.tool.http_request(method="GET", url="https://api.example.com")\`
- \`tavily_search\` - Web search: \`agent.tool.tavily_search(query="AI research", search_depth="advanced")\`
- \`exa_search\` - Neural search: \`agent.tool.exa_search(query="Best tools", text=True)\`

### AWS Services
- \`use_aws\` - AWS operations: \`agent.tool.use_aws(service_name="s3", operation_name="list_buckets")\`
- \`retrieve\` - Bedrock KB: \`agent.tool.retrieve(text="What is STRANDS?")\`
- \`memory\` - Bedrock memory: \`agent.tool.memory(action="retrieve", query="features")\`

### Media Generation
- \`generate_image\` - Create images: \`agent.tool.generate_image(prompt="A sunset")\`
- \`nova_reels\` - Create videos: \`agent.tool.nova_reels(action="create", text="Mountains")\`
- \`image_reader\` - Process images: \`agent.tool.image_reader(image_path="image.jpg")\`

### Utilities
- \`calculator\` - Math operations: \`agent.tool.calculator(expression="2 * sin(pi/4)")\`
- \`current_time\` - Get time: \`agent.tool.current_time()\`
- \`journal\` - Logging: \`agent.tool.journal(action="write", content="Notes")\`

## Common Import Patterns

\`\`\`python
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
\`\`\`

## Tool Usage Patterns

### Basic Tool Usage
\`\`\`python
from strands import Agent
from strands_tools import calculator, file_read

agent = Agent(tools=[calculator, file_read])
response = agent("Calculate 2+2 and save result to file")
\`\`\`

### Advanced Tool Configuration
\`\`\`python
from strands import Agent
from strands_tools import use_aws, memory

# Tools with environment configuration
agent = Agent(tools=[use_aws, memory])
response = agent("List my S3 buckets and remember them")
\`\`\`

## Security Notes

- \`shell\` and \`python_repl\` require user confirmation for security
- \`use_aws\` requires proper AWS credentials
- Web tools may require API keys (Tavily, Exa)
- Memory tools require Bedrock access

## Platform Compatibility

- Most tools work on Linux/macOS/Windows
- \`shell\` tool behavior varies by platform
- Some tools require specific system dependencies`,

  'strands-sdk-core.md': `# Strands SDK Core Patterns

## Basic Agent Creation

\`\`\`python
from strands import Agent
from strands_tools import calculator

# Simple agent with tools
agent = Agent(tools=[calculator])
response = agent("What is the square root of 1764")
\`\`\`

## Custom Tool Creation

\`\`\`python
from strands import Agent, tool

@tool
def word_count(text: str) -> int:
    """Count words in text.

    This docstring is used by the LLM to understand the tool's purpose.
    """
    return len(text.split())

agent = Agent(tools=[word_count])
response = agent("How many words are in this sentence?")
\`\`\`

## Model Configuration

\`\`\`python
from strands import Agent
from strands.models import BedrockModel

# Bedrock model configuration
bedrock_model = BedrockModel(
    model_id="us.amazon.nova-pro-v1:0",
    temperature=0.3,
    streaming=True,
)
agent = Agent(model=bedrock_model)
\`\`\`

## Hot Reloading Tools

\`\`\`python
from strands import Agent

# Agent will watch ./tools/ directory for changes
agent = Agent(load_tools_from_directory=True)
response = agent("Use any tools you find in the tools directory")
\`\`\`

## MCP Integration

\`\`\`python
from strands import Agent
from strands.tools.mcp import MCPClient
from mcp import stdio_client, StdioServerParameters

aws_docs_client = MCPClient(
    lambda: stdio_client(StdioServerParameters(command="uvx", args=["awslabs.aws-documentation-mcp-server@latest"]))
)

with aws_docs_client:
   agent = Agent(tools=aws_docs_client.list_tools_sync())
   response = agent("Tell me about Amazon Bedrock")
\`\`\`

## Installation Requirements

\`\`\`bash
# Basic installation
pip install strands-agents strands-agents-tools

# Virtual environment setup
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\\Scripts\\activate
pip install strands-agents strands-agents-tools
\`\`\`

## Key Imports

\`\`\`python
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
\`\`\`

## Agent Constructor Parameters

- \`model\`: Model provider instance (defaults to Bedrock Claude 4 Sonnet)
- \`tools\`: List of tool functions or tool instances
- \`system_prompt\`: System prompt string
- \`callback_handler\`: Function for handling streaming events
- \`load_tools_from_directory\`: Boolean to enable hot-reloading from ./tools/

## Requirements

- Python 3.10+
- AWS credentials configured (for default Bedrock model)
- Model access enabled for Claude 4 Sonnet in us-west-2 region`,

  'strands-samples-patterns.md': `# Strands Samples and Patterns

## Basic Agent Example

\`\`\`python
from strands import Agent, tool
from strands_tools import calculator, current_time, python_repl

@tool
def letter_counter(word: str, letter: str) -> int:
    """
    Count the occurrences of a specific letter in a word.
    """
    if not isinstance(word, str) or not isinstance(letter, str):
        return 0
    if len(letter) != 1:
        raise ValueError("The 'letter' parameter must be a single character")
    return word.lower().count(letter.lower())

agent = Agent(tools=[calculator, current_time, python_repl, letter_counter])

message = """
I have 4 requests:

1. What is the time right now?
2. Calculate 3111696 / 74088
3. Tell me how many letter R's are in the word "strawberry" 🍓
4. Output a script that does what we just spoke about!
   Use your python tools to confirm that the script works before outputting it
"""

agent(message)
\`\`\`

## Installation Pattern

\`\`\`bash
# Required packages
pip install strands-agents
pip install strands-agents-tools
\`\`\`

## Custom Tool Pattern

\`\`\`python
from strands import Agent, tool

@tool
def custom_function(param: str) -> str:
    """
    Tool description for the LLM.
    
    Args:
        param: Description of parameter
        
    Returns:
        Description of return value
    """
    # Implementation
    return result

# Use in agent
agent = Agent(tools=[custom_function])
\`\`\`

## Multi-Tool Agent Pattern

\`\`\`python
from strands import Agent
from strands_tools import calculator, current_time, python_repl, file_read, shell

# Combine multiple tools
agent = Agent(tools=[
    calculator,      # Math operations
    current_time,    # Time queries
    python_repl,     # Code execution
    file_read,       # File operations
    shell           # System commands
])

# Agent can use any combination of tools
response = agent("Calculate 2+2, get current time, and list files")
\`\`\`

## Error Handling Pattern

\`\`\`python
from strands import Agent, tool

@tool
def safe_operation(input_data: str) -> str:
    """Safe operation with error handling."""
    try:
        # Validate input
        if not isinstance(input_data, str):
            raise ValueError("Input must be a string")
        
        # Process
        result = process_data(input_data)
        return result
        
    except Exception as e:
        return f"Error: {str(e)}"

agent = Agent(tools=[safe_operation])
\`\`\`

## Type Hints Pattern

\`\`\`python
from strands import Agent, tool
from typing import List, Dict, Optional

@tool
def typed_function(
    text: str, 
    count: int, 
    options: Optional[List[str]] = None
) -> Dict[str, any]:
    """
    Function with proper type hints.
    
    Args:
        text: Input text to process
        count: Number of operations
        options: Optional list of configuration options
        
    Returns:
        Dictionary with results
    """
    return {
        "processed_text": text.upper(),
        "operation_count": count,
        "options_used": options or []
    }
\`\`\`

## Best Practices

1. **Always include docstrings** - LLM uses them to understand tool purpose
2. **Use type hints** - Helps with validation and clarity
3. **Handle errors gracefully** - Return meaningful error messages
4. **Validate inputs** - Check parameter types and values
5. **Keep tools focused** - One tool should do one thing well
6. **Use descriptive names** - Tool and parameter names should be clear`
};

/**
 * Load system prompt content
 */
export function loadSystemPrompt() {
  return SYSTEM_PROMPT;
}

/**
 * Load steering file content by name
 */
export function loadSteeringFile(filename) {
  return STEERING_FILES[filename] || null;
}

/**
 * Get all available steering files
 */
export function getAvailableSteeringFiles() {
  return Object.keys(STEERING_FILES);
}

/**
 * Process steering file references in prompt text
 * Replaces #[[file:path]] syntax with actual file content
 */
export function processSteeringReferences(promptText) {
  const fileReferenceRegex = /#\[\[file:([^\]]+)\]\]/g;
  
  return promptText.replace(fileReferenceRegex, (match, filePath) => {
    // Extract filename from path
    const filename = filePath.split('/').pop();
    const content = loadSteeringFile(filename);
    
    if (content) {
      return `\n\n## ${filename}\n\n${content}\n\n`;
    } else {
      return `\n\n## ${filename} (File not found)\n\n`;
    }
  });
}

/**
 * Build complete prompt with system prompt and steering files
 */
export function buildCompletePrompt(userPrompt, includeAllSteering = true) {
  let fullPrompt = loadSystemPrompt();
  
  if (includeAllSteering) {
    // Add all steering files
    Object.entries(STEERING_FILES).forEach(([filename, content]) => {
      fullPrompt += `\n\n## ${filename}\n\n${content}\n\n`;
    });
  }
  
  // Process any steering file references in the system prompt
  fullPrompt = processSteeringReferences(fullPrompt);
  
  // Add user prompt
  fullPrompt += `\n\n## USER REQUEST\n\n${userPrompt}`;
  
  return fullPrompt;
}

export default {
  loadSystemPrompt,
  loadSteeringFile,
  getAvailableSteeringFiles,
  processSteeringReferences,
  buildCompletePrompt
};