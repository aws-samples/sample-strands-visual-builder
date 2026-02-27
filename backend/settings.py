"""
Simple settings module that reads from SSM via config_service
This maintains compatibility with existing code while using SSM backend
"""
from services.config_service import config_service

# Get configuration from SSM with fallback defaults
try:
    config = config_service.get_all_config()
    
    # AWS Configuration
    AWS_REGION = config.get('REGION', 'us-east-1')
    
    # Bedrock Configuration  
    BEDROCK_MODEL_ID = config.get('BEDROCK_MODEL_ID', 'us.amazon.nova-pro-v1:0')
    BEDROCK_TEMPERATURE = float(config.get('BEDROCK_TEMPERATURE', '0.3'))
    
    # Agent Configuration
    AGENT_LOAD_TOOLS_FROM_DIRECTORY = config.get('AGENT_LOAD_TOOLS_FROM_DIRECTORY', 'false').lower() == 'true'
    
    # System prompt fallback (primary prompt comes from .md file)
    STRANDS_SYSTEM_PROMPT = 'You are a helpful AI assistant specialized in creating Strands agents.'
    
except Exception as e:
    # Fallback to defaults if SSM is not available
    pass  # Silent fallback to defaults
    
    AWS_REGION = 'us-east-1'
    BEDROCK_MODEL_ID = 'us.amazon.nova-pro-v1:0'
    BEDROCK_TEMPERATURE = 0.3
    AGENT_LOAD_TOOLS_FROM_DIRECTORY = False
    
    # System prompt fallback (primary prompt comes from .md file)
    STRANDS_SYSTEM_PROMPT = 'You are a helpful AI assistant specialized in creating Strands agents.'