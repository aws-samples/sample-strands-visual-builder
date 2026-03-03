# AgentCore Runtime MCP Deployment Patterns

## Overview

This steering file provides patterns for deploying Strands multi-agent systems as MCP (Model Context Protocol) servers on Amazon Bedrock AgentCore Runtime.

## Required Patterns

### 1. FastMCP Server Initialization:
```python
from mcp.server.fastmcp import FastMCP

# CRITICAL: Use these exact parameters for AgentCore compatibility
mcp = FastMCP(host="0.0.0.0", stateless_http=True)
```

### 2. Strands Tool Creation:
```python
from strands import Agent, tool

@tool  # ← Use @tool decorator from strands (NOT @strands_tool)
def calculator_agent(query: str) -> str:
    """Specialized calculator agent"""
    agent = Agent(tools=[calculator])
    return str(agent(query))
```

### 3. MCP Entry Point:
```python
@mcp.tool()  # ← Only the main entry point needs @mcp.tool
def process_query(query: str) -> str:
    """Main agent that orchestrates internal @tool functions"""
    result = orchestrator_agent(query)  # Can use @tool functions internally
    return str(result)

# CRITICAL: MUST use transport="streamable-http" for AgentCore Runtime
if __name__ == "__main__":
    mcp.run(transport="streamable-http")  # ← REQUIRED for AgentCore
```

## MCP Server Architecture

### CRITICAL Requirements for AgentCore Runtime
1. **MANDATORY**: Use `FastMCP` with `stateless_http=True`
2. **MANDATORY**: Call `mcp.run(transport="streamable-http")` in main block
3. **MANDATORY**: Host on `0.0.0.0:8000/mcp` (default MCP endpoint)
4. Wrap multi-agent systems as `@mcp.tool()` functions
- Support session isolation via `Mcp-Session-Id` header
- Handle stateless operation for scalability

### Deployment Protocol
- Use `--protocol MCP` flag during AgentCore deployment
- Different port/endpoint than standard agents (8000/mcp vs 8080/invocations)
- Requires `mcp` package in requirements.txt instead of `bedrock-agentcore`

## Multi-Agent System as Single MCP Tool Pattern

### When to Use
- Deploy entire multi-agent workflow as one callable tool
- Encapsulate complex agent coordination logic
- Provide simple interface for external systems
- Maintain internal agent state and coordination

### Implementation Pattern

**CRITICAL: Use Lazy Initialization for AgentCore Runtime**

When deploying MCP servers to AgentCore Runtime, use lazy initialization to avoid agent creation failures at module load time.

```python
from mcp.server.fastmcp import FastMCP
from strands.multiagent import Swarm
from strands import Agent, tool

# CRITICAL: Initialize MCP server with AgentCore-compatible settings
mcp = FastMCP(host="0.0.0.0", stateless_http=True)

# Lazy initialization - agents created on first tool call
_swarm = None

def get_swarm():
    """Create swarm on first call, reuse after."""
    global _swarm
    if _swarm is None:
        researcher = Agent(name="researcher", system_prompt="You are a research specialist...")
        analyst = Agent(name="analyst", system_prompt="You are a data analysis specialist...")
        writer = Agent(name="writer", system_prompt="You are a writing specialist...")
        _swarm = Swarm([researcher, analyst, writer], max_handoffs=10)
    return _swarm

@mcp.tool()
def execute_multi_agent_workflow(task: str, workflow_type: str = "collaborative") -> str:
    """
    Execute a complete multi-agent workflow.
    
    Args:
        task: The task or question to process
        workflow_type: Type of workflow - 'collaborative' for swarm
    
    Returns:
        Complete processed result from the multi-agent system
    """
    try:
        swarm = get_swarm()  # Created on first call, reused after
        result = swarm(task)
        return str(result)
    except Exception as e:
        return f"Error processing task: {str(e)}"

# CRITICAL: MUST use transport="streamable-http" for AgentCore Runtime
if __name__ == "__main__":
    mcp.run(transport="streamable-http")
```

**Why Lazy Initialization?**
- Agent creation may connect to external services (Bedrock, MCP servers, etc.)
- At module load time, AgentCore container network may not be ready
- Lazy init defers agent creation until first tool call when network is ready
- Agents are cached after first creation for performance

**❌ WRONG - Module-level agent creation:**
```python
# DON'T DO THIS - agents created at import time
researcher = Agent(name="researcher", system_prompt="...")  # ← May fail
analyst = Agent(name="analyst", system_prompt="...")
swarm = Swarm([researcher, analyst, writer])  # ← Network not ready

@mcp.tool()
def execute_workflow(task: str) -> str:
    result = swarm(task)  # ← Swarm may not exist
    return str(result)
```

### Error Handling Patterns

