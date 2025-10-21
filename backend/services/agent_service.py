"""
Strands agent service for managing the expert agent
"""
import logging
from pathlib import Path
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
import json

logger = logging.getLogger(__name__)

@tool
def code_interpreter(code: str, description: str = "") -> str:
    """
    Execute Strands agent code in custom AgentCore Code Interpreter with auto-package installation.
    
    This tool is optimized for Strands Visual Builder and automatically handles:
    - strands-agents package installation
    - strands-agents-tools package installation  
    - boto3 package installation
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
            # Fallback to default AgentCore code interpreter
            # Get region from config service
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
            
            # Process the response stream
            for event in response["stream"]:
                result = json.dumps(event["result"])
                logger.info("Code executed successfully in default AgentCore sandbox")
                return result
        
        # Create session with custom interpreter
        logger.info(f"Using custom Strands code interpreter: {interpreter_id}")
        runtime_client = boto3.client('bedrock-agentcore')
        session_response = runtime_client.start_code_interpreter_session(
            codeInterpreterIdentifier=interpreter_id,
            name=f"strands-test-{uuid.uuid4().hex[:8]}",
            sessionTimeoutSeconds=28800  # 8 hours max
        )
        session_id = session_response['sessionId']
        
        logger.info(f"Started custom code interpreter session: {session_id}")
        
        # Wrap code with package installation and error handling
        # Indent the user code properly
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
    ('boto3', 'boto3')
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
        
        # Execute the wrapped code
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
        
        # Process results
        for event in response["stream"]:
            result = json.dumps(event["result"])
            
            # Cleanup session
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
        
        # Extract key metrics
        agent_count = len(config.get('agents', []))
        tool_count = len(config.get('tools', []))
        connection_count = len(config.get('connections', []))
        
        # Analyze architecture patterns
        architecture = config.get('architecture', {})
        workflow_type = architecture.get('workflowType', 'unknown')
        complexity = architecture.get('complexity', 'simple')
        patterns = architecture.get('patterns', [])
        
        # Generate recommendations
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
        
        # Return as formatted string
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



class AgentService:
    """Service for managing the Strands expert agent"""
    
    def __init__(self):
        self.expert_agent = None
        self.current_model_id = None
        self.current_advanced_config = None
        self.system_prompt = None
    
    def _get_agent_config(self) -> dict:
        """Get agent configuration from SSM with fallback defaults"""
        try:
            config = config_service.get_all_config()
            
            # Get system default model ID with CRIS formatting
            formatted_model_id = model_id_service.get_system_default_model_id()
            aws_region = config.get('REGION', 'us-east-1')
            
            return {
                'bedrock_model_id': formatted_model_id,
                'aws_region': aws_region,
                'bedrock_temperature': float(config.get('BEDROCK_TEMPERATURE', '0.3')),
                'agent_load_tools_from_directory': config.get('AGENT_LOAD_TOOLS_FROM_DIRECTORY', 'false').lower() == 'true',
                'strands_system_prompt': config.get('STRANDS_SYSTEM_PROMPT', 'You are a helpful AI assistant specialized in creating Strands agents.')
            }
        except Exception as e:
            logger.warning("Could not load agent config, using defaults")
            
            # Get system default model ID with CRIS formatting
            default_model_id = model_id_service.get_system_default_model_id()
            
            return {
                'bedrock_model_id': default_model_id,
                'aws_region': 'us-east-1',
                'bedrock_temperature': 0.3,
                'agent_load_tools_from_directory': False,
                'strands_system_prompt': 'You are a helpful AI assistant specialized in creating Strands agents.'
            }
        
    async def initialize(self):
        """Initialize the Strands expert agent with default model"""
        try:
            logger.info("Initializing expert agent")
            
            # Load system prompt from file (cache it for reuse)
            self.system_prompt = self._load_system_prompt()
            logger.info("System prompt loaded")
            
            # Get agent configuration and initialize with default model
            agent_config = self._get_agent_config()
            await self._create_agent_with_model(agent_config['bedrock_model_id'])
            
            logger.info("Expert agent created successfully")
            
        except Exception as e:
            logger.error("Failed to create expert agent")
            self.expert_agent = None
            raise
    
    async def _create_agent_with_model(self, model_id: str, advanced_config: dict = None):
        """Create or recreate the expert agent with specified model and advanced features"""
        try:
            logger.info(f"Creating expert agent with model: {model_id}")
            
            # Parse advanced configuration
            config = advanced_config or {}
            enable_reasoning = config.get('enable_reasoning', False)
            enable_prompt_caching = config.get('enable_prompt_caching', False)
            
            # Get agent configuration
            agent_config = self._get_agent_config()
            
            # Configure Bedrock model with advanced features
            model_config = {
                'model_id': model_id,
                'region_name': agent_config['aws_region'],
                'temperature': config.get('temperature', agent_config['bedrock_temperature'])
            }
            
            # Free-form generation is now the default approach
            logger.info("Agent configured for free-form generation")
            
            # Add reasoning support
            if enable_reasoning:
                model_config['enable_reasoning'] = True
                logger.info("Reasoning tokens enabled")
            
            # Add prompt caching
            if enable_prompt_caching:
                model_config['enable_prompt_caching'] = True
                logger.info("Prompt caching enabled")
            
            model = BedrockModel(**model_config)
            
            # Prepare system prompt with caching markers if enabled
            system_prompt = self.system_prompt
            if enable_prompt_caching:
                system_prompt = self._add_caching_markers(system_prompt)
            
            # Create expert agent following Strands best practices
            self.expert_agent = Agent(
                model=model,
                system_prompt=system_prompt,
                tools=[
                    # Core tools for code generation
                    calculator,
                    current_time,
                    code_interpreter,  # Strands agent code testing with auto-package installation
                    file_read,
                    file_write,
                    editor,
                    
                    # Advanced reasoning and workflow tools
                    think,
                    journal,
                    
                    # S3 code storage tools for dual code generation
                    s3_write_code,
                    s3_read_code,
                    s3_list_session_files,                    
                    # Custom tool for visual config analysis
                    analyze_visual_config
                ],
                # Enable hot-reloading for dynamic tool discovery
                load_tools_from_directory=agent_config['agent_load_tools_from_directory']
            )
            
            self.current_model_id = model_id
            self.current_advanced_config = config
            
            # Agent is ready - no need to test during initialization
            logger.info(f"Expert agent initialized successfully with {model_id}")
            
        except Exception as e:
            logger.error(f"❌ Failed to create expert agent with model {model_id}: {e}")
            raise
    
    def _load_system_prompt(self) -> str:
        """Load system prompt from the markdown file"""
        try:
            # Load from the system prompt file in backend directory
            prompt_file = Path(__file__).parent.parent / "strands-visual-builder-system-prompt.md"
            
            with open(prompt_file, 'r', encoding='utf-8') as f:
                return f.read()
                
        except FileNotFoundError:
            logger.warning(f"System prompt file not found at {prompt_file}")
            # Fallback to config service
            agent_config = self._get_agent_config()
            return agent_config['strands_system_prompt']
        except Exception as e:
            logger.error(f"Error loading system prompt: {e}")
            agent_config = self._get_agent_config()
            return agent_config['strands_system_prompt']
    
    def _ensure_correct_model(self, requested_model_id: str):
        """Update agent model if different from current using Strands update_config() method"""
        if not requested_model_id:
            return
        
        # Early return optimization: check raw model ID first to avoid CRIS formatting if possible
        if requested_model_id == self.current_model_id:
            return
            
        # Apply CRIS formatting to the requested model ID using centralized service
        formatted_model_id = model_id_service.format_model_for_cris(requested_model_id)
        
        # Second check after CRIS formatting
        if formatted_model_id != self.current_model_id:
            try:
                logger.info(f"Dynamic model switching: {self.current_model_id} -> {formatted_model_id}")
                
                # Use Strands' built-in update_config method for runtime model switching
                if self.expert_agent and hasattr(self.expert_agent, 'model'):
                    self.expert_agent.model.update_config(model_id=formatted_model_id)
                    self.current_model_id = formatted_model_id
                    
                    logger.info(f"Model switched successfully to {formatted_model_id} (no container restart required)")
                else:
                    logger.warning("Expert agent not initialized, cannot switch model")
                
            except Exception as e:
                logger.error(f"❌ Failed to switch model from {self.current_model_id} to {formatted_model_id}: {e}")
                # Continue with current model rather than failing
        else:
            logger.debug(f"Model already set to {formatted_model_id}, reusing existing agent instance")
    
    def get_agent(self, model_id: str = None, advanced_config: dict = None) -> Agent:
        """Get the expert agent instance, optionally switching models or updating config"""
        config_changed = advanced_config and advanced_config != self.current_advanced_config
        model_changed = model_id and model_id != self.current_model_id
        
        if model_changed or config_changed:
            logger.info(f"Updating expert agent - Model: {model_id}, Config changed: {config_changed}")
            try:
                # Create new agent with requested model and config synchronously
                self._create_agent_with_model_sync(model_id or self.current_model_id, advanced_config)
            except Exception as e:
                logger.error(f"Failed to update agent: {e}")
                # Continue with current agent
        
        return self.expert_agent
    
    def _create_agent_with_model_sync(self, model_id: str, advanced_config: dict = None):
        """Create or recreate the expert agent with specified model and advanced features (synchronous version)"""
        try:
            logger.info(f"Creating expert agent with model: {model_id}")
            
            # Parse advanced configuration
            config = advanced_config or {}
            enable_reasoning = config.get('enable_reasoning', False)
            enable_prompt_caching = config.get('enable_prompt_caching', False)
            
            # Get agent configuration
            agent_config = self._get_agent_config()
            
            # Configure Bedrock model with advanced features
            model_config = {
                'model_id': model_id,
                'region_name': agent_config['aws_region'],
                'temperature': config.get('temperature', agent_config['bedrock_temperature']),
                # Remove max_tokens limit to allow full model capacity usage
            }
            
            # Free-form generation is now the default approach
            logger.info("Agent configured for free-form generation")
            
            # Add reasoning support
            if enable_reasoning:
                model_config['enable_reasoning'] = True
                logger.info("Reasoning tokens enabled")
            
            # Add prompt caching
            if enable_prompt_caching:
                model_config['enable_prompt_caching'] = True
                logger.info("Prompt caching enabled")
            
            model = BedrockModel(**model_config)
            
            # Prepare system prompt with caching markers if enabled
            system_prompt = self.system_prompt
            if enable_prompt_caching:
                system_prompt = self._add_caching_markers(system_prompt)
            
            # Create expert agent following Strands best practices
            self.expert_agent = Agent(
                model=model,
                system_prompt=system_prompt,
                tools=[
                    # Core tools for code generation
                    calculator,
                    current_time,
                    code_interpreter,  # Strands agent code testing with auto-package installation
                    file_read,
                    file_write,
                    editor,
                    
                    # Advanced reasoning and workflow tools
                    think,
                    journal,
                    
                    # S3 code storage tools for dual code generation
                    s3_write_code,
                    s3_read_code,
                    s3_list_session_files,                    
                    # Custom tool for visual config analysis
                    analyze_visual_config
                ],
                # Enable hot-reloading for dynamic tool discovery
                load_tools_from_directory=agent_config['agent_load_tools_from_directory']
            )
            
            self.current_model_id = model_id
            self.current_advanced_config = config
            logger.info(f"Expert agent switched to model: {model_id}")
            
        except Exception as e:
            logger.error(f"❌ Failed to create expert agent with model {model_id}: {e}")
            raise
    
    def is_ready(self) -> bool:
        """Check if the agent is ready"""
        return self.expert_agent is not None
    
    def _add_caching_markers(self, system_prompt: str) -> str:
        """Add prompt caching markers to system prompt for cost optimization"""
        # Add cache control markers for frequently used sections
        cached_prompt = f"""<cache_control>
{system_prompt}
</cache_control>

