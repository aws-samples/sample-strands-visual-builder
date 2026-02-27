"""
Strands Visual Builder Expert Agent Service
FastAPI service that hosts a Strands expert agent for code generation
"""
import logging
import os
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Import configuration service
from services.config_service import config_service

# Set environment variables from SSM parameters BEFORE importing Strands tools
try:
    strands_config = config_service.get_strands_config()
    os.environ['BYPASS_TOOL_CONSENT'] = strands_config['bypass_tool_consent']
    os.environ['STRANDS_TOOL_CONSOLE_MODE'] = strands_config['tool_console_mode']
    os.environ['PYTHON_REPL_INTERACTIVE'] = strands_config['python_repl_interactive']
    logger = logging.getLogger(__name__)
except Exception as e:
    # Fallback to defaults if SSM is not available
    logger = logging.getLogger(__name__)
    # Using default configuration
    os.environ.setdefault('BYPASS_TOOL_CONSENT', 'true')
    os.environ.setdefault('STRANDS_TOOL_CONSOLE_MODE', 'disabled')
    os.environ.setdefault('PYTHON_REPL_INTERACTIVE', 'false')

# Import services
from services.auth_service import AuthService
from services.db_service import DynamoDBService
from services.agent_service import AgentService

# Import routers
from routers.auth import router as auth_router
from routers.projects import router as projects_router
from routers.code import router as code_router
from routers.tools import router as tools_router
from routers.models import router as models_router
from routers.config import router as config_router
from routers.settings import router as settings_router
from routers.agentcore import router as agentcore_router
from routers.s3_code import router as s3_code_router

# Import models for health endpoint
from models.api_models import HealthResponse

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Suppress Pydantic model field warnings
import warnings
warnings.filterwarnings("ignore", message="Field .* has conflict with protected namespace .*", category=UserWarning)

# Create FastAPI app
app = FastAPI(
    title="Strands Visual Builder Expert Agent API",
    description="Expert agent service for generating Strands code from visual configurations",
    version="1.0.0"
)

# Add CORS middleware - configuration loaded from SSM
try:
    app_config = config_service.get_app_config()
    cors_origins = app_config['cors_origins'].split(',')
except Exception as e:
    # Using default CORS configuration
    cors_origins = ["http://localhost:5173", "http://localhost:3000", "http://localhost:7001"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
auth_service = AuthService()
db_service = DynamoDBService()
agent_service = AgentService()

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    
    # Initialize AWS services
    try:
        # Check configuration health
        config_health = config_service.health_check()
        if config_health['status'] == 'error':
            logger.error("Configuration error detected")
        
        await auth_service.initialize()
        await db_service.initialize()
            
    except Exception as e:
        logger.error("Service initialization failed")
    
    # Initialize Strands Expert Agent
    try:
        await agent_service.initialize()
        
        # Update router services with initialized instances
        import routers.code as code_router_module
        import routers.projects as projects_router_module  
        import routers.auth as auth_router_module
        
        code_router_module.agent_service = agent_service
        projects_router_module.db_service = db_service
        auth_router_module.auth_service = auth_service
        
    except Exception as e:
        logger.error("Agent initialization failed")

# Include routers
app.include_router(config_router)  # Add config router first
app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(code_router)
app.include_router(tools_router)
app.include_router(models_router)
app.include_router(settings_router)
app.include_router(agentcore_router)
app.include_router(s3_code_router)

# Health endpoint for startup verification
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="healthy" if agent_service.is_ready() else "degraded",
        expert_agent_ready=agent_service.is_ready(),
        timestamp=datetime.now().isoformat(),
        version="1.0.0"
    )

# Simple ping endpoint for App Runner health checks
@app.get("/ping")
async def ping():
    """Simple ping endpoint for App Runner health checks"""
    return {"status": "ok", "timestamp": datetime.now().isoformat()}

if __name__ == "__main__":
    import uvicorn
    
    # Development defaults (no .env file needed)
    # nosec B104 - Binding to 0.0.0.0 is required for ECS Fargate containers behind ALB
    # Security is enforced by AWS Security Groups, not bind address
    uvicorn.run(
        app, 
        host="0.0.0.0",  # nosec B104
        port=8080, 
        log_level="info"
    )