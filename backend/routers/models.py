"""
Models router for fetching available Bedrock models
"""
from fastapi import APIRouter, HTTPException
import boto3
import logging
from typing import Dict, Any
from services.config_service import config_service
from services.model_id_service import model_id_service

logger = logging.getLogger(__name__)
router = APIRouter(tags=["models"])

def _supports_structured_output(model_id: str) -> bool:
    """Check if model supports structured output - Always True since Strands handles compatibility"""
    # Strands SDK handles structured output compatibility internally
    # Always return True to let Strands manage model-specific behavior
    return True

def _supports_reasoning(model_id: str) -> bool:
    """Check if model supports reasoning tokens"""
    # Pattern-based detection for reasoning support
    # Currently only Claude 3.7 and 3.5 Sonnet v2 models support reasoning
    reasoning_patterns = [
        'claude-3-7-sonnet',
        'claude-3-5-sonnet-20241022-v2'
    ]
    
    return any(pattern in model_id for pattern in reasoning_patterns)

def _supports_prompt_caching(model_id: str) -> bool:
    """Check if model supports prompt caching"""
    # Pattern-based detection for prompt caching support
    # Currently Claude 3.x models support prompt caching
    caching_patterns = [
        'claude-3-7-sonnet',
        'claude-3-5-sonnet',
        'claude-3-5-haiku'
    ]
    
    return any(pattern in model_id for pattern in caching_patterns)

@router.get("/available-models")
async def get_available_models():
    """Get list of available Bedrock models"""
    
    try:
        # Initialize Bedrock client
        config = config_service.get_all_config()
        bedrock_client = boto3.client(
            'bedrock',
            region_name=config.get('REGION', 'us-east-1')
        )
        
        logger.info("Fetching available models")
        
        # Get list of foundation models - filter by ON_DEMAND inference type to get standard model IDs
        response = bedrock_client.list_foundation_models(
            byInferenceType='ON_DEMAND'
        )
        
        model_summaries = response.get('modelSummaries', [])
        
        models = []
        for model in model_summaries:
            # Filter for text generation models that support any inference type
            if (model.get('outputModalities') and 
                'TEXT' in model.get('outputModalities', []) and
                model.get('inferenceTypesSupported')):
                
                # Apply CRIS-First Regional Prefix Strategy
                original_model_id = model.get('modelId')
                model_id = original_model_id
                
                # Apply CRIS formatting to ALL models dynamically using centralized service
                if model_id:
                    current_region = config.get('REGION', 'us-east-1')
                    model_id = model_id_service.format_model_for_cris(model_id, current_region)
                
                model_info = {
                    'id': model_id,
                    'originalId': original_model_id,  # Keep original for reference
                    'name': model.get('modelName'),
                    'provider': model.get('providerName'),
                    'description': f"{model.get('modelName')} by {model.get('providerName')}",
                    'inputModalities': model.get('inputModalities', []),
                    'outputModalities': model.get('outputModalities', []),
                    'responseStreamingSupported': model.get('responseStreamingSupported', False),
                    'customizationsSupported': model.get('customizationsSupported', []),
                    'inferenceTypesSupported': model.get('inferenceTypesSupported', []),
                    'supportsStructuredOutput': _supports_structured_output(model_id),
                    'supportsReasoning': _supports_reasoning(model_id),
                    'supportsPromptCaching': _supports_prompt_caching(model_id)
                }
                
                # Add category based on provider and model characteristics
                provider = model.get('providerName', '').lower()
                model_name = model.get('modelName', '').lower()
                
                if 'claude' in model_name:
                    if '4' in model_name or 'opus 4' in model_name or 'sonnet 4' in model_name:
                        model_info['category'] = 'Latest'
                        model_info['recommended'] = True
                    elif '3.7' in model_name or '3-7' in model_name:
                        model_info['category'] = 'Latest'
                        model_info['recommended'] = True
                    elif '3-5' in model_name or '3.5' in model_name:
                        model_info['category'] = 'Latest'
                        if 'v2' in model_name:
                            model_info['recommended'] = True
                    elif '3' in model_name and 'opus' in model_name:
                        model_info['category'] = 'Premium'
                    elif '3' in model_name:
                        model_info['category'] = 'Advanced'
                    else:
                        model_info['category'] = 'Standard'
                elif 'nova' in model_name:
                    model_info['category'] = 'Latest'
                    if 'pro' in model_name:
                        model_info['recommended'] = True
                elif 'llama' in model_name:
                    if '90b' in model_name or '70b' in model_name:
                        model_info['category'] = 'Advanced'
                    elif '11b' in model_name or '8b' in model_name:
                        model_info['category'] = 'Standard'
                    else:
                        model_info['category'] = 'Fast'
                elif 'mistral' in model_name:
                    if 'large' in model_name:
                        model_info['category'] = 'Advanced'
                    else:
                        model_info['category'] = 'Standard'
                elif 'command' in model_name:
                    if 'plus' in model_name or '+' in model_name:
                        model_info['category'] = 'Advanced'
                    else:
                        model_info['category'] = 'Standard'
                else:
                    model_info['category'] = 'Standard'
                
                models.append(model_info)
        
        # Sort models by category and name
        category_order = ['Latest', 'Premium', 'Advanced', 'Standard', 'Fast']
        models.sort(key=lambda x: (
            category_order.index(x.get('category', 'Standard')),
            x.get('provider', ''),
            x.get('name', '')
        ))
        
        logger.info("Models fetched successfully")
        
        return {
            "success": True,
            "models": models,
            "total": len(models)
        }
        
    except Exception as e:
        logger.error("Failed to fetch models")
        return {
            "success": False,
            "error": "Failed to fetch models",
            "models": [],
            "total": 0
        }

# model-info endpoint removed - unused by frontend