"""
Settings router for user settings management
"""
from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any
import logging

from models.settings_models import UserSettingsModel, UserSettingsResponse, UserSettingsRequest
from services.settings_service import settings_service
from services.auth_service import get_current_user
from models.api_models import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/settings", tags=["settings"])

@router.get("/user-settings", response_model=UserSettingsResponse)
async def get_user_settings(current_user: User = Depends(get_current_user)):
    """
    Get user settings from DynamoDB.
    Returns default settings if no user settings exist.
    """
    try:
        logger.info("Getting user settings")
        
        # Try to get settings from DynamoDB
        user_settings_data = await settings_service.get_user_settings(current_user.email)
        
        if user_settings_data:
            # User has settings in DynamoDB
            settings = UserSettingsModel(**user_settings_data['settings'])
            return UserSettingsResponse(
                settings=settings,
                source="dynamodb",
                lastUpdated=user_settings_data.get('updated_at')
            )
        else:
            # No settings found, return defaults
            default_settings = UserSettingsModel()
            return UserSettingsResponse(
                settings=default_settings,
                source="default",
                lastUpdated=None
            )
            
    except Exception as e:
        logger.error("Error getting user settings")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve user settings"
        )

@router.post("/user-settings", response_model=UserSettingsResponse)
async def save_user_settings(
    request: UserSettingsRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Save user settings to DynamoDB.
    Creates new settings or updates existing ones.
    """
    try:
        logger.info("Saving user settings")
        
        # Validate settings
        settings = request.settings
        
        # Save to DynamoDB
        success = await settings_service.save_user_settings(current_user.email, settings)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to save user settings"
            )
        
        # Return the saved settings
        return UserSettingsResponse(
            settings=settings,
            source="dynamodb",
            lastUpdated=None  # Will be set by the service
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error saving user settings")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save user settings"
        )

@router.delete("/user-settings")
async def delete_user_settings(current_user: User = Depends(get_current_user)):
    """
    Delete user settings from DynamoDB.
    This will cause the user to fall back to default settings.
    """
    try:
        logger.info("Deleting user settings")
        
        success = await settings_service.delete_user_settings(current_user.email)
        
        return {
            "success": success,
            "message": "User settings deleted successfully" if success else "No settings found to delete"
        }
        
    except Exception as e:
        logger.error("Error deleting user settings")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete user settings"
        )

@router.get("/health")
async def settings_health_check():
    """Health check for the settings service"""
    try:
        health_status = await settings_service.health_check()
        
        if health_status['status'] == 'healthy':
            return health_status
        else:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=health_status
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Settings health check failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Settings service health check failed"
        )