"""
Code generation router for Strands agent code generation
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from datetime import datetime
import logging
from models.api_models import (
    CodeGenerationResponse, 
    PythonExecutionRequest, ExecutionResult,
    PythonError, EnhancedVisualConfig, User
)
from services.agent_service import AgentService
from services.code_service import CodeService
from services.model_id_service import model_id_service
from services.auth_service import get_current_user

from strands import Agent
from strands_tools import python_repl
import re

logger = logging.getLogger(__name__)
router = APIRouter(tags=["code"])

# Initialize services (will be updated by main.py on startup)
agent_service = None
code_service = CodeService()

# Create a dedicated agent for python_repl execution
_python_agent = None

def get_python_agent():
    """Get or create the Python execution agent"""
    global _python_agent
    if _python_agent is None:
        _python_agent = Agent(tools=[python_repl])
    return _python_agent

@router.post("/generate-code", response_model=CodeGenerationResponse)
async def generate_code(config: EnhancedVisualConfig, current_user: User = Depends(get_current_user)):
    """Generate Strands code from visual configuration using expert agent"""
    
    logger.info("=== GENERATE CODE ENDPOINT CALLED ===")
    logger.info(f"🔍 Received config - stream: {config.stream}, agents: {len(config.agents)}, tools: {len(config.tools)}")
    
    if not agent_service or not agent_service.is_ready():
        raise HTTPException(status_code=500, detail="Expert agent not initialized")
    
    try:
        logger.info(f"Code generation started - Architecture: {config.architecture.workflowType}")
        
        # Generate unique request ID for S3 storage FIRST (before using it)
        import uuid
        request_id = f"req_{uuid.uuid4().hex[:12]}"
        logger.info(f"Generated request ID: {request_id}")
        
        # Get user's effective model ID (user settings -> system default)
        effective_model_id = await model_id_service.get_effective_model_id(user_id=current_user.email)
        logger.info(f"Using effective model ID: {effective_model_id}")
        
        # Prepare advanced configuration
        advanced_config = {}
        if config.bedrock_config:
            advanced_config = {
                # Structured output is always enabled - Strands handles compatibility
                'enable_reasoning': config.bedrock_config.enable_reasoning,
                'enable_prompt_caching': config.bedrock_config.enable_prompt_caching,
                'runtime_model_switching': config.bedrock_config.runtime_model_switching,
                'temperature': config.bedrock_config.temperature,
                # Remove max_tokens to allow full model capacity
                'top_p': config.bedrock_config.top_p
            }
        
        # Use free-form generation approach (default)
        use_freeform_generation = config.generation_mode != "structured"  # Use free-form unless explicitly structured
        
        # Check if streaming is requested
        if config.stream:
            logger.info("🌊 Streaming mode enabled")
            
            # Generate streaming response
            generator = agent_service.generate_code_freeform(
                config,
                effective_model_id,
                advanced_config,
                request_id,
                stream=True  # Enable streaming
            )
            
            def stream_generator():
                logger.info("🌊 Router stream_generator started")
                chunk_count = 0
                try:
                    # Handle sync generator from agent service
                    for chunk in generator:
                        chunk_count += 1
                        # DEBUG: Uncomment for router streaming debugging
                        # logger.info(f"📡 Router yielding chunk {chunk_count}: {len(str(chunk))} chars - '{str(chunk)[:50]}{'...' if len(str(chunk)) > 50 else ''}'")
                        # Agent service now yields complete SSE lines - no need to wrap again
                        yield chunk
                    logger.info(f"✅ Router streaming completed with {chunk_count} chunks")
                except Exception as e:
                    logger.error(f"❌ Router streaming error: {e}")
                    import traceback
                    traceback.print_exc()
                    raise
            
            return StreamingResponse(
                stream_generator(),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                }
            )
        
        if use_freeform_generation:
            # NEW: Use primary generation method
            logger.info("Using primary generation method")
            
            try:
                # Generate code using primary approach with user's effective model ID
                freeform_result = agent_service.generate_code_freeform(
                    config,
                    effective_model_id,  # Use user's effective model ID (settings -> system default)
                    advanced_config,
                    request_id  # Pass request ID to agent service
                )
                
                logger.info("Primary code generation completed")
                
                # Extract code and metadata from free-form response
                code = freeform_result["final_working_code"] or freeform_result["generated_code"]
                reasoning_process = freeform_result.get("reasoning_process")
                
                # Enhanced metadata from free-form response
                freeform_metadata = {
                    "configuration_analysis": freeform_result["configuration_analysis"],
                    "testing_verification": freeform_result["testing_verification"],
                    "reasoning_process": reasoning_process,
                    "generation_method": "free_form",
                    **freeform_result["metadata"]
                }
                
            except Exception as e:
                logger.error("Primary code generation failed")
                # Fall back to legacy method
                logger.info("Falling back to legacy method")
                use_freeform_generation = False
        
        if not use_freeform_generation:
            # LEGACY: Original method (kept for fallback)
            logger.info("Using legacy code generation method")
            
            # Build prompt for legacy method
            prompt = code_service.build_generation_prompt(config)
            
            # Use user's effective model ID for legacy method too
            expert_agent = agent_service.get_agent(
                effective_model_id,  # Use user's effective model ID (settings -> system default)
                advanced_config
            )
            result = expert_agent(prompt)
            
            logger.info("Legacy code generation completed")
            
            # Extract code using legacy parsing
            # Properly extract the message content from the agent response
            if hasattr(result, 'message'):
                response_text = result.message
            else:
                response_text = str(result)
            
            code = code_service.extract_python_code(response_text)
            reasoning_process = None
            freeform_metadata = {"generation_method": "legacy"}
        
        # Final validation - should not need escape sequence fixes with proper extraction
        if code and '\\n' in code:
            logger.error("Code contains escape sequences")
            # Don't fix it - let it fail to identify the real issue
        
        # Validate generated code
        validation_result = code_service.validate_generated_code(code)
        
        # Enhanced metadata with advanced features (request_id already generated above)
        metadata = {
            "request_id": request_id,  # Add request ID for S3 storage
            "architecture": config.architecture.model_dump() if hasattr(config.architecture, 'model_dump') else config.architecture.dict(),
            "generation_timestamp": datetime.now().isoformat(),
            "validation": validation_result,
            "expertAgentModel": effective_model_id,
            "agentCount": len(config.agents),
            "toolCount": len(config.tools),
            "advanced_features": advanced_config,
            "generation_mode": config.generation_mode or "smart"
        }
        
        # Merge free-form metadata if available
        if 'freeform_metadata' in locals():
            metadata.update(freeform_metadata)
        
        # Add reasoning process if available
        if reasoning_process:
            metadata["reasoning_process"] = reasoning_process
        
        logger.info("Code generation completed successfully")
        
        return CodeGenerationResponse(
            success=True,
            code=code,
            metadata=metadata
        )
        
    except Exception as e:
        logger.error("Code generation failed")
        return CodeGenerationResponse(
            success=False,
            error="Code generation error",
            metadata={
                "error_timestamp": datetime.now().isoformat(),
                "config_summary": {
                    "agents": len(config.agents),
                    "tools": len(config.tools),
                    "workflow": config.architecture.workflowType
                }
            }
        )

@router.post("/execute-python", response_model=ExecutionResult)
async def execute_python_code(request: PythonExecutionRequest, current_user: User = Depends(get_current_user)):
    """Execute Python code using selected execution environment"""
    
    try:
        execution_env = request.execution_environment or "python_repl"
        logger.info(f"Executing Python code via {execution_env}")
        
        start_time = datetime.now()
        
        if execution_env == "code_interpreter":
            # Use custom AgentCore Code Interpreter with Strands packages
            if not agent_service or not agent_service.is_ready():
                raise HTTPException(status_code=500, detail="Expert agent not initialized")
            
            expert_agent = agent_service.get_agent()
            result_json = expert_agent.tool.code_interpreter(
                code=request.code,
                description="Testing generated Strands code"
            )
            
            # Handle result from code_interpreter tool (could be dict or JSON string)
            import json
            try:
                # Check if result is already a dictionary
                if isinstance(result_json, dict):
                    result_data = result_json
                else:
                    # Try to parse as JSON string
                    result_data = json.loads(result_json)
                
                success = not result_data.get('isError', False)
                
                if success:
                    # Extract output from successful execution - format like python_repl
                    content = result_data.get('content', [])
                    if content and isinstance(content, list) and len(content) > 0:
                        # Get the text content similar to python_repl formatting
                        content_text = content[0].get('text', str(content[0]))
                        output = content_text
                    else:
                        # Fallback to structured content
                        structured = result_data.get('structuredContent', {})
                        stdout = structured.get('stdout', '')
                        if stdout:
                            output = stdout
                        else:
                            # If no stdout, show the raw result but formatted nicely
                            output = f"Code executed successfully.\n\nRaw result:\n{json.dumps(result_data, indent=2)}"
                    error_msg = None
                else:
                    # Extract error from failed execution - format like python_repl
                    content = result_data.get('content', [])
                    if content and isinstance(content, list) and len(content) > 0:
                        error_msg = content[0].get('text', str(content[0]))
                    else:
                        # Fallback to structured content
                        structured = result_data.get('structuredContent', {})
                        stderr = structured.get('stderr', '')
                        if stderr:
                            error_msg = stderr
                        else:
                            # Show formatted error info
                            error_msg = f"Code execution failed.\n\nError details:\n{json.dumps(result_data, indent=2)}"
                    output = ""
                
            except (json.JSONDecodeError, TypeError, AttributeError) as e:
                # Fallback if parsing fails
                success = False
                output = ""
                error_msg = f"Code interpreter response parsing failed: {str(e)}"
            
        else:
            # Use existing python_repl tool
            python_agent = get_python_agent()
            result = python_agent.tool.python_repl(
                code=request.code,
                interactive=False,  # Disable interactive mode for API use
                reset_state=False   # Keep state between executions by default
            )
            
            # Parse the result (dict format from agent.tool.python_repl)
            success = result.get('status') == 'success'
            output = ""
            error_msg = None
            
            if result.get('content'):
                content_list = result['content']
                if isinstance(content_list, list) and len(content_list) > 0:
                    content_text = content_list[0].get('text', str(content_list[0]))
                    if success:
                        output = content_text
                    else:
                        error_msg = content_text
        
        execution_time = (datetime.now() - start_time).total_seconds()
        
        logger.info(f"Python code execution completed via {execution_env}")
        
        # Parse Python errors from the output/error
        python_errors = []
        if not success and error_msg:
            python_errors = _parse_python_errors_from_text(error_msg)
        
        return ExecutionResult(
            success=success,
            output=output,
            error=error_msg,
            executionTime=execution_time,
            isSimulated=False,
            pythonErrors=python_errors if python_errors else None
        )
        
    except Exception as e:
        execution_time = (datetime.now() - start_time).total_seconds() if 'start_time' in locals() else 0.0
        logger.error("Python execution failed")
        return ExecutionResult(
            success=False,
            error=f"Execution error: {str(e)}",
            executionTime=execution_time,
            isSimulated=False
        )



def _parse_python_errors_from_text(text: str) -> list[PythonError]:
    """Parse Python errors from execution output text"""
    
    errors = []
    
    # Common error patterns in agent responses
    error_patterns = [
        r'(\w*Error): (.+?)(?:\n|$)',
        r'Exception: (.+?)(?:\n|$)',
        r'Traceback.*?(\w*Error): (.+?)(?:\n|$)'
    ]
    
    for pattern in error_patterns:
        matches = re.finditer(pattern, text, re.IGNORECASE | re.DOTALL)
        for match in matches:
            if len(match.groups()) >= 2:
                error_type = match.group(1) if match.group(1) else "Error"
                error_message = match.group(2).strip()
            else:
                error_type = "Error"
                error_message = match.group(1).strip()
            
            # Extract line number if present
            line_number = None
            line_match = re.search(r'line (\d+)', error_message)
            if line_match:
                try:
                    line_number = int(line_match.group(1))
                except:
                    pass
            
            errors.append(PythonError(
                type=error_type,
                message=error_message,
                lineNumber=line_number
            ))
    
    return errors

# execute-python-with-test endpoint removed - unused by frontend