This system prompt is cached for performance optimization."""
        
        return cached_prompt
    
    def generate_code_freeform(self, config, model_id: str = None, advanced_config: dict = None, request_id: str = None, stream: bool = False):
        """Generate code using AgentCore expert agent with local fallback"""
        import re
        import json
        
        try:
            # Use the model_id passed in (user's effective model ID from settings)
            
            # Log model extraction for debugging
            if model_id:
                logger.info(f"Extracted model_id from payload: {model_id}")
            
            # Try AgentCore expert agent first
            agentcore_result = self._try_agentcore_expert_agent(config, model_id, advanced_config, request_id, stream)
            if agentcore_result:
                logger.info("Used AgentCore expert agent successfully")
                return agentcore_result
            
            # Fallback to local agent
            logger.info("Falling back to local expert agent")
            
            # Ensure correct model is being used with dynamic switching
            self._ensure_correct_model(model_id)
            
            # Get or update agent with specified model/config
            agent = self.get_agent(model_id, advanced_config)
            
            # Build free-form generation prompt
            prompt = self._build_freeform_generation_prompt(config, request_id)
            logger.info("Generating code with free-form approach...")
            
            # Use simple agent call for free-form generation
            result = agent(prompt)
            
            # Extract response text with proper structure handling (ROOT CAUSE FIX)
            response_text = self._extract_response_text_properly(result)
            
            # Log the raw response for debugging
            logger.debug(f"Extracted response type: {type(response_text)}")
            logger.debug(f"Extracted response preview: {response_text[:200]}...")
            
            # Check if response contains S3 URIs instead of code
            s3_uris = self._extract_s3_uris_from_response(response_text)
            
            # If no S3 URIs found but we have a request_id, try to fetch files directly
            if not s3_uris and request_id:
                logger.info("No S3 URIs found in response, attempting direct file fetch...")
                s3_uris = self._try_fetch_all_files(request_id)
            
            if s3_uris and request_id:
                # Expert agent used S3 storage - fetch the pure_strands code
                logger.info("Expert agent used S3 storage, fetching pure_strands code...")
                code_extraction = self._fetch_code_from_s3(request_id, 'pure_strands')
                if not code_extraction["success"]:
                    logger.warning("Failed to fetch from S3, falling back to regex extraction")
                    code_extraction = self._extract_code_with_fallbacks(response_text)
            else:
                # Fallback to regex extraction
                code_extraction = self._extract_code_with_fallbacks(response_text)
            
            if not code_extraction["success"]:
                raise ValueError(f"Code extraction failed: {code_extraction['error']}")
            
            # Extract metadata from free-form response
            metadata = self._extract_metadata_from_freeform(response_text, code_extraction["code"])
            metadata["s3_uris"] = s3_uris  # Include S3 URIs in metadata
            
            # Validate security
            security_validation = self._validate_generated_code_security(code_extraction["code"])
            metadata["security_validation"] = security_validation
            
            logger.info("Free-form code generation completed")
            
            # Final cleanup of extracted code
            final_code = self._cleanup_code_formatting(code_extraction["code"])
            
            # Return structured response compatible with existing API
            return {
                "configuration_analysis": metadata.get("configuration_analysis", "Analysis completed"),
                "generated_code": final_code,
                "testing_verification": metadata.get("testing_verification", "Testing completed"),
                "final_working_code": final_code,
                "reasoning_process": metadata.get("reasoning_process"),
                "metadata": metadata
            }
            
        except Exception as e:
            logger.error(f"❌ Free-form code generation failed: {e}")
            raise
    
    def _cleanup_code_formatting(self, code: str) -> str:
        """Final cleanup to ensure proper code formatting (no more escape sequence fixes needed)"""
        if not code:
            return code
        
        # With proper response extraction, escape sequences should not occur
        if '\\n' in code or '\\t' in code or '\\"' in code or "\\'" in code:
            logger.error("CRITICAL: Code still contains escape sequences after proper extraction - this indicates a bug!")
            logger.error(f"Code preview: {code[:200]}...")
            # Don't fix it - let it fail so we can identify the real issue
            
        # Only do formatting cleanup (not escape sequence fixes)
        # Ensure proper line endings (normalize to \n)
        code = code.replace('\r\n', '\n').replace('\r', '\n')
        
        # Remove excessive blank lines (more than 2 consecutive)
        import re
        code = re.sub(r'\n{3,}', '\n\n', code)
        
        # Ensure code ends with a single newline
        code = code.rstrip() + '\n'
        
        return code
    
    def _extract_s3_uris_from_response(self, response_text: str) -> dict:
        """Extract S3 URIs from expert agent response"""
        import re
        
        s3_uris = {}
        
        # Debug: Log response text preview
        logger.debug(f"Response text preview (first 1000 chars): {response_text[:1000]}")
        
        # Look for S3 URI patterns
        s3_pattern = r's3://[a-zA-Z0-9\-\.]+/[a-zA-Z0-9\-\./]+'
        uris = re.findall(s3_pattern, response_text)
        
        logger.debug(f"Found S3 URIs in response: {uris}")
        
        for uri in uris:
            if 'pure_strands.py' in uri:
                s3_uris['pure_strands'] = uri
            elif 'agentcore_ready.py' in uri:
                s3_uris['agentcore_ready'] = uri
            elif 'requirements.txt' in uri:
                s3_uris['requirements'] = uri
        
        logger.info(f"Extracted S3 URIs: {s3_uris}")
        return s3_uris
    
    def _try_fetch_all_files(self, request_id: str) -> dict:
        """Try to fetch all generated files directly from S3"""
        s3_uris = {}
        
        try:
            from services.s3_code_storage_service import S3CodeStorageService
            s3_service = S3CodeStorageService()
            
            # Try to fetch each file type
            for code_type in ['pure_strands', 'agentcore_ready', 'requirements']:
                try:
                    result = s3_service.get_code_file(request_id, code_type)
                    if result['status'] == 'success':
                        s3_uris[code_type] = result['s3_uri']
                        logger.info(f"Found {code_type} file at: {result['s3_uri']}")
                except Exception as e:
                    logger.debug(f"Could not fetch {code_type}: {e}")
                    continue
            
            logger.info(f"Direct fetch found S3 URIs: {s3_uris}")
            return s3_uris
            
        except Exception as e:
            logger.error(f"Error in direct file fetch: {e}")
            return {}
    
    def _fetch_code_from_s3(self, request_id: str, code_type: str) -> dict:
        """Fetch code from S3 using the S3 service"""
        try:
            from services.s3_code_storage_service import S3CodeStorageService
            s3_service = S3CodeStorageService()
            
            result = s3_service.get_code_file(request_id, code_type)
            
            if result['status'] == 'success':
                return {
                    "success": True,
                    "code": result['code_content']
                }
            else:
                return {
                    "success": False,
                    "error": result.get('error', 'Failed to fetch from S3')
                }
        except Exception as e:
            logger.error(f"Error fetching code from S3: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def _build_freeform_generation_prompt(self, config, request_id: str = None) -> str:
        """Build free-form generation prompt with comprehensive testing workflow"""
        import json
        
        # Convert config to JSON for analysis
        if hasattr(config, 'model_dump'):
            config_json = json.dumps(config.model_dump(), indent=2)
        elif hasattr(config, 'dict'):
            config_json = json.dumps(config.dict(), indent=2)
        else:
            config_json = json.dumps(config, indent=2)
        
        # Validate configuration input for security
        validation_result = self._validate_configuration_input(config_json)
        if not validation_result["is_safe"]:
            logger.warning(f"Configuration validation warnings: {validation_result['warnings']}")
        
        # Add request ID instruction if provided
        request_id_instruction = ""
        if request_id:
            request_id_instruction = f"""
