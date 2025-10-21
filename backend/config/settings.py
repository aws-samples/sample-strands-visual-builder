"""
Configuration settings for the Strands Visual Builder backend
"""
import os
from typing import List
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Set Strands tool console mode BEFORE importing strands_tools
os.environ['STRANDS_TOOL_CONSOLE_MODE'] = os.getenv('STRANDS_TOOL_CONSOLE_MODE', 'enabled')

class Settings:
    """Application settings"""
    
    # Server Configuration
    # Binding to 0.0.0.0 is required for ECS Fargate containers behind ALB
    # Security is enforced by AWS Security Groups, not bind address
    SERVICE_HOST: str = os.getenv("SERVICE_HOST", "0.0.0.0")  # nosec B104
    SERVICE_PORT: int = int(os.getenv("SERVICE_PORT", "8080"))
    SERVICE_LOG_LEVEL: str = os.getenv("SERVICE_LOG_LEVEL", "info")
    
    # CORS Configuration
    CORS_ORIGINS: List[str] = os.getenv(
        "CORS_ORIGINS", 
        "http://localhost:3000,http://localhost:5173,http://localhost:7001"
    ).split(",")
    
    # AWS Configuration
    AWS_REGION: str = os.getenv("AWS_REGION", "us-west-2")
    COGNITO_USER_POOL_ID: str = os.getenv("COGNITO_USER_POOL_ID", "")
    COGNITO_USER_POOL_CLIENT_ID: str = os.getenv("COGNITO_USER_POOL_CLIENT_ID", "")
    DYNAMODB_TABLE_NAME: str = os.getenv("DYNAMODB_TABLE_NAME", "")
    
    # Bedrock Configuration
    BEDROCK_MODEL_ID: str = os.getenv("BEDROCK_MODEL_ID", "us.anthropic.claude-3-7-sonnet-20250219-v1:0")
    BEDROCK_TEMPERATURE: float = float(os.getenv("BEDROCK_TEMPERATURE", "0.3"))
    BEDROCK_MAX_TOKENS: int = int(os.getenv("BEDROCK_MAX_TOKENS", "0"))  # 0 = no limit, use model's full capacity
    
    # Agent Configuration
    AGENT_LOAD_TOOLS_FROM_DIRECTORY: bool = os.getenv("AGENT_LOAD_TOOLS_FROM_DIRECTORY", "true").lower() == "true"
    STRANDS_SYSTEM_PROMPT: str = os.getenv("STRANDS_SYSTEM_PROMPT", "You are an expert at generating Strands agent code from visual configurations.")
    
    # Debug Configuration
    DEBUG: bool = os.getenv('DEBUG', 'false').lower() == 'true'

# Global settings instance
settings = Settings()