```python
@mcp.tool()
def robust_multi_agent_tool(task: str) -> str:
    """Multi-agent tool with comprehensive error handling"""
    try:
        # Input validation
        if not task or not isinstance(task, str):
            return "Error: Task must be a non-empty string"
        
        if len(task) > 10000:
            return "Error: Task too long (max 10,000 characters)"
        
        # Execute multi-agent system
        result = swarm(task)
        
        # Output validation
        if not result:
            return "Warning: Multi-agent system returned empty result"
        
        return str(result)
        
    except Exception as e:
        # Log error for debugging (in production, use proper logging)
        error_msg = f"Multi-agent execution failed: {str(e)}"
        return error_msg
```

## Requirements.txt for MCP Deployment

### Core MCP Dependencies
```
# MCP Server Framework
mcp>=1.0.0

# Strands Multi-Agent Framework  
strands-agents>=1.0.0
strands-agents-tools>=0.1.0

# AWS SDK (if using AWS services)
boto3>=1.34.0

# Additional dependencies based on your tools
# Add other packages as needed for your specific tools
```

### Key Differences from Agent Deployment
- Use `mcp` instead of `bedrock-agentcore`
- Same Strands packages for multi-agent logic
- Add tool-specific dependencies as needed

## Testing MCP Servers

### Local Testing Pattern
```python
# test_mcp_client.py
import asyncio
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

async def test_mcp_server():
    mcp_url = "http://localhost:8000/mcp"
    headers = {}

    async with streamablehttp_client(mcp_url, headers, timeout=120, terminate_on_close=False) as (
        read_stream, write_stream, _
    ):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            
            # List available tools
            tools = await session.list_tools()
            print("Available tools:", [tool.name for tool in tools.tools])
            
            # Test tool invocation
            result = await session.call_tool(
                "execute_multi_agent_workflow",
                {"task": "Research and analyze the benefits of renewable energy"}
            )
            print("Result:", result.content)

if __name__ == "__main__":
    asyncio.run(test_mcp_server())
```

## Deployment Configuration

### Agent Deployment (IAM Authentication)
When deploying as an **Agent**, use IAM authentication (current behavior):

```python
configure_params = {
    "entrypoint": "agent.py",
    "agent_name": "my-agent",
    "requirements_file": "requirements.txt",
    "auto_create_execution_role": True,
    "region": "us-west-2"
}
```

### MCP Server Deployment (OAuth Authentication - REQUIRED)

**CRITICAL**: MCP servers MUST be deployed with OAuth authentication for MCP client compatibility.

```python
configure_params = {
    "entrypoint": "mcp_server.py",
    "agent_name": "my-mcp-server",
    "requirements_file": "requirements.txt",
    "auto_create_execution_role": True,
    "region": "us-west-2",
    "protocol": "MCP",  # This tells AgentCore it's an MCP server
    
    # OAuth configuration - REQUIRED for MCP servers
    "authorizer_config": {
        "customJWTAuthorizer": {
            "discoveryUrl": f"https://cognito-idp.{region}.amazonaws.com/{COGNITO_POOL_ID}/.well-known/openid-configuration",
            "allowedClients": [COGNITO_CLIENT_ID]
        }
    }
}
```

**OAuth Configuration Requirements**:
- `discoveryUrl`: Must match pattern `^.+/\.well-known/openid-configuration$`
- `allowedClients`: List of permitted client IDs validated against the `client_id` claim in JWT token
- `allowedAudiences`: (Optional) List of permitted audiences validated against the `aud` claim in JWT token

**Environment Variables Needed**:
```bash
COGNITO_USER_POOL_ID=<your-cognito-pool-id>
COGNITO_CLIENT_ID_MCP=<your-cognito-client-id>
AWS_REGION=us-west-2
```

### CLI Deployment Examples

**Agent Deployment (IAM)**:
```bash
agentcore configure -e agent.py
agentcore launch
```

**MCP Server Deployment (OAuth)**:
```bash
agentcore configure -e mcp_server.py --protocol MCP \
  --authorizer-config '{"customJWTAuthorizer":{"discoveryUrl":"https://cognito-idp.us-west-2.amazonaws.com/POOL_ID/.well-known/openid-configuration","allowedClients":["CLIENT_ID"]}}'
agentcore launch
```

### Key Configuration Differences
- Entry point: `mcp_server.py` (not `agentcore_deployment.py`)
- Protocol: `MCP` (not default HTTP)
- Port: 8000 (not 8080)
- Endpoint: `/mcp` (not `/invocations`)
- Authentication: OAuth JWT Bearer Token (not IAM SigV4)

## Security Considerations

### Input Validation
- Always validate tool inputs for type and length
- Sanitize user inputs to prevent injection attacks
- Implement rate limiting for tool calls

### Error Handling
- Never expose internal system details in error messages
- Log errors securely for debugging
- Return user-friendly error messages

### Authentication
- **Agents**: Use IAM SigV4 authentication (default)
- **MCP Servers**: MUST use JWT Bearer Token authentication (OAuth) for MCP client compatibility
- OAuth configuration is set at deployment time via `authorizer_config` parameter
- No changes needed in MCP server code itself - authentication is handled by AgentCore Runtime infrastructure