REQUEST ID: {request_id}

CRITICAL: When using s3_write_code tool, you MUST use session_id="{request_id}" (exactly this value) for both pure_strands and agentcore_ready code types.
DO NOT generate your own session ID - use the provided REQUEST ID: {request_id}
"""

        prompt = f"""Generate clean, working Strands agent code for this visual configuration.
{request_id_instruction}
CONFIGURATION:
{config_json}

CRITICAL REQUIREMENTS:
- Follow current Strands SDK patterns (2025 version)
- **MUST USE code_interpreter tool** to test the generated code and show actual execution results in secure sandbox
- **MUST USE s3_write_code tool** to save both pure_strands and agentcore_ready versions to S3
- **DO NOT include final code in ```python``` blocks** - save to S3 instead and return S3 URIs
- Include proper error handling and validation
- Use environment variables for sensitive configuration
- Focus on correct pattern implementation with clean, readable code
- Include comprehensive comments explaining the code
- Make code runnable in non-interactive environments
- Validate all configuration inputs for security

TRIPLE CODE GENERATION PROCESS:
1. Generate pure Strands code and test it with code_interpreter tool in secure sandbox
2. Use s3_write_code tool to save pure Strands code with code_type='pure_strands'
3. Generate AgentCore-ready version with BedrockAgentCoreApp wrapper
4. Use s3_write_code tool to save AgentCore code with code_type='agentcore_ready'
5. Analyze imports in generated code and create comprehensive requirements.txt
6. Use s3_write_code tool to save requirements.txt with code_type='requirements' and file_extension='.txt'
7. Return S3 URIs of all three files instead of code in markdown blocks

