"""
Pydantic models for API requests and responses
"""
from pydantic import BaseModel, Field
from typing import Dict, List, Any, Optional, Literal
from datetime import datetime

# Core Configuration Models
class AgentConfig(BaseModel):
    id: str
    name: str
    model: str
    systemPrompt: str
    temperature: Optional[float] = None
    maxTokens: Optional[int] = None
    testQuery: Optional[str] = None
    position: Dict[str, float]

class ToolConfig(BaseModel):
    id: str
    name: str
    type: str
    category: str
    description: Optional[str] = None
    parameters: List[Dict[str, Any]] = []
    returnType: Optional[str] = None
    returnDescription: Optional[str] = None
    position: Dict[str, float]

class ConnectionConfig(BaseModel):
    id: str
    source: str
    target: str
    type: str

class ArchitectureConfig(BaseModel):
    agentCount: int
    toolCount: int
    connectionCount: int
    workflowType: str
    complexity: str
    patterns: List[str]
    insights: List[str]

class VisualConfig(BaseModel):
    agents: List[AgentConfig]
    tools: List[ToolConfig]
    connections: List[ConnectionConfig]
    architecture: ArchitectureConfig
    metadata: Dict[str, Any]
    expertAgentModel: Optional[str] = None  # Bedrock model ID for expert agent

# Response Models
class CodeGenerationResponse(BaseModel):
    success: bool
    code: Optional[str] = None
    error: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

class HealthResponse(BaseModel):
    status: str
    expert_agent_ready: bool
    timestamp: str
    version: str

# Python Execution Models
class PythonExecutionRequest(BaseModel):
    code: str
    testQuery: Optional[str] = None
    timeout: Optional[int] = 30
    execution_environment: Optional[Literal["python_repl", "code_interpreter"]] = "python_repl"

class PythonError(BaseModel):
    type: str
    message: str
    lineNumber: Optional[int] = None
    columnNumber: Optional[int] = None
    traceback: Optional[str] = None

class ExecutionResult(BaseModel):
    success: bool
    output: Optional[str] = None
    error: Optional[str] = None
    executionTime: float
    isSimulated: bool = False
    pythonErrors: Optional[List[PythonError]] = None

# Authentication Models
class User(BaseModel):
    user_id: str
    email: str
    username: str
    is_authenticated: bool = True

# Project Models
class ProjectData(BaseModel):
    projectName: str
    canvasData: Dict[str, Any]

class ProjectResponse(BaseModel):
    projectId: str
    projectName: str
    created: str
    modified: str
    canvasData: Dict[str, Any]

class ProjectListItem(BaseModel):
    projectId: str
    projectName: str
    created: str
    modified: str

class ProjectListResponse(BaseModel):
    projects: List[ProjectListItem]

# Structured Output Models for Bedrock (kept for compatibility)
class CodeSection(BaseModel):
    """Structured code section for reliable extraction"""
    title: str = Field(description="Section title (e.g., 'Generated Code', 'Testing Results')")
    content: str = Field(description="The actual content of the section")
    code_type: Optional[Literal["python", "markdown", "text"]] = Field(default="python", description="Type of content")

class StructuredCodeResponse(BaseModel):
    """Structured response format for code generation (legacy compatibility)"""
    configuration_analysis: str = Field(description="Analysis of the visual configuration")
    generated_code: str = Field(description="The complete Python code implementation")
    testing_verification: str = Field(description="Results from testing the generated code")
    final_working_code: str = Field(description="Final verified working code")
    reasoning_process: Optional[str] = Field(default=None, description="Model's reasoning process (if reasoning enabled)")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata about the generation")

class BedrockAdvancedConfig(BaseModel):
    """Advanced Bedrock configuration options"""
    model_config = {"protected_namespaces": ()}  # Allow model_ fields
    
    model_id: str = Field(description="Bedrock model ID")
    # Free-form generation is now the default approach
    enable_reasoning: bool = Field(default=False, description="Enable reasoning token support")
    enable_prompt_caching: bool = Field(default=False, description="Enable prompt caching for cost optimization")
    runtime_model_switching: bool = Field(default=False, description="Allow runtime model switching")
    temperature: Optional[float] = Field(default=0.3, ge=0.0, le=1.0)
    max_tokens: Optional[int] = Field(default=4000, ge=1, le=8192)
    top_p: Optional[float] = Field(default=0.9, ge=0.0, le=1.0)

# Enhanced Visual Config with Advanced Features
class EnhancedVisualConfig(VisualConfig):
    """Enhanced visual config with advanced Bedrock features"""
    bedrock_config: Optional[BedrockAdvancedConfig] = Field(default=None, description="Advanced Bedrock configuration")
    generation_mode: Optional[Literal["freeform", "structured", "legacy"]] = Field(default="freeform", description="Code generation mode")
    stream: Optional[bool] = Field(default=True, description="Enable streaming response")