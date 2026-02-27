"""
CRIS-First Regional Prefix Strategy for Model ID Management

This module provides centralized functions for handling model IDs with 
Cross-Region Inference Service (CRIS) regional prefixes. It eliminates 
hardcoded model lists and provides dynamic CRIS formatting for all models.
"""

import boto3
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def get_regional_prefix(region: Optional[str] = None) -> str:
    """
    Get regional prefix based on AWS region for CRIS formatting.
    
    Args:
        region: AWS region name. If None, detects from current session.
        
    Returns:
        Regional prefix string (us., eu., or apac.)
    """
    if region is None:
        try:
            # Get region from current session
            session = boto3.Session()
            region = session.region_name
        except Exception as e:
            logger.warning("Could not detect region, using default")
            region = "us-east-1"
    
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


def format_model_for_cris(model_id: str, region: Optional[str] = None) -> str:
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
    regional_prefix = get_regional_prefix(region)
    
    # Apply CRIS formatting - this is now applied to ALL models
    # The strategy is to let the service handle compatibility rather than
    # maintaining hardcoded lists of which models support CRIS
    formatted_model_id = f"{regional_prefix}{model_id}"
    
    # Model ID formatted for CRIS
    return formatted_model_id


def ensure_cris_format(model_id: str, region: Optional[str] = None) -> str:
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
    return format_model_for_cris(model_id, region)


def get_effective_model_id(
    request_model_id: Optional[str] = None,
    user_model_id: Optional[str] = None,
    default_model_id: Optional[str] = None,
    region: Optional[str] = None
) -> str:
    """
    Get the effective model ID with proper precedence and CRIS formatting.
    
    Precedence order:
    1. Request override (highest priority)
    2. User settings (medium priority)  
    3. System default (lowest priority)
    
    Args:
        request_model_id: Model ID from request override
        user_model_id: Model ID from user settings
        default_model_id: System default model ID
        region: AWS region name. If None, detects from current session.
        
    Returns:
        Effective model ID with CRIS formatting applied
    """
    # Determine which model ID to use based on precedence
    effective_model_id = None
    
    if request_model_id:
        effective_model_id = request_model_id
        # Using request model ID
    elif user_model_id:
        effective_model_id = user_model_id
        # Using user model ID
    elif default_model_id:
        effective_model_id = default_model_id
        # Using default model ID
    else:
        # Ultimate fallback
        effective_model_id = "anthropic.claude-3-5-sonnet-20241022-v2:0"
        logger.warning("No model ID specified, using fallback")
    
    # Apply CRIS formatting
    formatted_model_id = format_model_for_cris(effective_model_id, region)
    
    logger.info("Model ID configured for request")
    return formatted_model_id


def validate_model_id(model_id: str) -> bool:
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