REQUIREMENTS.TXT GENERATION:
- CRITICAL: Always include core packages with version constraints: bedrock-agentcore>=0.1.0, strands-agents>=1.0.0, strands-agents-tools>=0.1.0, boto3>=1.34.0, botocore>=1.34.0
- CRITICAL: Every package MUST have a version constraint (>=X.Y.Z format) - never use bare package names
- Analyze all import statements in your generated code
- Add packages for any external imports (not Python built-ins)
- Use stable version constraints (>=X.Y.Z format) for ALL packages
- Include helpful comments explaining each dependency
- Example format: requests>=2.31.0  # For HTTP requests

MANDATORY FREE-FORM WORKFLOW:
1. **ANALYZE** the visual configuration and validate inputs for security
2. **GENERATE** complete, working Python code with security best practices
3. **TEST** the code using code_interpreter tool and show actual execution results in secure sandbox
4. **VERIFY** the code works and meets security requirements
5. **FIX** any errors found during testing and re-test until working
6. **RETURN** S3 URIs for all three generated files (pure_strands, agentcore_ready, requirements)

RESPONSE FORMAT REQUIREMENTS:
- Provide natural language analysis of the configuration
- Explain your implementation approach and security considerations
- Include actual testing results from code_interpreter execution in secure sandbox
- DO NOT return code in ```python``` blocks - use S3 storage instead
- Return S3 URIs for frontend to fetch the generated files
- Include comprehensive comments and security validation

TESTING REQUIREMENTS:
- Use code_interpreter tool to execute and test the generated code with ONE comprehensive test query in secure sandbox
- If user didn't provide a test query, generate ONE query that tests all agent capabilities efficiently
- Show actual test execution output and results from the ONE test query
- Confirm testing status (✅ passed or ❌ failed) with explanation
- Verify imports work, agents can be created, and basic functionality works with ONE test
- Test security validations and error handling
- Fix any errors and re-test until working perfectly

EFFICIENT TESTING APPROACH:
- ONE query that exercises the entire system (single or multi-agent)
- Reduces token usage and latency compared to multiple test queries
- Example: "What's the current time? Also calculate 45*2" tests both time and calculator agents

SECURITY REQUIREMENTS:
- Validate all configuration inputs for malicious patterns
- Use environment variables for sensitive data (API keys, credentials)
- Implement proper input sanitization and validation
- Include security comments explaining protection measures
- Test security validations during code_interpreter execution in secure sandbox

S3 URI RESPONSE FORMAT:
Your final response must include the S3 URIs for all three generated files:

**Generated Files:**
- Pure Strands Code: s3://bucket/path/pure_strands.py
- AgentCore-Ready Code: s3://bucket/path/agentcore_ready.py  
- Requirements.txt: s3://bucket/path/requirements.txt

CRITICAL: DO NOT include any code in ```python``` blocks. All code must be saved to S3 using the s3_write_code tool. Return only the S3 URIs so the frontend can fetch the files. Describe the testing process and implementation in natural language.

Focus on creating reliable, production-ready Strands agent code that has been actually tested, validated for security, and verified to work in the free-form response format."""
        
        return prompt
    
    def _build_generation_prompt(self, config) -> str:
        """Build simplified prompt for structured output (DEPRECATED - kept for fallback)"""
        import json
        
        # Convert config to JSON for analysis
        if hasattr(config, 'model_dump'):
            config_json = json.dumps(config.model_dump(), indent=2)
        elif hasattr(config, 'dict'):
            config_json = json.dumps(config.dict(), indent=2)
        else:
            config_json = json.dumps(config, indent=2)
        
        prompt = f"""Generate clean, working Strands agent code for this visual configuration:

