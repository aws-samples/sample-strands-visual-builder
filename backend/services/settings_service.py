"""
Settings service for managing user settings in DynamoDB
"""
import boto3
import logging
from typing import Optional, Dict, Any
from datetime import datetime, timezone
from botocore.exceptions import ClientError

from models.settings_models import UserSettingsModel
from services.config_service import config_service

logger = logging.getLogger(__name__)

class SettingsService:
    """Service for managing user settings in DynamoDB"""
    
    def __init__(self):
        self.dynamodb = None
        self.table = None
        self._initialized = False
    
    async def initialize(self):
        """Initialize DynamoDB client and table"""
        if self._initialized:
            return
            
        try:
            # Get configuration from SSM
            settings_config = config_service.get_user_settings_config()
            table_name = settings_config['table_name']
            region = settings_config['region']
            
            if not table_name:
                raise ValueError("User settings table name not found in configuration")
            
            # Initialize DynamoDB client
            self.dynamodb = boto3.resource('dynamodb', region_name=region)
            self.table = self.dynamodb.Table(table_name)
            
            logger.info("Settings service initialized")
            self._initialized = True
            
        except Exception as e:
            logger.error("Failed to initialize settings service")
            raise RuntimeError("Settings service initialization failed")
    
    async def get_user_settings(self, email: str) -> Optional[Dict[str, Any]]:
        """
        Get user settings from DynamoDB by email.
        Returns None if no settings exist for the user.
        """
        await self.initialize()
        
        try:
            response = self.table.get_item(Key={'email': email})
            
            if 'Item' not in response:
                logger.info("No settings found for user")
                return None
            
            item = response['Item']
            logger.info("Retrieved user settings")
            
            return {
                'settings': item.get('settings', {}),
                'created_at': item.get('created_at'),
                'updated_at': item.get('updated_at'),
                'version': item.get('version', 1)
            }
            
        except ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == 'ResourceNotFoundException':
                logger.warning("User settings table not found")
                return None
            else:
                logger.error("DynamoDB error getting settings")
                raise RuntimeError("Failed to retrieve user settings")
        except Exception as e:
            logger.error("Unexpected error getting settings")
            raise RuntimeError("Failed to retrieve user settings")
    
    async def save_user_settings(self, email: str, settings: UserSettingsModel) -> bool:
        """
        Save or update user settings in DynamoDB.
        Returns True if successful, raises exception on failure.
        """
        await self.initialize()
        
        try:
            now = datetime.now(timezone.utc).isoformat()
            
            # Check if item exists to determine if this is create or update
            existing_item = await self.get_user_settings(email)
            
            if existing_item:
                # Update existing item
                item = {
                    'email': email,
                    'settings': settings.model_dump(),
                    'created_at': existing_item['created_at'],
                    'updated_at': now,
                    'version': existing_item.get('version', 1) + 1
                }
                logger.info("Updating user settings")
            else:
                # Create new item
                item = {
                    'email': email,
                    'settings': settings.model_dump(),
                    'created_at': now,
                    'updated_at': now,
                    'version': 1
                }
                logger.info("Creating new user settings")
            
            # Save to DynamoDB
            self.table.put_item(Item=item)
            
            logger.info("Successfully saved user settings")
            return True
            
        except ClientError as e:
            logger.error("DynamoDB error saving settings")
            raise RuntimeError("Failed to save user settings")
        except Exception as e:
            logger.error("Unexpected error saving settings")
            raise RuntimeError("Failed to save user settings")
    
    async def delete_user_settings(self, email: str) -> bool:
        """
        Delete user settings from DynamoDB.
        Returns True if successful, False if item doesn't exist.
        """
        await self.initialize()
        
        try:
            response = self.table.delete_item(
                Key={'email': email},
                ReturnValues='ALL_OLD'
            )
            
            if 'Attributes' in response:
                logger.info("Deleted user settings")
                return True
            else:
                logger.info("No settings to delete")
                return False
                
        except ClientError as e:
            logger.error("DynamoDB error deleting settings")
            raise RuntimeError("Failed to delete user settings")
        except Exception as e:
            logger.error("Unexpected error deleting settings")
            raise RuntimeError("Failed to delete user settings")
    
    async def health_check(self) -> Dict[str, Any]:
        """Health check for the settings service"""
        try:
            await self.initialize()
            
            # Try to describe the table to verify connectivity
            table_description = self.table.meta.client.describe_table(
                TableName=self.table.table_name
            )
            
            return {
                'status': 'healthy',
                'table_name': self.table.table_name,
                'table_status': table_description['Table']['TableStatus'],
                'item_count': table_description['Table'].get('ItemCount', 'unknown'),
                'initialized': self._initialized
            }
            
        except Exception as e:
            return {
                'status': 'error',
                'message': str(e),
                'initialized': self._initialized
            }

# Global settings service instance
settings_service = SettingsService()