# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

"""
Strands agent service for managing the expert agent.

This module is a thin facade that delegates to focused services:
  - AgentLifecycleService  (agent_lifecycle.py)   — init, model switching, health
  - CodeGenerationService  (code_generation_service.py) — code gen orchestration
  - ResponseParser         (response_parser.py)    — text/code/metadata extraction

The public API surface is unchanged so that routers can continue to import
`AgentService` and call the same methods without modification.
"""
import logging
from typing import Optional
from strands import Agent, tool
from strands.models import BedrockModel
from strands_tools import (
    calculator,
    current_time,
    file_read,
    file_write,
    editor,
    journal,
    think
)
from bedrock_agentcore.tools.code_interpreter_client import code_session
import json
from tools.s3_code_storage_tool import s3_write_code, s3_read_code, s3_list_session_files
from services.config_service import config_service
from services.model_id_service import model_id_service

from services.agent_lifecycle import AgentLifecycleService
from services.code_generation_service import CodeGenerationService

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Module-level tools (unchanged — these are registered with the Strands agent)
# ---------------------------------------------------------------------------

@tool
def code_interpreter(code: str, description: str = "") -> str:
    """
    Execute Strands agent code in custom AgentCore Code Interpreter with auto-package installation.
    
    This tool is optimized for Strands Visual Builder and automatically handles:
    - strands-agents package installation
    - strands-agents-tools package installation  
    - boto3 package installation
    - mcp package installation (for MCP tool integration)
    - mcp-proxy-for-aws package installation (for AgentCore Gateway)
    - bedrock-agentcore package installation (for AgentCore deployment)
    - Comprehensive Strands agent testing and validation
    
    Packages are installed on-demand if not available. Use this for all Strands agent code testing.
    
    Args:
        code: Strands agent code to execute
        description: Optional description of what the code does
        
    Returns:
        JSON string containing execution results, output, and any errors
    """
    import boto3
    import uuid
    
    if description:
        code = f"# {description}\n{code}"
    
    logger.info("Executing code in interpreter")
    
    try:
        # Get shared interpreter ID from config
        config = config_service.get_all_config()
        interpreter_id = config.get('AGENTCORE_CODE_INTERPRETER_ID')
        
        if not interpreter_id:
            logger.info("Using default AgentCore code interpreter (no custom interpreter configured)")
            try:
                config = config_service.get_all_config()
                region = config.get('REGION', 'us-east-1')
            except:
                region = 'us-east-1'
            with code_session(region) as code_client:
                response = code_client.invoke("executeCode", {
                    "code": code,
                    "language": "python",
                    "clearContext": False
                })
            
            for event in response["stream"]:
                result = json.dumps(event["result"])
                logger.info("Code executed successfully in default AgentCore sandbox")
                return result
        
        logger.info(f"Using custom Strands code interpreter: {interpreter_id}")
        runtime_client = boto3.client('bedrock-agentcore')
        session_response = runtime_client.start_code_interpreter_session(
            codeInterpreterIdentifier=interpreter_id,
            name=f"strands-test-{uuid.uuid4().hex[:8]}",
            sessionTimeoutSeconds=28800
        )
        session_id = session_response['sessionId']
        
        logger.info(f"Started custom code interpreter session: {session_id}")
        
        indented_code = '\n'.join('    ' + line for line in code.split('\n'))
        
        wrapped_code = f"""
# Auto-install Strands packages if not available
import subprocess
import sys

def install_package(package):
    try:
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', package, '--quiet'])
        return True
    except:
        return False

# Check and install required packages
packages_to_check = [
    ('strands', 'strands-agents'),
    ('strands_tools', 'strands-agents-tools'),
    ('boto3', 'boto3'),
    ('mcp', 'mcp'),
    ('mcp_proxy_for_aws', 'mcp-proxy-for-aws'),
    ('bedrock_agentcore', 'bedrock-agentcore'),
]

for module_name, package_name in packages_to_check:
    try:
        __import__(module_name)
    except ImportError:
        print(f"Installing {{package_name}}...")
        if install_package(package_name):
            print(f"✅ {{package_name}} installed successfully")
        else:
            print(f"❌ Failed to install {{package_name}}")

# Now execute the actual code
try:
{indented_code}
except ImportError as e:
    print(f"❌ Import error: {{e}}")
    print("Some packages may not be available in this environment")
except Exception as e:
    print(f"❌ Execution error: {{e}}")
"""
        
        response = runtime_client.invoke_code_interpreter(
            codeInterpreterIdentifier=interpreter_id,
            sessionId=session_id,
            name="executeCode",
            arguments={
                "code": wrapped_code,
                "language": "python",
                "clearContext": False
            }
        )
        
        for event in response["stream"]:
            result = json.dumps(event["result"])
            
            try:
                runtime_client.stop_code_interpreter_session(
                    codeInterpreterIdentifier=interpreter_id,
                    sessionId=session_id
                )
                logger.info("Code interpreter session cleaned up")
            except Exception as cleanup_error:
                logger.warning(f"Session cleanup warning: {cleanup_error}")
            
            logger.info("Code executed successfully in custom Strands code interpreter")
            return result
            
    except Exception as e:
        error_result = {
            "sessionId": "error",
            "id": "error", 
            "isError": True,
            "content": [{"type": "text", "text": f"Strands execution failed: {str(e)}"}],
            "structuredContent": {
                "stdout": "",
                "stderr": str(e),
                "exitCode": 1,
                "executionTime": 0
            }
        }
        logger.error("Code execution failed")
        return json.dumps(error_result)