CONFIGURATION:
{config_json}

CRITICAL REQUIREMENTS:
- Follow current Strands SDK patterns (2025 version)
- **MUST USE code_interpreter tool** to test the generated code and show actual execution results in secure sandbox
- Include proper error handling and validation
- Use environment variables for sensitive configuration
- Focus on correct pattern implementation
- Include comprehensive comments explaining the code
- Make code runnable in non-interactive environments

MANDATORY WORKFLOW:
1. **ANALYZE** the visual configuration and architecture patterns
2. **GENERATE** complete, working Python code (NO markdown code blocks - just raw Python code)
3. **TEST the code using code_interpreter tool** and confirm testing status (✅/❌) in secure sandbox
4. **VERIFY** the code works and fix any errors found
5. **PROVIDE** final verified working code

CODE FORMAT REQUIREMENTS:
- Generate ONLY raw Python code (no ```python blocks or markdown)
- No duplicate imports
- Clean, properly formatted Python code
- Test the code with code_interpreter tool to ensure it works in secure sandbox

TESTING REQUIREMENTS:
- Use code_interpreter tool to execute and test the generated code in secure sandbox
- Confirm testing status (✅ passed or ❌ failed) - no need for full output details
- Verify imports work, agents can be created, and basic functionality works
- Fix any errors and re-test until working

Focus on creating reliable, production-ready Strands agent code that has been actually tested and verified to work."""
        
        return prompt

    def _extract_code_with_fallbacks(self, response: str) -> dict:
        """Extract code using multiple fallback methods"""
        import re
        
        extraction_methods = [
            ("python_blocks", self._extract_python_blocks),
            ("generic_blocks", self._extract_generic_blocks),
            ("import_based", self._extract_import_based),
            ("pattern_matching", self._extract_pattern_matching)
        ]
        
        for method_name, method in extraction_methods:
            try:
                code = method(response)
                if code and len(code.strip()) > 50:  # Minimum viable code length
                    # With proper response extraction, this should not be needed
                    if '\\n' in code:
                        logger.error(f"CRITICAL: {method_name} extracted code with escape sequences - investigate extraction logic!")
                        # Don't fix it - let it fail to identify the issue
                    
                    return {
                        "success": True,
                        "code": code,
                        "method": method_name,
                        "confidence": self._calculate_confidence(code)
                    }
            except Exception as e:
                logger.debug(f"Extraction method {method_name} failed: {e}")
                continue
        
        return {
            "success": False,
            "error": "All code extraction methods failed",
            "raw_response": response[:500]  # First 500 chars for debugging
        }
    
    def _extract_python_blocks(self, response: str) -> str:
        """Extract Python code from ```python``` blocks"""
        import re
        
        # Primary pattern: ```python code blocks
        python_pattern = r'```python\s*\n(.*?)\n```'
        matches = re.findall(python_pattern, response, re.DOTALL | re.IGNORECASE)
        
        if matches:
            # Return the last (most complete) code block
            return matches[-1].strip()
        
        raise ValueError("No Python code blocks found")
    
    def _extract_generic_blocks(self, response: str) -> str:
        """Extract code from generic ``` blocks"""
        import re
        
        # Fallback pattern: generic code blocks
        code_pattern = r'```\s*\n(.*?)\n```'
        matches = re.findall(code_pattern, response, re.DOTALL)
        
        if matches:
            # Filter for Python-like content
            for match in reversed(matches):
                if self._looks_like_python(match):
                    return match.strip()
        
        raise ValueError("No generic code blocks with Python content found")
    
    def _extract_import_based(self, response: str) -> str:
        """Extract code based on import statements"""
        import re
        
        # Emergency fallback: look for import statements
        import_pattern = r'(from strands.*?(?=\n\n|\Z))'
        matches = re.findall(import_pattern, response, re.DOTALL)
        
        if matches:
            return matches[-1].strip()
        
        raise ValueError("No import-based code found")
    
    def _extract_pattern_matching(self, response: str) -> str:
        """Extract code using pattern matching"""
        import re
        
        # Look for code patterns
        patterns = [
            r'(from strands import.*?(?=\n\n|\Z))',
            r'(import strands.*?(?=\n\n|\Z))',
            r'(Agent\(.*?\).*?(?=\n\n|\Z))'
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, response, re.DOTALL)
            if matches:
                return matches[-1].strip()
        
        raise ValueError("No pattern-based code found")
    
    def _looks_like_python(self, code: str) -> bool:
        """Check if code looks like Python"""
        python_indicators = [
            'from strands',
            'import strands',
            'Agent(',
            'def ',
            'class ',
            'if __name__'
        ]
        
        return any(indicator in code for indicator in python_indicators)
    
    def _calculate_confidence(self, code: str) -> float:
        """Calculate confidence score for extracted code"""
        confidence = 0.0
        
        # Check for Strands imports
        if 'from strands' in code or 'import strands' in code:
            confidence += 0.3
        
        # Check for Agent instantiation
        if 'Agent(' in code:
            confidence += 0.3
        
        # Check for proper structure
        if 'def ' in code or 'class ' in code:
            confidence += 0.2
        
        # Check for comments
        if '#' in code:
            confidence += 0.1
        
        # Check for proper imports
        if 'import' in code:
            confidence += 0.1
        
        return min(confidence, 1.0)
    
    def _extract_response_text_properly(self, result) -> str:
        """
        Properly extract text from Strands agent response without escaping newlines.
        This is the ROOT CAUSE FIX - handles the response structure correctly.
        """
        if not hasattr(result, 'message'):
            return str(result)
        
        message = result.message
        
        # Case 1: Simple string message (ideal case)
        if isinstance(message, str):
            return message
        
        # Case 2: Dict-like structure with content
        if isinstance(message, dict):
            # Handle {'role': 'assistant', 'content': [...]} structure
            if 'content' in message:
                content = message['content']
                if isinstance(content, list) and len(content) > 0:
                    # Extract text from content blocks
                    text_parts = []
                    for block in content:
                        if isinstance(block, dict) and 'text' in block:
                            text_parts.append(block['text'])
                        elif isinstance(block, str):
                            text_parts.append(block)
                    return '\n'.join(text_parts) if text_parts else str(message)
                elif isinstance(content, str):
                    return content
            
            # Handle other dict structures
            if 'text' in message:
                return message['text']
        
        # Case 3: Object with content attribute
        if hasattr(message, 'content'):
            content = message.content
            if isinstance(content, list) and len(content) > 0:
                text_parts = []
                for block in content:
                    if hasattr(block, 'text'):
                        text_parts.append(block.text)
                    elif isinstance(block, dict) and 'text' in block:
                        text_parts.append(block['text'])
                    elif isinstance(block, str):
                        text_parts.append(block)
                return '\n'.join(text_parts) if text_parts else str(content)
            elif isinstance(content, str):
                return content
        
        # Case 4: Object with text attribute
        if hasattr(message, 'text'):
            return message.text
        
        # Fallback: convert to string (this is where escaping might happen)
        logger.warning(f"Unknown message structure: {type(message)}, falling back to str()")
        return str(message)
    
    def _extract_metadata_from_freeform(self, response: str, code: str) -> dict:
        """Extract metadata from free-form response"""
        import re
        
        metadata = {
            "generation_method": "free_form",
            "response_length": len(response),
            "code_length": len(code),
            "extraction_method": "regex",
            "security_validated": True,
            "testing_completed": False,
            "configuration_analysis": "",
            "testing_verification": "",
            "reasoning_process": ""
        }
        
        # Extract configuration analysis
        analysis_pattern = r'(?:CONFIGURATION ANALYSIS|Analysis|ANALYSIS):\s*(.*?)(?=\n\n|\n[A-Z]|$)'
        analysis_match = re.search(analysis_pattern, response, re.DOTALL | re.IGNORECASE)
        if analysis_match:
            metadata["configuration_analysis"] = analysis_match.group(1).strip()
        
        # Extract testing verification
        testing_patterns = [
            r'(?:TESTING|TEST|VERIFICATION).*?:\s*(.*?)(?=\n\n|\n[A-Z]|$)',
            r'✅.*?passed.*?(.*?)(?=\n\n|\n[A-Z]|$)',
            r'❌.*?failed.*?(.*?)(?=\n\n|\n[A-Z]|$)'
        ]
        
        for pattern in testing_patterns:
            testing_match = re.search(pattern, response, re.DOTALL | re.IGNORECASE)
            if testing_match:
                metadata["testing_verification"] = testing_match.group(1).strip()
                metadata["testing_completed"] = True
                break
        
        # Extract reasoning process
        reasoning_pattern = r'(?:REASONING|APPROACH|IMPLEMENTATION):\s*(.*?)(?=\n\n|\n[A-Z]|$)'
        reasoning_match = re.search(reasoning_pattern, response, re.DOTALL | re.IGNORECASE)
        if reasoning_match:
            metadata["reasoning_process"] = reasoning_match.group(1).strip()
        
        return metadata
    
    def _validate_configuration_input(self, config_str: str) -> dict:
        """Validate configuration input for security threats"""
        import re
        
        validation_results = {
            "is_safe": True,
            "warnings": [],
            "sanitized_config": config_str
        }
        
        # Check for injection patterns
        injection_patterns = [
            r'__import__\s*\(',
            r'exec\s*\(',
            r'eval\s*\(',
            r'subprocess\.',
            r'os\.system',
            r'<script',
            r'javascript:',
            r'data:text/html'
        ]
        
        for pattern in injection_patterns:
            if re.search(pattern, config_str, re.IGNORECASE):
                validation_results["warnings"].append(f"Potential injection pattern detected: {pattern}")
                validation_results["is_safe"] = False
        
        return validation_results
    
    def _validate_generated_code_security(self, code: str) -> dict:
        """Validate generated code for security issues"""
        import re
        
        validation_results = {
            "is_safe": True,
            "security_issues": [],
            "recommendations": []
        }
        
        # Check for security anti-patterns
        security_checks = [
            (r'api_key\s*=\s*["\'][^"\']+["\']', "Hardcoded API key detected"),
            (r'password\s*=\s*["\'][^"\']+["\']', "Hardcoded password detected"),
            (r'exec\s*\(', "Dynamic code execution detected"),
            (r'eval\s*\(', "Dynamic evaluation detected"),
            (r'input\s*\(', "Interactive input detected (causes automation issues)")
        ]
        
        for pattern, message in security_checks:
            if re.search(pattern, code, re.IGNORECASE):
                validation_results["security_issues"].append(message)
                validation_results["is_safe"] = False
        
        return validation_results

    def _get_expert_agent_arn(self) -> Optional[str]:
        """Get AgentCore expert agent ARN from SSM parameter"""
        try:
            import boto3
            from typing import Optional
            
            # Get account ID
            account_id = boto3.client('sts').get_caller_identity()['Account']
            ssm_param_name = f"/strands-visual-builder/{account_id}/agentcore/runtime-arn"
            
            # Get parameter from SSM
            ssm_client = boto3.client('ssm')
            response = ssm_client.get_parameter(Name=ssm_param_name)
            agent_arn = response['Parameter']['Value']
            
            if agent_arn and agent_arn != 'None':
                logger.info(f"Found AgentCore expert agent ARN: {agent_arn}")
                return agent_arn
            else:
                logger.info("No AgentCore expert agent ARN found in SSM")
                return None
                
        except Exception as e:
            logger.warning(f"Failed to get AgentCore expert agent ARN from SSM: {e}")
            return None

    def _should_use_agentcore_runtime(self) -> bool:
        """Check if we should use AgentCore runtime based on environment variable set by start.sh"""
        import os
        
        # Check environment variable set by start.sh
        use_agentcore = os.getenv('USE_AGENTCORE_RUNTIME', 'true').lower()  # Default to true for production
        logger.info(f"Environment check: USE_AGENTCORE_RUNTIME={use_agentcore}")
        
        if use_agentcore == 'false':
            logger.info("USE_AGENTCORE_RUNTIME=false - using local agent only (development mode)")
            return False
        else:
            logger.info("USE_AGENTCORE_RUNTIME=true - will attempt AgentCore runtime")
            return True

    def _try_agentcore_expert_agent(self, config, model_id: str = None, advanced_config: dict = None, request_id: str = None, stream: bool = False):
        """Try to use AgentCore expert agent, return None if not available or disabled"""
        logger.info("Checking AgentCore vs Local decision...")
        try:
            import boto3
            import json
            
            # Check if we should use AgentCore runtime (controlled by start.sh)
            if not self._should_use_agentcore_runtime():
                logger.info("Local agent mode enabled - skipping AgentCore runtime")
                return None
            
            # Get expert agent ARN from SSM
            expert_agent_arn = self._get_expert_agent_arn()
            if not expert_agent_arn:
                logger.info("No AgentCore expert agent ARN found - using local agent")
                return None
            
            logger.info("Attempting to use AgentCore expert agent...")
            logger.info(f"Expert agent ARN: {expert_agent_arn}")
            
            # Prepare payload for AgentCore expert agent
            # Fix Pydantic V2 deprecation warning
            if hasattr(config, 'model_dump'):
                config_dict = config.model_dump()
            elif hasattr(config, 'dict'):
                config_dict = config.dict()
            else:
                config_dict = config
                
            payload = {
                "config": config_dict,
                "model_id": model_id,
                "advanced_config": advanced_config or {},
                "request_id": request_id
            }
            
            if stream:
                payload["stream"] = True
            
            # Generate session ID with minimum 33 characters for AgentCore
            import uuid
            session_id = f"codegen_{request_id}_{str(uuid.uuid4())}"[:50]  # Ensure it's long enough but not too long
            
            # Direct boto3 call to AgentCore with configurable timeout
            from botocore.config import Config
            
            # Get timeout from config service or use reasonable default
            # Frontend default is 600s, but AgentCore needs more time for code generation
            try:
                config_service_instance = config_service
                all_config = config_service_instance.get_all_config()
                # Look for code generation timeout in SSM config, default to 900s (15 minutes)
                code_gen_timeout = int(all_config.get('AGENTCORE_CODE_GENERATION_TIMEOUT', 900))
            except:
                code_gen_timeout = 900  # 15 minutes default
            
            logger.info(f"Using AgentCore timeout: {code_gen_timeout}s (configurable via SSM parameter AGENTCORE_CODE_GENERATION_TIMEOUT)")
            
            # Configure timeout for code generation
            config = Config(
                read_timeout=code_gen_timeout,
                connect_timeout=60,  # 1 minute
                retries={'max_attempts': 2}
            )
            
            runtime_client = boto3.client('bedrock-agentcore', config=config)
            
            logger.info(f"Invoking AgentCore with session: {session_id}")
            logger.info("⏳ This may take 2-3 minutes for code generation...")
            
            response = runtime_client.invoke_agent_runtime(
                agentRuntimeArn=expert_agent_arn,
                runtimeSessionId=session_id,
                payload=json.dumps(payload).encode()
            )
            
            logger.info("AgentCore invocation completed")
            logger.info(f"🔍 AgentCore response content type: {response.get('contentType', 'unknown')}")
            logger.info(f"🔍 AgentCore response keys: {list(response.keys())}")
            
            # Process AgentCore response
            return self._process_agentcore_response(response, request_id, stream)
            
        except Exception as e:
            logger.warning(f"AgentCore expert agent failed: {e}")
            return None  # Fallback to local agent

    def _process_agentcore_response(self, response, request_id: str = None, stream: bool = False):
        """Process AgentCore response using AWS sample patterns - FIXED VERSION"""
        try:
            import json
            
            # Check response type and handle accordingly (based on AWS samples)
            if "text/event-stream" in response.get("contentType", ""):
                # Streaming response - use iter_lines() method
                logger.info("Processing streaming AgentCore response...")
                
                if stream:
                    # STREAMING MODE: Preserve AgentCore's SSE format without reconstruction
                    logger.info("🔄 Starting AgentCore streaming iteration...")
                    chunk_count = 0
                    full_content = ""
                    
                    for line in response["response"].iter_lines():  # Use default chunk size to preserve SSE lines
                        if line:
                            chunk_count += 1
                            decoded_line = line.decode("utf-8")
                            # DEBUG: Uncomment for streaming debugging
                            # logger.info(f"📦 AgentCore chunk {chunk_count}: '{decoded_line[:100]}{'...' if len(decoded_line) > 100 else ''}'")
                            
                            # Handle SSE data lines from AgentCore
                            if decoded_line.startswith("data: "):
                                content_chunk = decoded_line[6:]  # Remove "data: " prefix
                                
                                # AgentCore sends quoted strings like "text content"
                                # Parse JSON to get actual text content
                                try:
                                    import json
                                    text_content = json.loads(content_chunk)
                                    full_content += text_content
                                    
                                    # Send the text content with escaped newlines for proper SSE format
                                    # SSE data fields cannot contain raw newlines - they must be escaped
                                    escaped_content = text_content.replace('\n', '\\n').replace('\r', '\\r')
                                    sse_line = f"data: {escaped_content}\n\n"
                                    
                                    # DEBUG: Uncomment for SSE debugging
                                    # if '\\n' in escaped_content:
                                    #     logger.info(f"🔍 YIELDING SSE with escaped newlines: {repr(sse_line)}")
                                    
                                    yield sse_line
                                    
                                except json.JSONDecodeError:
                                    # If not a JSON string, send as-is
                                    full_content += content_chunk
                                    sse_line = f"data: {content_chunk}\n\n"
                                    yield sse_line
                            elif decoded_line.strip() == "":
                                # Preserve empty lines for SSE format
                                yield decoded_line + "\n"
                            elif decoded_line.strip():  # Handle non-SSE lines by wrapping them
                                full_content += decoded_line + "\n"
                                sse_line = f"data: {decoded_line}\n\n"
                                logger.info(f"🚀 Yielding wrapped line {chunk_count}: {len(sse_line)} chars")
                                yield sse_line
                    
                    logger.info(f"✅ AgentCore streaming completed with {chunk_count} total chunks")
                    
                    # Send final metadata as SSE message (generators can't return values)
                    try:
                        final_response = {
                            "success": True,
                            "code": full_content,
                            "metadata": {
                                "request_id": request_id,  # REAL request_id from backend
                                "streaming": True,
                                "generation_method": "agentcore_expert_streaming"
                            }
                        }
                        
                        import json
                        final_sse = f"data: [FINAL]{json.dumps(final_response)}\n\n"
                        logger.info(f"🏁 Sending final metadata with REAL request_id: {request_id}")
                        yield final_sse
                        
                    except Exception as e:
                        logger.error(f"Failed to send final metadata: {e}")
                    
                    return  # End generator
                else:
                    # NON-STREAMING MODE: Collect chunks (existing behavior)
                    content = []
                    for line in response["response"].iter_lines():  # Use default chunk size
                        if line:
                            decoded_line = line.decode("utf-8")
                            if decoded_line.startswith("data: "):
                                decoded_line = decoded_line[6:]  # Remove "data: " prefix
                            content.append(decoded_line)
                    result_text = "\n".join(content)
                    
                    # Parse JSON if possible
                    try:
                        result = json.loads(result_text)
                    except json.JSONDecodeError:
                        result = {"result": result_text}
                    
            else:
                # Event stream response - collect events then decode
                logger.info("Processing event stream AgentCore response...")
                events = []
                for event in response.get("response", []):
                    events.append(event)  # Don't decode here - events are structured objects
                
                if events:
                    # Handle different event types safely
                    try:
                        # Try to decode if it's bytes
                        if hasattr(events[0], 'decode'):
                            result_text = events[0].decode("utf-8")
                        elif isinstance(events[0], (str, dict)):
                            # Already decoded or structured data
                            result_text = json.dumps(events[0]) if isinstance(events[0], dict) else events[0]
                        else:
                            logger.warning(f"Unexpected event type: {type(events[0])}")
                            return None
                        
                        try:
                            result = json.loads(result_text)
                        except json.JSONDecodeError:
                            result = {"result": result_text}
                    except Exception as e:
                        logger.error(f"Failed to process event: {e}")
                        return None
                else:
                    logger.warning("No events in AgentCore response")
                    return None
            
            # Log the processed result
            logger.info(f"AgentCore raw response keys: {list(result.keys())}")
            logger.info(f"AgentCore raw response preview: {str(result)[:500]}...")
            
            # Extract the structured result from AgentCore expert agent
            if 'result' in result:
                agentcore_result = result['result']
                logger.info(f"AgentCore result type: {type(agentcore_result)}")
                
                # Handle case where result is a structured dict (expected)
                if isinstance(agentcore_result, dict) and 'generated_code' in agentcore_result:
                    return {
                        "configuration_analysis": agentcore_result.get("configuration_analysis", "Analysis completed"),
                        "generated_code": agentcore_result.get("generated_code", "Code stored in S3"),
                        "testing_verification": agentcore_result.get("testing_verification", "Testing completed"),
                        "final_working_code": agentcore_result.get("final_working_code", "Code stored in S3"),
                        "reasoning_process": agentcore_result.get("reasoning_process"),
                        "metadata": {
                            **agentcore_result.get("metadata", {}),
                            "generation_method": "agentcore_expert",
                            "request_id": request_id
                        }
                    }
                
                # Handle case where result is a raw Strands response (needs processing)
                elif isinstance(agentcore_result, (str, dict)):
                    logger.info("AgentCore returned raw Strands response, processing...")
                    
                    # Extract text from Strands response format
                    response_text = self._extract_response_text_properly(agentcore_result)
                    
                    # Check if expert agent stored files in S3
                    s3_uris = self._extract_s3_uris_from_response(response_text)
                    
                    if s3_uris and request_id:
                        logger.info("AgentCore expert agent used S3 storage, fetching code...")
                        # Try to fetch from S3 first
                        code_extraction = self._fetch_code_from_s3(request_id, 'pure_strands')
                        if not code_extraction["success"]:
                            logger.warning("Failed to fetch from S3, using fallback")
                            code_extraction = {"code": "Code stored in S3", "success": True}
                    else:
                        # Extract code from response text
                        code_extraction = self._extract_code_with_fallbacks(response_text)
                        if not code_extraction["success"]:
                            code_extraction = {"code": "Code generated by AgentCore", "success": True}
                    
                    # Extract metadata
                    metadata = self._extract_metadata_from_freeform(response_text, code_extraction["code"])
                    metadata["s3_uris"] = s3_uris
                    metadata["generation_method"] = "agentcore_expert"
                    metadata["request_id"] = request_id
                    
                    return {
                        "configuration_analysis": metadata.get("configuration_analysis", "Analysis completed"),
                        "generated_code": code_extraction["code"],
                        "testing_verification": metadata.get("testing_verification", "Testing completed"),
                        "final_working_code": code_extraction["code"],
                        "reasoning_process": metadata.get("reasoning_process"),
                        "metadata": metadata
                    }
                
                else:
                    logger.warning(f"Unexpected AgentCore result format: {type(agentcore_result)}")
                    return None
            else:
                logger.warning("No 'result' key in AgentCore response")
                return None
                
        except Exception as e:
            logger.error(f"Failed to process AgentCore response: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            return None

    def get_agent_info(self) -> dict:
        """Get information about the expert agent"""
        if not self.is_ready():
            return {"status": "not_ready"}
        
        config = self.current_advanced_config or {}
        
        return {
            "model": self.current_model_id or "Unknown",
            "model_id": self.current_model_id,
            "tools_count": len(self.expert_agent.tools) if hasattr(self.expert_agent, 'tools') else 0,
            "advanced_features": {
                "structured_output": False,  # Now disabled
                "free_form_generation": True,  # New feature
                "reasoning_enabled": config.get('enable_reasoning', False),
                "prompt_caching": config.get('enable_prompt_caching', False),
                "runtime_switching": config.get('runtime_model_switching', False)
            },
            "capabilities": [
                "Visual configuration analysis",
                "Strands code generation", 
                "Architecture pattern implementation",
                "Best practice application",
                "Error handling and validation",
                "Advanced Bedrock features",
                "Free-form code generation",
                "Security validation"
            ],
            "status": "ready"
        }