## Best Practices

### Tool Design
- Keep tool descriptions clear and specific
- Use type hints for all parameters
- Return structured, consistent responses
- Handle edge cases gracefully

### Performance
- Design for stateless operation
- Minimize tool execution time
- Use appropriate timeout values
- Cache expensive operations when possible

### Monitoring
- Implement health checks
- Track tool usage metrics
- Monitor error rates and performance
- Set up alerting for failures

This pattern enables deploying sophisticated multi-agent systems as consumable MCP tools while maintaining all the coordination and intelligence of the original Strands implementation.

## MCP Client Integration

### Post-Deployment Information for Users

After successfully deploying an MCP server with OAuth, provide users with these integration details for MCP clients:

```
✅ MCP Server Deployed Successfully!

MCP Client Integration Details:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MCP Server URL:
  https://bedrock-agentcore.{region}.amazonaws.com/runtimes/{agent_runtime_arn}/invocations

Authentication Type: OAuth 2.0

Authorization URL:
  https://{cognito-domain}.auth.{region}.amazoncognito.com/oauth2/authorize

Token URL:
  https://{cognito-domain}.auth.{region}.amazoncognito.com/oauth2/token

Client ID:
  {cognito_client_id}

Required Scopes:
  openid, profile

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

To connect in your MCP client:
1. Add new MCP server connection
2. Enter the MCP Server URL above
3. Select OAuth 2.0 authentication
4. Enter the Authorization URL, Token URL, and Client ID
5. Add required scopes: openid, profile
6. Complete OAuth flow to authorize access
```

### Cognito Setup for MCP Servers

If you don't have a Cognito User Pool configured, create one:

```bash
# Set your region
export REGION=us-west-2

# Create Cognito User Pool
export POOL_ID=$(aws cognito-idp create-user-pool \
  --pool-name "MCP-Server-Auth" \
  --policies '{"PasswordPolicy":{"MinimumLength":8}}' \
  --region $REGION | jq -r '.UserPool.Id')

# Create App Client for MCP access
export CLIENT_ID=$(aws cognito-idp create-user-pool-client \
  --user-pool-id $POOL_ID \
  --client-name "MCP-OAuth-Client" \
  --no-generate-secret \
  --explicit-auth-flows "ALLOW_USER_PASSWORD_AUTH" "ALLOW_REFRESH_TOKEN_AUTH" \
  --region $REGION | jq -r '.UserPoolClient.ClientId')

# Output configuration
echo "COGNITO_USER_POOL_ID=$POOL_ID"
echo "COGNITO_CLIENT_ID_MCP=$CLIENT_ID"
echo "Discovery URL: https://cognito-idp.$REGION.amazonaws.com/$POOL_ID/.well-known/openid-configuration"
```

Store these values in your application configuration:
- `COGNITO_USER_POOL_ID`: Used in `discoveryUrl`
- `COGNITO_CLIENT_ID_MCP`: Used in `allowedClients`

### Testing OAuth-Protected MCP Server

```python
import asyncio
import boto3
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

async def test_oauth_mcp_server():
    # Get bearer token from Cognito
    cognito = boto3.client('cognito-idp', region_name='us-west-2')
    
    auth_response = cognito.initiate_auth(
        ClientId=COGNITO_CLIENT_ID,
        AuthFlow='USER_PASSWORD_AUTH',
        AuthParameters={
            'USERNAME': 'testuser',
            'PASSWORD': '<YOUR_PASSWORD>'
        }
    )
    
    bearer_token = auth_response['AuthenticationResult']['AccessToken']
    
    # Connect to MCP server with OAuth token
    mcp_url = f"https://bedrock-agentcore.us-west-2.amazonaws.com/runtimes/{agent_arn}/invocations"
    headers = {
        "Authorization": f"Bearer {bearer_token}"
    }
    
    async with streamablehttp_client(mcp_url, headers, timeout=120) as (
        read_stream, write_stream, _
    ):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            
            # Test tool invocation
            result = await session.call_tool(
                "execute_multi_agent_workflow",
                {"task": "Test query"}
            )
            print("Result:", result.content)

if __name__ == "__main__":
    asyncio.run(test_oauth_mcp_server())
```

## Best Practices

### Tool Design
- Keep tool descriptions clear and specific
- Use type hints for all parameters
- Return structured, consistent responses
- Handle edge cases gracefully

### Performance
- Design for stateless operation
- Minimize tool execution time
- Use appropriate timeout values
- Cache expensive operations when possible

### Monitoring
- Implement health checks
- Track tool usage metrics
- Monitor error rates and performance
- Set up alerting for failures

### OAuth Security
- Use separate Cognito clients for different use cases (internal vs external MCP clients)
- Implement proper token validation and expiration
- Monitor authentication failures and suspicious activity
- Rotate credentials regularly

This pattern enables deploying sophisticated multi-agent systems as consumable MCP tools while maintaining all the coordination and intelligence of the original Strands implementation, with secure OAuth authentication for external tool integration platforms.