@tool
def analyze_visual_config(config_json: str) -> str:
    """
    Analyze visual configuration and extract key insights for code generation.
    
    Args:
        config_json: JSON string containing the visual configuration
        
    Returns:
        String with analysis results and recommendations
    """
    try:
        config = json.loads(config_json)
        
        agent_count = len(config.get('agents', []))
        tool_count = len(config.get('tools', []))
        connection_count = len(config.get('connections', []))
        
        architecture = config.get('architecture', {})
        workflow_type = architecture.get('workflowType', 'unknown')
        complexity = architecture.get('complexity', 'simple')
        patterns = architecture.get('patterns', [])
        
        recommendations = []
        
        if workflow_type == 'single-agent':
            recommendations.append("Use simple Agent() instantiation with direct tool configuration")
        elif workflow_type == 'sequential-pipeline':
            recommendations.append("Implement sequential agent coordination with data passing")
        elif workflow_type == 'parallel-processing':
            recommendations.append("Use async/await for parallel agent execution")
        
        if 'aws-integration' in patterns:
            recommendations.append("Include AWS credentials configuration and error handling")
        
        if 'custom-tool-development' in patterns:
            recommendations.append("Use @tool decorator pattern for custom tools")
        
        analysis_text = f"""✅ Configuration Analysis Complete

📊 Architecture Metrics:
- Agents: {agent_count}
- Tools: {tool_count}
- Connections: {connection_count}
- Workflow Type: {workflow_type}
- Complexity: {complexity}
- Patterns: {', '.join(patterns) if patterns else 'None'}

🎯 Implementation Recommendations:
{chr(10).join(f'- {rec}' for rec in recommendations)}

This analysis will guide the code generation process."""
        
        return analysis_text
        
    except Exception as e:
        return f"❌ Analysis failed: {str(e)}"


# ---------------------------------------------------------------------------
# The canonical list of tools registered with every agent instance.
# Defined once here so both async and sync creation paths stay in sync.
# ---------------------------------------------------------------------------
_AGENT_TOOLS = [
    calculator,
    current_time,
    code_interpreter,
    file_read,
    file_write,
    editor,
    think,
    journal,
    s3_write_code,
    s3_read_code,
    s3_list_session_files,
    analyze_visual_config,
]


class AgentService:
    """Thin facade that delegates to focused services.

    Public API is identical to the original monolith so that routers
    (code.py, projects.py, etc.) continue to work without changes.
    """

    def __init__(self):
        self._lifecycle = AgentLifecycleService(tools=_AGENT_TOOLS)
        self._code_gen = CodeGenerationService(self._lifecycle)

    # --- Lifecycle delegation -------------------------------------------

    async def initialize(self):
        await self._lifecycle.initialize()

    def is_ready(self) -> bool:
        return self._lifecycle.is_ready()

    def get_agent(self, model_id: str = None, advanced_config: dict = None) -> Agent:
        return self._lifecycle.get_agent(model_id, advanced_config)

    def get_agent_info(self) -> dict:
        return self._lifecycle.get_agent_info()

    # --- Code generation delegation -------------------------------------

    def generate_code_freeform(self, config, model_id: str = None, advanced_config: dict = None, request_id: str = None, stream: bool = False):
        return self._code_gen.generate_code_freeform(config, model_id, advanced_config, request_id, stream)

    # --- Expose internal state for backward compat ----------------------
    # Some callers (e.g. code.py router) access agent_service.expert_agent
    # or agent_service.current_model_id directly.

    @property
    def expert_agent(self):
        return self._lifecycle.expert_agent

    @property
    def current_model_id(self):
        return self._lifecycle.current_model_id

    @property
    def system_prompt(self):
        return self._lifecycle.system_prompt
