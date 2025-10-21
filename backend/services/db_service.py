"""
DynamoDB service for project storage
"""
import boto3
import logging
from typing import List, Optional, Any, Dict
from datetime import datetime
from decimal import Decimal
from botocore.exceptions import ClientError
from fastapi import HTTPException, status
from services.config_service import config_service
from models.api_models import ProjectData, ProjectResponse, ProjectListItem

logger = logging.getLogger(__name__)

class DynamoDBService:
    """Service for handling DynamoDB operations"""
    
    def __init__(self):
        self.dynamodb = None
        self.table = None
        
        # Load configuration from SSM
        db_config = config_service.get_dynamodb_config()
        self.table_name = db_config['table_name']
        self.region = db_config['region']
    
    def _convert_floats_to_decimal(self, obj: Any) -> Any:
        """Recursively convert float values to Decimal for DynamoDB compatibility"""
        if isinstance(obj, float):
            return Decimal(str(obj))
        elif isinstance(obj, dict):
            return {key: self._convert_floats_to_decimal(value) for key, value in obj.items()}
        elif isinstance(obj, list):
            return [self._convert_floats_to_decimal(item) for item in obj]
        else:
            return obj
    
    def _convert_decimal_to_float(self, obj: Any) -> Any:
        """Recursively convert Decimal values back to float for JSON serialization"""
        if isinstance(obj, Decimal):
            return float(obj)
        elif isinstance(obj, dict):
            return {key: self._convert_decimal_to_float(value) for key, value in obj.items()}
        elif isinstance(obj, list):
            return [self._convert_decimal_to_float(item) for item in obj]
        else:
            return obj
        
    async def initialize(self):
        """Initialize DynamoDB client and table"""
        try:
            self.dynamodb = boto3.resource('dynamodb', region_name=self.region)
            self.table = self.dynamodb.Table(self.table_name)
            logger.info("DynamoDB table initialized")
        except Exception as e:
            logger.error("Failed to initialize DynamoDB")
            raise
    
    async def save_project(self, user_email: str, project_data: ProjectData) -> str:
        """Save a project for a user (identified by email for cross-account compatibility)"""
        try:
            project_id = f"proj_{int(datetime.now().timestamp() * 1000)}"
            timestamp = datetime.now().isoformat()
            
            # Convert canvas data to DynamoDB-compatible format
            canvas_data_converted = self._convert_floats_to_decimal(project_data.canvasData)
            
            item = {
                'PK': f'EMAIL#{user_email}',
                'SK': f'PROJECT#{timestamp}',
                'projectId': project_id,
                'projectName': project_data.projectName,
                'created': timestamp,
                'modified': timestamp,
                'canvasData': canvas_data_converted
            }
            
            self.table.put_item(Item=item)
            logger.info("Project saved successfully")
            return project_id
            
        except ClientError as e:
            logger.error("DynamoDB save error")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to save project"
            )
    
    async def list_projects(self, user_email: str) -> List[ProjectListItem]:
        """List all projects for a user (identified by email for cross-account compatibility)"""
        try:
            response = self.table.query(
                KeyConditionExpression='PK = :pk AND begins_with(SK, :sk)',
                ExpressionAttributeValues={
                    ':pk': f'EMAIL#{user_email}',
                    ':sk': 'PROJECT#'
                },
                ScanIndexForward=False  # Sort by SK descending (newest first)
            )
            
            projects = []
            for item in response.get('Items', []):
                projects.append(ProjectListItem(
                    projectId=item['projectId'],
                    projectName=item['projectName'],
                    created=item['created'],
                    modified=item['modified']
                ))
            
            logger.info("Projects listed successfully")
            return projects
            
        except ClientError as e:
            logger.error("DynamoDB list error")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to list projects"
            )
    
    async def get_project(self, user_email: str, project_id: str) -> Optional[ProjectResponse]:
        """Get a specific project for a user (identified by email for cross-account compatibility)"""
        try:
            # Query by GSI or scan for the project
            response = self.table.query(
                KeyConditionExpression='PK = :pk',
                FilterExpression='projectId = :project_id',
                ExpressionAttributeValues={
                    ':pk': f'EMAIL#{user_email}',
                    ':project_id': project_id
                }
            )
            
            items = response.get('Items', [])
            if not items:
                return None
            
            item = items[0]
            # Convert Decimal values back to float for JSON serialization
            canvas_data_converted = self._convert_decimal_to_float(item['canvasData'])
            
            return ProjectResponse(
                projectId=item['projectId'],
                projectName=item['projectName'],
                created=item['created'],
                modified=item['modified'],
                canvasData=canvas_data_converted
            )
            
        except ClientError as e:
            logger.error("DynamoDB get error")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to get project"
            )
    
    async def delete_project(self, user_email: str, project_id: str) -> bool:
        """Delete a specific project for a user (identified by email for cross-account compatibility)"""
        try:
            # First find the item to get the SK
            response = self.table.query(
                KeyConditionExpression='PK = :pk',
                FilterExpression='projectId = :project_id',
                ExpressionAttributeValues={
                    ':pk': f'EMAIL#{user_email}',
                    ':project_id': project_id
                }
            )
            
            items = response.get('Items', [])
            if not items:
                return False
            
            item = items[0]
            
            # Delete the item
            self.table.delete_item(
                Key={
                    'PK': item['PK'],
                    'SK': item['SK']
                }
            )
            
            logger.info("Project deleted successfully")
            return True
            
        except ClientError as e:
            logger.error("DynamoDB delete error")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete project"
            )