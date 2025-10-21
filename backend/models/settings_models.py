"""
Pydantic models for user settings
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class UserSettingsModel(BaseModel):
    """User settings model with validation and default values"""
    
    # Timeout settings (in milliseconds)
    codeGenerationTimeout: int = Field(
        default=600000,
        ge=5000,
        le=600000,
        description="Code generation timeout in milliseconds (5s - 10min)"
    )
    pythonExecutionTimeout: int = Field(
        default=600000,
        ge=5000,
        le=600000,
        description="Python execution timeout in milliseconds (5s - 10min)"
    )
    backendRequestTimeout: int = Field(
        default=600000,
        ge=5000,
        le=600000,
        description="Backend request timeout in milliseconds (5s - 10min)"
    )
    
    # Model configuration
    expertAgentModel: str = Field(
        default="us.anthropic.claude-3-7-sonnet-20250219-v1:0",
        description="Bedrock model ID for expert agent"
    )
    
    # Advanced features
    enableReasoning: bool = Field(
        default=True,
        description="Enable reasoning token support"
    )
    enablePromptCaching: bool = Field(
        default=False,
        description="Enable prompt caching for cost optimization"
    )
    # REMOVED: runtimeModelConfiguration and runtimeSelectedModel
    # These are redundant now that expert agents automatically use user's preferred model

class UserSettingsResponse(BaseModel):
    """Response model for user settings"""
    settings: UserSettingsModel
    source: str = Field(description="Source of settings: 'dynamodb', 'localStorage', or 'default'")
    lastUpdated: Optional[datetime] = Field(default=None, description="Last update timestamp")

class UserSettingsRequest(BaseModel):
    """Request model for saving user settings"""
    settings: UserSettingsModel