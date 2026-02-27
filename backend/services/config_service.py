"""
Configuration service that reads from AWS SSM Parameters instead of .env files.
Automatically detects the current AWS account and loads the appropriate configuration.
"""

import boto3
import logging
from typing import Dict, Optional
from functools import lru_cache

logger = logging.getLogger(__name__)

class ConfigService:
    """
    Centralized configuration service using AWS SSM Parameters.
    
    Configuration is stored in SSM with the pattern:
    /strands-visual-builder/{account-id}/{service}/{parameter}
    
    This eliminates the need for .env files and automatically
    works with any AWS account based on the current credentials.
    """
    
    def __init__(self):
        self._ssm_client = None
        self._sts_client = None
        self._account_id = None
        self._config_cache = {}
        
    @property
    def ssm_client(self):
        """Lazy initialization of SSM client"""
        if self._ssm_client is None:
            # Use boto3's default region resolution (from AWS config, env vars, etc.)
            self._ssm_client = boto3.client('ssm')
        return self._ssm_client
    
    @property
    def sts_client(self):
        """Lazy initialization of STS client"""
        if self._sts_client is None:
            # Use boto3's default region resolution (from AWS config, env vars, etc.)
            self._sts_client = boto3.client('sts')
        return self._sts_client
    
    @property
    def account_id(self) -> str:
        """Get current AWS account ID"""
        if self._account_id is None:
            try:
                response = self.sts_client.get_caller_identity()
                self._account_id = response['Account']
                logger.info("Detected AWS Account ID")
            except Exception as e:
                logger.error("Failed to get AWS account ID")
                raise RuntimeError("Unable to determine AWS account ID. Check AWS credentials.")
        return self._account_id
    
    @property
    def parameter_base_path(self) -> str:
        """Base path for all SSM parameters"""
        return f"/strands-visual-builder/{self.account_id}"
    
    @lru_cache(maxsize=1)
    def get_all_config(self) -> Dict[str, str]:
        """
        Get all configuration parameters from SSM.
        Results are cached for performance.
        """
        try:
            logger.info("Loading configuration from SSM")
            
            # Use paginator to handle large numbers of parameters
            paginator = self.ssm_client.get_paginator('get_parameters_by_path')
            page_iterator = paginator.paginate(
                Path=self.parameter_base_path,
                Recursive=True,
                WithDecryption=True  # Support SecureString parameters
            )
            
            config = {}
            all_parameters = []
            for page in page_iterator:
                all_parameters.extend(page['Parameters'])
            
            for param in all_parameters:
                # Convert parameter name to config key
                # /strands-visual-builder/123456789012/cognito/user-pool-id -> cognito_user_pool_id
                key_parts = param['Name'].replace(self.parameter_base_path + '/', '').split('/')
                config_key = '_'.join(key_parts).replace('-', '_').upper()
                config[config_key] = param['Value']
                
                # Also store with original path for direct access
                config[param['Name']] = param['Value']
            
            logger.info("Configuration loaded successfully")
            
            return config
            
        except Exception as e:
            logger.error("Failed to load configuration from SSM")
            raise RuntimeError("Configuration loading failed")
    
    def get_parameter(self, key: str) -> Optional[str]:
        """Get a specific configuration parameter"""
        config = self.get_all_config()
        return config.get(key)
    
    def get_cognito_config(self) -> Dict[str, str]:
        """Get Cognito-specific configuration"""
        config = self.get_all_config()
        return {
            'user_pool_id': config.get('COGNITO_USER_POOL_ID'),
            'client_id': config.get('COGNITO_CLIENT_ID'),
            'region': config.get('REGION'),
        }
    
    def get_dynamodb_config(self) -> Dict[str, str]:
        """Get DynamoDB-specific configuration"""
        config = self.get_all_config()
        return {
            'table_name': config.get('DYNAMODB_TABLE_NAME'),
            'region': config.get('REGION'),
        }
    
    def get_backend_config(self) -> Dict[str, str]:
        """Get backend service configuration"""
        config = self.get_all_config()
        return {
            'role_arn': config.get('IAM_BACKEND_ROLE_ARN'),
            'region': config.get('REGION'),
            'account_id': self.account_id,
        }
    
    def get_frontend_config(self) -> Dict[str, str]:
        """
        Get configuration needed by the frontend.
        This will be exposed via the /api/config endpoint.
        """
        config = self.get_all_config()
        return {
            'aws_region': config.get('REGION'),
            'cognito_user_pool_id': config.get('COGNITO_USER_POOL_ID'),
            'cognito_client_id': config.get('COGNITO_CLIENT_ID'),
            'api_base_url': config.get('FRONTEND_API_BASE_URL', 'http://localhost:8080'),
            'node_env': config.get('FRONTEND_NODE_ENV', 'development'),
            'debug': config.get('FRONTEND_DEBUG', 'false'),
            'account_id': self.account_id,
        }
    
    def get_strands_config(self) -> Dict[str, str]:
        """Get Strands tools configuration"""
        config = self.get_all_config()
        return {
            'tool_console_mode': config.get('STRANDS_TOOL_CONSOLE_MODE', 'disabled'),
            'bypass_tool_consent': config.get('STRANDS_BYPASS_TOOL_CONSENT', 'true'),
            'python_repl_interactive': config.get('STRANDS_PYTHON_REPL_INTERACTIVE', 'false'),
        }
    
    def get_app_config(self) -> Dict[str, str]:
        """Get application configuration"""
        config = self.get_all_config()
        return {
            'cors_origins': config.get('APP_CORS_ORIGINS', 'http://localhost:5173,http://localhost:3000,http://localhost:7001'),
            'node_env': config.get('APP_NODE_ENV', 'development'),
            'debug': config.get('APP_DEBUG', 'false').lower() == 'true',
            'jwt_expiration': int(config.get('APP_JWT_EXPIRATION', '3600')),
        }
    
    def get_user_settings_config(self) -> Dict[str, str]:
        """Get user settings DynamoDB configuration"""
        config = self.get_all_config()
        return {
            'table_name': config.get('DYNAMODB_USER_SETTINGS_TABLE_NAME'),
            'region': config.get('REGION'),
        }
    
    def health_check(self) -> Dict[str, any]:
        """
        Health check that verifies configuration is accessible.
        Returns status and configuration summary.
        """
        try:
            config = self.get_all_config()
            
            # Check required parameters (Strands params are optional with defaults)
            required_params = [
                'COGNITO_USER_POOL_ID',
                'COGNITO_CLIENT_ID', 
                'DYNAMODB_TABLE_NAME',
                'REGION',
                'APP_CORS_ORIGINS',
                'APP_NODE_ENV',
                'APP_DEBUG',
                'APP_JWT_EXPIRATION',
                'FRONTEND_API_BASE_URL',
                'FRONTEND_NODE_ENV',
                'FRONTEND_DEBUG'
            ]
            
            missing_params = [param for param in required_params if not config.get(param)]
            
            if missing_params:
                return {
                    'status': 'error',
                    'message': f'Missing required parameters: {missing_params}',
                    'account_id': self.account_id,
                    'parameter_path': self.parameter_base_path,
                }
            
            return {
                'status': 'healthy',
                'message': 'Configuration loaded successfully from SSM',
                'account_id': self.account_id,
                'parameter_path': self.parameter_base_path,
                'parameter_count': len([k for k in config.keys() if not k.startswith('/')]),
                'cognito_user_pool_id': config.get('COGNITO_USER_POOL_ID'),
                'dynamodb_table_name': config.get('DYNAMODB_TABLE_NAME'),
                'region': config.get('REGION'),
            }
            
        except Exception as e:
            return {
                'status': 'error',
                'message': str(e),
                'account_id': getattr(self, '_account_id', 'unknown'),
            }

# Global configuration service instance
config_service = ConfigService()

# Convenience functions for backward compatibility
def get_config() -> Dict[str, str]:
    """Get all configuration as a dictionary"""
    return config_service.get_all_config()

def get_parameter(key: str) -> Optional[str]:
    """Get a specific parameter value"""
    return config_service.get_parameter(key)