"""
Centralized Model ID Service for Strands Visual Builder

This service provides a single source of truth for model ID management,
implementing proper precedence logic and consistent CRIS formatting
throughout the entire system.
"""

import boto3
import logging
from typing import Optional, Dict, Any
from services.config_service import config_service
from services.settings_service import settings_service

logger = logging.getLogger(__name__)


class ModelIDService:
    """
    Centralized service for model ID management with proper precedence and CRIS formatting.
    
    Precedence order:
    1. Request override (highest priority)
    2. User settings (medium priority)
    3. System default (lowest priority)
    """
    
    def __init__(self):
        self._region_cache = None
        self._default_model_cache = None
    
    def get_regional_prefix(self, region: Optional[str] = None) -> str:
        """
        Get regional prefix based on AWS region for CRIS formatting.
        
        Args:
            region: AWS region name. If None, detects from current session.
            
        Returns:
            Regional prefix string (us., eu., or apac.)
        """
        if region is None:
            # Use cached region if available
            if self._region_cache:
                region = self._region_cache
            else:
                try:
                    # Try to get region from config service first
                    config = config_service.get_all_config()
                    region = config.get('REGION')
                    
                    if not region:
                        # Fallback to boto3 session
                        session = boto3.Session()
                        region = session.region_name
                    
                    # Cache the region
                    self._region_cache = region
                    
                except Exception as e:
                    logger.warning("Could not detect region, using default")
                    region = "us-east-1"
                    self._region_cache = region
        
        if not region:
            logger.warning("No region specified, defaulting to us.")
            return "us."
        
        # Map AWS regions to CRIS prefixes
        if region.startswith('us-'):
            return 'us.'
        elif region.startswith('eu-'):
            return 'eu.'
        elif region.startswith('ap-'):
            return 'apac.'
        elif region.startswith('ca-'):
            return 'us.'  # Canada uses US prefix
        elif region.startswith('sa-'):
            return 'us.'  # South America uses US prefix
        else:
            logger.warning("Unknown region, using default")
            return 'us.'
    
    def format_model_for_cris(self, model_id: str, region: Optional[str] = None) -> str:
        """
        Apply CRIS regional prefix formatting to model ID if needed.
        
        This function implements a CRIS-first strategy where we always prefer
        the CRIS format for models that support cross-region inference.
        
        Args:
            model_id: Original model ID
            region: AWS region name. If None, detects from current session.
            
        Returns:
            Model ID with appropriate regional prefix
        """
        if not model_id:
            return model_id
        
        # If model already has a regional prefix, return as-is
        if model_id.startswith(('us.', 'eu.', 'apac.')):
            return model_id
        
        # Get appropriate regional prefix
        regional_prefix = self.get_regional_prefix(region)
        
        # Apply CRIS formatting - this is now applied to ALL models
        # The strategy is to let the service handle compatibility rather than
        # maintaining hardcoded lists of which models support CRIS
        formatted_model_id = f"{regional_prefix}{model_id}"
        
        # Model ID formatted for CRIS
        return formatted_model_id
    
    def ensure_cris_format(self, model_id: str, region: Optional[str] = None) -> str:
        """
        Ensure model ID has proper CRIS formatting.
        
        This is an alias for format_model_for_cris for backward compatibility
        and clearer intent when the goal is to ensure CRIS formatting.
        
        Args:
            model_id: Model ID to format
            region: AWS region name. If None, detects from current session.
            
        Returns:
            Model ID with CRIS formatting
        """
        return self.format_model_for_cris(model_id, region)
    
    def get_system_default_model_id(self) -> str:
        """
        Get the system default model ID from configuration.
        
        Returns:
            System default model ID with CRIS formatting applied
        """
        if self._default_model_cache:
            return self._default_model_cache
        
        try:
            config = config_service.get_all_config()
            base_model_id = config.get('BEDROCK_MODEL_ID', 'anthropic.claude-3-7-sonnet-20250219-v1:0')
            aws_region = config.get('REGION', 'us-east-1')
            
            # Apply CRIS formatting to the default model ID
            formatted_model_id = self.format_model_for_cris(base_model_id, aws_region)
            
            # Cache the result
            self._default_model_cache = formatted_model_id
            
            # System default model ID configured
            return formatted_model_id
            
        except Exception as e:
            logger.warning("Could not load system default model ID, using fallback")
            
            # Ultimate fallback with CRIS formatting
            fallback_model_id = self.format_model_for_cris(
                'anthropic.claude-3-7-sonnet-20250219-v1:0', 
                'us-east-1'
            )
            
            # Cache the fallback
            self._default_model_cache = fallback_model_id
            return fallback_model_id
    
    async def get_user_model_preference(self, user_id: str) -> Optional[str]:
        """
        Get user's preferred model ID from settings.
        
        Args:
            user_id: User identifier (email)
            
        Returns:
            User's preferred model ID with CRIS formatting, or None if not set
        """
        try:
            user_settings = await settings_service.get_user_settings(user_id)
            
            if not user_settings:
                # No user settings found
                return None
            
            settings_data = user_settings.get('settings', {})
            
            # Only check expertAgentModel - runtimeSelectedModel removed
            user_model_id = settings_data.get('expertAgentModel')
            
            if user_model_id:
                # Apply CRIS formatting to user's preferred model
                formatted_model_id = self.format_model_for_cris(user_model_id)
                # User model preference found
                return formatted_model_id
            
            # No model preference found
            return None
            
        except Exception as e:
            logger.warning("Could not retrieve user model preference")
            return None
    
    async def get_effective_model_id(
        self,
        user_id: Optional[str] = None,
        region: Optional[str] = None
    ) -> str:
        """
        Get the effective model ID with simple precedence and CRIS formatting.
        
        Simple precedence:
        1. User settings (if user_id provided)
        2. System default (fallback)
        
        Args:
            user_id: User identifier for retrieving user settings
            region: AWS region name. If None, detects from current session.
            
        Returns:
            Effective model ID with CRIS formatting applied
        """
        effective_model_id = None
        source = "system_default"
        
        # 1. User settings (if available)
        if user_id:
            user_model_id = await self.get_user_model_preference(user_id)
            if user_model_id:
                effective_model_id = user_model_id
                source = "user_settings"
                # Using user model ID
        
        # 2. System default (fallback)
        if not effective_model_id:
            effective_model_id = self.get_system_default_model_id()
            source = "system_default"
            # Using system default model ID
        
        # Apply CRIS formatting
        formatted_model_id = self.format_model_for_cris(effective_model_id, region)
        
        logger.info("Model ID configured for request")
        return formatted_model_id
    
    def validate_model_id(self, model_id: str) -> bool:
        """
        Validate model ID format.
        
        Args:
            model_id: Model ID to validate
            
        Returns:
            True if model ID format is valid
        """
        if not model_id or not isinstance(model_id, str):
            return False
        
        # Basic format validation
        if len(model_id) < 5:  # Minimum reasonable length
            return False
        
        # Check for obvious invalid characters
        invalid_chars = [' ', '\n', '\t', '\r']
        if any(char in model_id for char in invalid_chars):
            return False
        
        return True
    
    # REMOVED: extract_model_id_from_config() - this was overengineered crap
    # Users don't send model IDs in requests, they only set them in settings
    
    def clear_cache(self):
        """Clear cached values (useful for testing or configuration changes)"""
        self._region_cache = None
        self._default_model_cache = None
        # Model ID service cache cleared


# Global model ID service instance
model_id_service = ModelIDService()