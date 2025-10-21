# AgentCore Deployment Patterns & Implementation

## Deployment Approaches

### Option A: SDK Integration (Recommended)
Use the `bedrock-agentcore` SDK for seamless integration:

```python
from bedrock_agentcore import BedrockAgentCoreApp
from strands import Agent

app = BedrockAgentCoreApp()
agent = Agent()

@app.entrypoint
def invoke(payload):
    """Your AI agent function"""
    user_message = payload.get("prompt", "Hello! How can I help you today?")
    result = agent(user_message)
    return {"result": result.message}

if __name__ == "__main__":
    app.run()
```

### Option B: Starter Toolkit (Rapid Prototyping)
Use the command-line toolkit for quick deployment:

```bash
# Install toolkit
pip install bedrock-agentcore-starter-toolkit

# Configure agent
agentcore configure -e my_agent.py

# Deploy to AgentCore Runtime
agentcore launch

# Test deployed agent
agentcore invoke '{"prompt": "tell me a joke"}'
```

### Option C: Custom Implementation
Direct API usage for advanced control:

```python
# Custom deployment using AWS APIs
import boto3

client = boto3.client('bedrock-agentcore-control')
response = client.create_agent_runtime(
    agentRuntimeName='my-agent',
    containerImage='my-ecr-repo/my-agent:latest',
    executionRoleArn='arn:aws:iam::account:role/AgentExecutionRole'
)
```

## Deployment Modes

### 1. CodeBuild + Cloud Runtime (Production)
- **Best for**: Production environments, managed teams
- **Benefits**: No Docker required, fully managed build
- **Command**: `agentcore launch`

### 2. Local Development
- **Best for**: Development, rapid iteration, debugging
- **Requirements**: Docker/Finch/Podman
- **Command**: `agentcore launch --local`

### 3. Hybrid: Local Build + Cloud Runtime
- **Best for**: Teams with Docker expertise, custom builds
- **Requirements**: Docker/Finch/Podman
- **Command**: `agentcore launch --local-build`

## Configuration Files

### .bedrock_agentcore.yaml
```yaml
agents:
  my_agent:
    name: My Agent
    description: Agent description
    entrypoint: agent.py
    handler: main
    
    runtime:
      python_version: "3.11"
      timeout: 300
      memory: 512
    
    environment:
      LOG_LEVEL: INFO
      AWS_REGION: us-east-1
    
    requirements: requirements.txt
```

### requirements.txt
```
bedrock-agentcore
strands-agents
# Add your agent dependencies
```

## Agent Runtime Requirements

### Code Structure
- **Entrypoint**: Python file with agent logic
- **Handler**: Function that processes requests
- **Dependencies**: requirements.txt with all packages
- **Configuration**: .bedrock_agentcore.yaml for settings

### Payload Format
```python
# Input payload structure
{
    "prompt": "User message",
    "session_id": "optional-session-id",
    "media": {  # Optional multi-modal content
        "type": "image",
        "format": "jpeg", 
        "data": "base64-encoded-data"
    }
}

# Output format
{
    "result": "Agent response",
    "metadata": {  # Optional
        "session_id": "session-id",
        "tokens_used": 150
    }
}
```

## Invocation Patterns

### Basic Invocation
```python
import boto3
import json

client = boto3.client('bedrock-agentcore')
payload = json.dumps({"prompt": "Hello!"}).encode()

response = client.invoke_agent_runtime(
    agentRuntimeArn=agent_arn,
    payload=payload
)
```

### Streaming Invocation
```python
response = client.invoke_agent_runtime(
    agentRuntimeArn=agent_arn,
    runtimeSessionId=session_id,
    payload=payload
)

# Process streaming response
if "text/event-stream" in response.get("contentType", ""):
    content = []
    for line in response["response"].iter_lines(chunk_size=10):
        if line:
            line = line.decode("utf-8")
            if line.startswith("data: "):
                chunk = line[6:]
                print(chunk)  # Real-time processing
                content.append(chunk)
```

### Session Management
```python
import uuid

# Start new conversation
session_id = str(uuid.uuid4())

# Continue existing conversation
response = client.invoke_agent_runtime(
    agentRuntimeArn=agent_arn,
    runtimeSessionId=session_id,  # Maintains context
    payload=payload
)
```

## Best Practices

### Development
- Test locally before deployment
- Use environment variables for configuration
- Implement proper error handling
- Add logging for debugging

### Production
- Use session management for conversation context
- Implement retry logic with exponential backoff
- Monitor payload sizes (100MB limit)
- Use appropriate timeouts and memory settings

### Security
- Use IAM roles with minimal permissions
- Validate all inputs
- Sanitize outputs
- Enable observability for monitoring

## Error Handling

### Common Errors
- **ValidationException**: Invalid request parameters
- **ResourceNotFoundException**: Agent runtime not found
- **AccessDeniedException**: Insufficient permissions
- **ThrottlingException**: Rate limit exceeded

### Implementation
```python
import boto3
from botocore.exceptions import ClientError
import time
import random

def invoke_agent_with_retry(client, agent_arn, payload, max_retries=3):
    for attempt in range(max_retries):
        try:
            response = client.invoke_agent_runtime(
                agentRuntimeArn=agent_arn,
                payload=payload
            )
            return response
        except ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == 'ThrottlingException' and attempt < max_retries - 1:
                # Exponential backoff
                wait_time = (2 ** attempt) + random.uniform(0, 1)
                time.sleep(wait_time)
                continue
            raise e
```

## Integration with Visual Builder

### Deployment Service Architecture
```python
class AgentCoreDeploymentService:
    def __init__(self):
        self.client = boto3.client('bedrock-agentcore-control')
        self.runtime_client = boto3.client('bedrock-agentcore')
    
    def deploy_agent(self, agent_code: str, config: dict) -> str:
        # 1. Package agent code
        # 2. Create container image
        # 3. Deploy to AgentCore Runtime
        # 4. Return runtime ARN
        pass
    
    def invoke_agent(self, arn: str, message: str, session_id: str = None):
        # Handle streaming invocation
        pass
    
    def get_deployment_status(self, arn: str):
        # Check deployment health
        pass
```

This deployment pattern enables seamless integration between the visual builder and AgentCore Runtime.