"""
AgentCore Deployment Service

Handles deployment of Strands agents to Amazon Bedrock AgentCore using the
bedrock-agentcore-starter-toolkit Python SDK.
"""

import logging
import tempfile
import uuid
from pathlib import Path
from typing import Dict, Any, Optional
import boto3
from botocore.exceptions import ClientError
from pydantic import BaseModel

try:
    from bedrock_agentcore_starter_toolkit import Runtime
except ImportError:
    # Fallback for development/testing
    Runtime = None

from services.config_service import config_service

logger = logging.getLogger(__name__)


class DeploymentConfig(BaseModel):
    """Configuration for AgentCore deployment"""
    agent_name: str
    description: str = ""
    region: Optional[str] = None  # Will be set dynamically from config service
    memory: int = 1024  # MB
    timeout: int = 600  # seconds
    python_version: str = "3.11"
    environment_variables: Dict[str, str] = {}
    observability_enabled: bool = True
    log_level: str = "INFO"
    tags: Dict[str, str] = {}


# DeploymentStatus class removed - no longer needed for synchronous deployment


class AgentCoreDeploymentService:
    """Service for deploying Strands agents to AgentCore"""
    
    def __init__(self):
        self.runtime = None
        self.control_client = None
        
    def _initialize_clients(self, region: Optional[str] = None):
        """Initialize AgentCore clients"""
        if Runtime is None:
            logger.warning("bedrock-agentcore-starter-toolkit not installed, using mock mode")
            self.runtime = None
            self.control_client = None
            return
            
        # Get region from config service if not provided
        if region is None:
            config = config_service.get_all_config()
            region = config.get('REGION', 'us-east-1')  # fallback to us-east-1
            
        try:
            self.runtime = Runtime()
            self.control_client = boto3.client('bedrock-agentcore-control', region_name=region)
            logger.info(f"AgentCore clients initialized successfully for region: {region}")
        except Exception as e:
            logger.warning(f"Failed to initialize AgentCore clients for region {region}: {e}")
            self.runtime = None
            self.control_client = None
    

    
    def _create_requirements_txt(self, additional_requirements: list = None) -> str:
        """Create requirements.txt for AgentCore deployment with clean formatting"""
        base_requirements = [
            "bedrock-agentcore>=0.1.0",
            "strands-agents>=1.0.0", 
            "strands-agents-tools>=0.1.0",
            "boto3>=1.34.0",
            "botocore>=1.34.0",
            "requests>=2.31.0",
            "pydantic>=2.0.0",
            "typing-extensions>=4.0.0"
        ]
        
        if additional_requirements:
            # Clean and validate additional requirements
            clean_additional = [req.strip() for req in additional_requirements if req.strip()]
            base_requirements.extend(clean_additional)
        
        # Validate package names (no spaces, underscores, or special chars in wrong places)
        validated_requirements = []
        for req in base_requirements:
            # Remove any whitespace and validate format
            clean_req = req.strip()
            if clean_req and not any(char in clean_req for char in ['\t', '\r']):
                validated_requirements.append(clean_req)
            else:
                logger.warning("Skipping invalid requirement")
        
        # Create clean requirements string with Unix line endings only
        requirements_content = "\n".join(validated_requirements) + "\n"
        
        # Ensure clean UTF-8 encoding without BOM or hidden characters
        clean_content = requirements_content.encode('utf-8').decode('utf-8')
        
        # Final validation - ensure no problematic characters
        if any(ord(char) > 127 for char in clean_content if char not in '\n'):
            logger.warning("Non-ASCII characters detected in requirements.txt")
        
        return clean_content
    
    def _sanitize_agent_name(self, name: str) -> str:
        """Sanitize agent name to meet AgentCore requirements (letters, numbers, underscores only)"""
        import re
        
        # Convert to lowercase
        sanitized = name.lower()
        
        # Replace hyphens, spaces, and other separators with underscores
        sanitized = re.sub(r'[-\s\.]+', '_', sanitized)
        
        # Remove any characters that aren't letters, numbers, or underscores
        sanitized = re.sub(r'[^a-z0-9_]', '', sanitized)
        
        # Ensure it starts with a letter (AgentCore requirement)
        if sanitized and not sanitized[0].isalpha():
            sanitized = 'agent_' + sanitized
        
        # Ensure it's not empty
        if not sanitized:
            sanitized = 'agent'
        
        # Remove consecutive underscores
        sanitized = re.sub(r'_{2,}', '_', sanitized)
        
        # Ensure it doesn't end with underscore
        sanitized = sanitized.rstrip('_')
        
        # Truncate to 48 characters max (AgentCore limit)
        if len(sanitized) > 48:
            sanitized = sanitized[:48].rstrip('_')
        
        # Final validation - ensure it matches AgentCore pattern
        if not re.match(r'^[a-z][a-z0-9_]*$', sanitized):
            # Fallback to simple safe name
            import time
            sanitized = "agent_default"
        
        return sanitized
    
    def _fix_requirements_versions(self, requirements_content: str) -> str:
        """Fix known version issues in expert-generated requirements.txt"""
        # Known correct versions based on PyPI availability
        version_fixes = {
            "bedrock-agentcore>=1.0.0": "bedrock-agentcore>=0.1.0",
            "strands-agents-tools>=1.0.0": "strands-agents-tools>=0.1.0",
        }
        
        fixed_content = requirements_content
        for incorrect_version, correct_version in version_fixes.items():
            if incorrect_version in fixed_content:
                fixed_content = fixed_content.replace(incorrect_version, correct_version)
                logger.info("Fixed package version")
        
        return fixed_content
    
    async def deploy_agent(self, strands_code: str, config: DeploymentConfig, requirements_txt: str = None) -> str:
        """Deploy Strands agent to AgentCore and return agent ARN directly"""
        try:
            logger.info("Starting agent deployment")
            
            # Get region from config service if not set
            if config.region is None:
                app_config = config_service.get_all_config()
                config.region = app_config.get('REGION', 'us-east-1')
            
            # Initialize clients
            self._initialize_clients(config.region)
            
            # Ensure runtime is available (no mocking allowed)
            if self.runtime is None:
                raise Exception("AgentCore toolkit not available - cannot deploy without real AWS integration")
            
            # Create temporary files for deployment within the project directory
            # AgentCore requires files to be within the current working directory
            temp_dir_name = f"agentcore_deployment_{uuid.uuid4().hex[:8]}"
            temp_path = Path.cwd() / temp_dir_name
            temp_path.mkdir(exist_ok=True)
            
            try:
                # Write expert code directly without transformation
                agent_file = temp_path / "agent.py"
                agent_file.write_text(strands_code)
                
                # Write requirements with explicit UTF-8 encoding and Unix line endings
                requirements_file = temp_path / "requirements.txt"
                
                # Use expert-generated requirements.txt if provided, otherwise create default
                if requirements_txt:
                    requirements_content = requirements_txt
                    logger.info("Using provided requirements")
                else:
                    requirements_content = self._create_requirements_txt()
                    logger.info("Using default requirements")
                
                # Write with explicit encoding to prevent formatting issues
                with open(requirements_file, 'w', encoding='utf-8', newline='\n') as f:
                    f.write(requirements_content)
                
                # Configure deployment with basic parameters
                sanitized_agent_name = self._sanitize_agent_name(config.agent_name)
                namespaced_agent_name = self._add_app_suffix(sanitized_agent_name)
                logger.info(f"Configuring agent deployment with suffix: {namespaced_agent_name}")
                
                try:
                    configure_result = self.runtime.configure(
                        entrypoint=str(agent_file),
                        agent_name=namespaced_agent_name,  # Now has app suffix
                        requirements_file=str(requirements_file),
                        auto_create_execution_role=True,
                        region=config.region
                    )
                    logger.info("Configuration completed")
                except Exception as e:
                    logger.error(f"Configuration failed: {str(e)}")
                    logger.error(f"Exception type: {type(e).__name__}")
                    import traceback
                    logger.error(f"Full traceback: {traceback.format_exc()}")
                    raise Exception(f"AgentCore configuration failed: {str(e)}")
                
                # Launch deployment (this is synchronous and waits for completion)
                try:
                    logger.info("Starting AgentCore deployment")
                    launch_result = self.runtime.launch()
                    logger.info("Launch completed")
                except Exception as e:
                    logger.error(f"Launch failed: {str(e)}")
                    logger.error(f"Exception type: {type(e).__name__}")
                    # Log the full exception for debugging
                    import traceback
                    logger.error(f"Full traceback: {traceback.format_exc()}")
                    raise Exception(f"AgentCore launch failed: {str(e)}")
                
                # Get agent ARN - deployment is complete!
                agent_arn = launch_result.agent_arn
                logger.info("Successfully deployed agent")
                
                # Return the ARN directly since deployment is complete
                return agent_arn
                
            finally:
                # Cleanup temporary files
                try:
                    import shutil
                    if temp_path.exists():
                        shutil.rmtree(temp_path)
                        logger.info("Cleaned up temporary directory")
                except Exception as cleanup_error:
                    logger.warning("Failed to cleanup temporary directory")
                
        except Exception as e:
            logger.error("Deployment failed")
            raise Exception("AgentCore deployment failed")
    


    
    async def get_agent_runtime_status(self, agent_runtime_arn: str) -> Optional[Dict[str, Any]]:
        """Get agent runtime status from AWS API (only if created by Strands Visual Builder)"""
        try:
            if not self.control_client:
                self._initialize_clients()
                
            if not self.control_client:
                return None
                
            # Get agent runtime (single API call)
            response = self.control_client.get_agent_runtime(
                agentRuntimeArn=agent_runtime_arn
            )
            runtime = response.get('agentRuntime')
            
            # Fast string-based validation (no extra API calls)
            if not self._validate_agent_access_from_runtime(runtime):
                logger.error(f"Access denied: Cannot access non-Strands agent: {agent_runtime_arn}")
                return None
            
            return runtime
            
        except ClientError as e:
            logger.error("Failed to get AWS status")
            return None

    async def list_agent_runtimes(self) -> list:
        """List agent runtimes created by Strands Visual Builder only"""
        try:
            if not self.control_client:
                self._initialize_clients()
                
            if not self.control_client:
                return []
                
            response = self.control_client.list_agent_runtimes()
            
            # Security filter: Only include our agents
            deployments = []
            for runtime in response.get('agentRuntimes', []):
                tags = runtime.get('tags', {})
                created_by = tags.get('CreatedBy', '')
                managed_by = tags.get('ManagedBy', '')
                agent_name = runtime.get('agentRuntimeName', '')
                
                # Only include agents created by Strands Visual Builder
                if (created_by == 'strands-visual-builder' or 
                    managed_by == 'strands-visual-builder' or
                    # Check naming pattern for suffix-based security
                    '_svbui_a7f3' in agent_name or
                    # Fallback: check naming pattern for existing agents
                    agent_name.startswith(('strands', 'agent_', 'expert_agent'))):
                    
                    deployment = {
                        'deployment_id': runtime.get('agentRuntimeName', runtime.get('agentRuntimeId', 'unknown')),
                        'agent_runtime_arn': runtime.get('agentRuntimeArn'),
                        'status': runtime.get('status', 'UNKNOWN'),
                        'progress': 100 if runtime.get('status') == 'READY' else 50,
                        'timestamp': runtime.get('lastModifiedTime', runtime.get('creationTime', '')),
                        'tags': tags
                    }
                    deployments.append(deployment)
                else:
                    logger.debug(f"Filtered out non-Strands agent: {agent_name}")
            
            logger.info(f"Listed {len(deployments)} Strands Visual Builder agents")
            return deployments
            
        except ClientError as e:
            logger.error("Failed to list agent runtimes")
            return []

    def _validate_agent_access_from_runtime(self, runtime: Dict[str, Any]) -> bool:
        """Validate agent access using already-fetched runtime data (zero latency)"""
        if not runtime:
            return False
            
        tags = runtime.get('tags', {})
        agent_name = runtime.get('agentRuntimeName', '')
        
        # Check security tags and naming patterns (pure string operations)
        created_by = tags.get('CreatedBy', '')
        managed_by = tags.get('ManagedBy', '')
        
        is_authorized = (
            created_by == 'strands-visual-builder' or
            managed_by == 'strands-visual-builder' or
            # Check suffix-based security (primary method)
            '_svbui_a7f3' in agent_name or
            # Backward compatibility for existing agents
            agent_name.startswith(('strands', 'agent_', 'expert_agent'))
        )
        
        if not is_authorized:
            logger.warning(f"Access denied to non-Strands agent: {agent_name}")
        
        return is_authorized

    async def _validate_agent_access(self, agent_runtime_arn: str) -> bool:
        """Validate that the agent was created by Strands Visual Builder (with API call)"""
        try:
            if not self.control_client:
                self._initialize_clients()
                
            if not self.control_client:
                return False
                
            response = self.control_client.get_agent_runtime(
                agentRuntimeArn=agent_runtime_arn
            )
            
            runtime = response.get('agentRuntime', {})
            return self._validate_agent_access_from_runtime(runtime)
            
        except ClientError as e:
            logger.error(f"Failed to validate agent access: {e}")
            return False

    def _validate_code_interpreter_access(self, interpreter_id: str) -> bool:
        """Validate that we can only access our custom code interpreter (zero latency)"""
        # Get the expected interpreter ID from config
        config = config_service.get_all_config()
        allowed_interpreter_id = config.get('AGENTCORE_CODE_INTERPRETER_ID')
        
        # Simple string comparison - no API calls needed!
        if interpreter_id == allowed_interpreter_id:
            return True
            
        logger.warning(f"Access denied to unauthorized code interpreter: {interpreter_id}")
        return False

    def _add_app_suffix(self, agent_name: str) -> str:
        """Add application suffix to identify agents created by Strands Visual Builder"""
        APP_SUFFIX = "_svbui_a7f3"  # Strands Visual Builder UI identifier
        suffix = APP_SUFFIX
        max_base_length = 48 - len(suffix)  # AgentCore 48 char limit
        
        if len(agent_name) > max_base_length:
            agent_name = agent_name[:max_base_length].rstrip('_')
        
        return f"{agent_name}{suffix}"


# Global service instance
agentcore_service = AgentCoreDeploymentService()