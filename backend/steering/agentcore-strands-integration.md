# AgentCore + Strands Agents Integration Guide

## CRITICAL: AgentCore Production Main Block Requirements

### Production vs Development Code

**PRODUCTION AgentCore Code (REQUIRED):**
```python
if __name__ == "__main__":
    app.run()  # ONLY this line - no test code
```

**NEVER in Production AgentCore Code:**
```python
if __name__ == "__main__":
    # Test the agent locally  ← NEVER DO THIS
    try:
        test_payload = {"prompt": "test"}
        response = invoke(test_payload)
        print(response)
    except Exception as e:
        print(f"Test failed: {e}")
    
    app.run()  # This interferes with AgentCore runtime
```

### Why This Matters

- **AgentCore Runtime**: Expects clean entrypoint without interference
- **Test Code**: Executes before AgentCore can handle requests properly
- **CLI Invocation Failures**: Caused by test code running instead of proper request handling
- **Production Deployment**: Must have clean main block for proper operation

### Testing Approach for AgentCore Code

**Correct**: Test the invoke function separately
```python
def test_agent_functionality():
    """Test function - called separately, not in main block"""
    test_payload = {"prompt": "Hello"}
    result = invoke(test_payload)
    print(f"Test result: {result}")

@app.entrypoint
def invoke(payload):
    # Your agent logic
    return {"result": "response"}

if __name__ == "__main__":
    app.run()  # Production main block - ONLY this
```

**Wrong**: Test code in main block
```python
if __name__ == "__main__":
    # This breaks AgentCore runtime
    test_payload = {"prompt": "Hello"}
    response = invoke(test_payload)
    app.run()
```

## Strands-Specific AgentCore Integration

### Basic Strands Agent for AgentCore

```python
from bedrock_agentcore import BedrockAgentCoreApp
from strands import Agent, tool
from strands.models import BedrockModel

# Initialize AgentCore app
app = BedrockAgentCoreApp()

# Configure Strands agent
model = BedrockModel(
    model_id="anthropic.claude-sonnet-4-20250514-v1:0",
    region_name="us-west-2"
)

agent = Agent(
    model=model,
    system_prompt="You are a helpful assistant.",
    tools=[custom_tool1, custom_tool2]
)

@app.entrypoint
def invoke(payload):
    """AgentCore entrypoint for Strands agent"""
    user_message = payload.get("prompt", "")
    session_id = payload.get("session_id")
    
    # Handle session context if needed
    if session_id:
        # Implement session management
        pass
    
    # Process with Strands agent
    result = agent(user_message)
    
    return {
        "result": str(result),
        "session_id": session_id
    }

if __name__ == "__main__":
    app.run()
```

### Multi-Modal Strands Agent

```python
from strands.types.content import ContentBlock
import base64
import json

@app.entrypoint
def invoke(payload):
    """Handle multi-modal inputs"""
    prompt = payload.get("prompt", "")
    media = payload.get("media")
    
    content_blocks = [ContentBlock(text=prompt)]
    
    # Handle image input
    if media and media.get("type") == "image":
        image_data = base64.b64decode(media["data"])
        content_blocks.append(
            ContentBlock(
                image={
                    "format": media["format"],
                    "source": {"bytes": image_data}
                }
            )
        )
    
    # Process with Strands agent
    result = agent(content_blocks)
    return {"result": str(result)}
```

### Strands Tools Integration

```python
from strands import tool
from strands_tools import calculator, file_read, http_request

@tool
def custom_business_logic(query: str) -> str:
    """Custom tool for business-specific operations"""
    # Your custom logic here
    return f"Processed: {query}"

# Agent with multiple tools
agent = Agent(
    model=model,
    tools=[
        calculator,           # Built-in math operations
        file_read,           # File operations
        http_request,        # API calls
        custom_business_logic # Custom business logic
    ]
)
```

### Strands Multi-Agent Patterns in AgentCore

#### Agents as Tools Pattern
```python
from strands import Agent, tool

@tool
def research_specialist(query: str) -> str:
    """Specialized research agent"""
    research_agent = Agent(
        system_prompt="You are a research specialist.",
        tools=[http_request, file_read]
    )
    return str(research_agent(query))

@tool
def analysis_specialist(data: str) -> str:
    """Specialized analysis agent"""
    analysis_agent = Agent(
        system_prompt="You are a data analysis specialist.",
        tools=[calculator, custom_analysis_tool]
    )
    return str(analysis_agent(data))

# Main orchestrator agent
orchestrator = Agent(
    system_prompt="Route tasks to appropriate specialists.",
    tools=[research_specialist, analysis_specialist]
)

@app.entrypoint
def invoke(payload):
    result = orchestrator(payload.get("prompt"))
    return {"result": str(result)}
```

