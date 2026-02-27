"""
Configuration API router - provides frontend configuration from SSM parameters
"""

from fastapi import APIRouter, HTTPException
from typing import Dict, Any
import logging
from services.config_service import config_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["configuration"])

@router.get("/config")
async def get_frontend_config() -> Dict[str, Any]:
    """
    Get configuration needed by the frontend.
    
    This endpoint provides all the configuration that was previously
    stored in .env files, now loaded dynamically from SSM parameters
    based on the current AWS account.
    
    Returns:
        Dict containing frontend configuration including Cognito settings
    """
    try:
        logger.info("Frontend requesting configuration")
        
        # Get configuration from SSM
        frontend_config = config_service.get_frontend_config()
        
        logger.info("Returning configuration")
        
        # Return only frontend-required configuration (remove sensitive data)
        safe_config = {
            "aws_region": frontend_config.get('aws_region'),
            "cognito_user_pool_id": frontend_config.get('cognito_user_pool_id'),
            "cognito_client_id": frontend_config.get('cognito_client_id'),
            "api_base_url": frontend_config.get('api_base_url')
        }
        
        return {
            "success": True,
            "config": safe_config,
            "source": "configuration"
        }
        
    except Exception as e:
        logger.error("Failed to get configuration")
        raise HTTPException(
            status_code=500,
            detail="Configuration service error"
        )

@router.get("/config/health")
async def get_config_health() -> Dict[str, Any]:
    """
    Health check for configuration service.
    
    Returns detailed information about configuration status,
    including which parameters are loaded and from which account.
    """
    try:
        health_status = config_service.health_check()
        
        if health_status['status'] == 'error':
            raise HTTPException(
                status_code=503,
                detail=health_status
            )
        
        return health_status
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Configuration health check failed")
        raise HTTPException(
            status_code=500,
            detail="Health check error"
        )