#### Swarm Pattern in AgentCore
```python
from strands.multiagent import Swarm

# Create specialized agents
researcher = Agent(name="researcher", system_prompt="Research specialist...")
analyst = Agent(name="analyst", system_prompt="Analysis specialist...")
writer = Agent(name="writer", system_prompt="Writing specialist...")

# Create swarm
swarm = Swarm([researcher, analyst, writer], max_handoffs=10)

@app.entrypoint
def invoke(payload):
    result = swarm(payload.get("prompt"))
    return {"result": str(result)}
```

## AgentCore Memory Integration with Strands

### Using AgentCore Memory Service
```python
# Note: AgentCore Memory integration patterns may vary
# Refer to official AgentCore documentation for current Memory API

class StrandsAgentWithMemory:
    def __init__(self):
        self.agent = Agent(model=model)
        # Memory integration depends on AgentCore Memory service configuration
    
    def process_with_memory(self, message: str, session_id: str):
        # Basic session-aware processing
        # Actual memory integration depends on AgentCore Memory service setup
        result = self.agent(message)
        return result
```

## AgentCore Gateway + Strands Tools

### Converting APIs to MCP Tools via Gateway
```python
# Note: AgentCore Gateway integration patterns may vary
# Refer to official AgentCore documentation for current Gateway API

# Basic approach for integrating external APIs as tools
from strands import tool
import requests

@tool
def external_api_tool(query: str) -> str:
    """Custom tool that calls external API"""
    # Your API integration logic here
    response = requests.get(f"https://api.example.com/search?q={query}")
    return response.json()

# Use custom tools in Strands agent
agent = Agent(tools=[external_api_tool])
```

## Observability Integration

### Enhanced Strands Agent with Observability
```python
from bedrock_agentcore.observability import trace, span
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ObservableStrandsAgent:
    def __init__(self):
        self.agent = Agent(model=model)
    
    @trace("agent_invocation")
    def process(self, message: str, session_id: str = None):
        with span("message_processing") as span:
            span.set_attribute("message_length", len(message))
            span.set_attribute("session_id", session_id or "none")
            
            try:
                result = self.agent(message)
                span.set_attribute("response_length", len(str(result)))
                span.set_status("success")
                return result
            except Exception as e:
                span.set_status("error", str(e))
                logger.error(f"Agent processing failed: {e}")
                raise

@app.entrypoint
def invoke(payload):
    observable_agent = ObservableStrandsAgent()
    result = observable_agent.process(
        payload.get("prompt"),
        payload.get("session_id")
    )
    return {"result": str(result)}
```

## Deployment Configuration for Strands

### requirements.txt for Strands + AgentCore
```
bedrock-agentcore>=0.1.0
strands-agents>=1.0.0
strands-agents-tools>=0.1.0
boto3>=1.34.0
# Add your specific dependencies
```

### .bedrock_agentcore.yaml for Strands
```yaml
agents:
  strands_agent:
    name: Strands Agent
    description: Strands-powered agent with custom tools
    entrypoint: agent.py
    handler: invoke
    
    runtime:
      python_version: "3.11"
      timeout: 600  # 10 minutes for complex operations
      memory: 1024  # 1GB for tool-heavy agents
    
    environment:
      LOG_LEVEL: INFO
      AWS_REGION: us-west-2
      STRANDS_MODEL_PROVIDER: bedrock
      BEDROCK_MODEL_ID: anthropic.claude-sonnet-4-20250514-v1:0
    
    requirements: requirements.txt
    
    custom:
      framework: strands
      tools: ['calculator', 'file_read', 'http_request', 'custom_tools']
      multi_agent: true
```

## Best Practices for Strands + AgentCore

### 1. Tool Management
- Use `strands_tools` package for common operations
- Create custom tools for business logic
- Leverage AgentCore Gateway for API integrations
- Test tools locally before deployment

### 2. Model Configuration
- Use BedrockModel for AWS integration
- Configure appropriate timeouts and retries
- Handle model-specific limitations
- Monitor token usage and costs

### 3. Session Management
- Implement proper session handling
- Use AgentCore Memory for persistence
- Handle session cleanup
- Support concurrent sessions

### 4. Error Handling
- Wrap Strands operations in try-catch
- Implement graceful degradation
- Log errors for debugging
- Return meaningful error messages

### 5. Performance Optimization
- Cache frequently used data
- Optimize tool selection
- Use streaming for long responses
- Monitor memory usage

This integration pattern enables full Strands functionality within AgentCore's enterprise platform.