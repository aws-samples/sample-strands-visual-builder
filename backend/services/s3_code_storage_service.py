"""
S3 Code Storage Service for Expert Agent

This service provides S3 storage functionality for the expert agent to save
both pure Strands code and AgentCore-ready code to temporary storage.
"""

import boto3
import logging
from typing import Dict, Any
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

class S3CodeStorageService:
    """Service for storing generated code files in S3 temporary storage."""
    
    def __init__(self):
        """Initialize S3 client and get bucket name from SSM."""
        try:
            self.s3_client = boto3.client('s3')
            self.ssm_client = boto3.client('ssm')
            self.bucket_name = self._get_bucket_name()
            logger.info("S3CodeStorageService initialized")
        except Exception as e:
            logger.error("Failed to initialize S3CodeStorageService")
            raise
    
    def _get_bucket_name(self) -> str:
        """Get the S3 bucket name from environment variable first, then SSM Parameter Store."""
        import os
        
        # First try environment variable (faster, no network call)
        env_bucket = os.getenv('TEMP_CODE_BUCKET')
        if env_bucket:
            logger.info("Retrieved bucket name from environment variable")
            return env_bucket
        
        # Fallback to SSM Parameter Store
        try:
            response = self.ssm_client.get_parameter(
                Name='/strands/temp-code-bucket'
            )
            bucket_name = response['Parameter']['Value']
            logger.info("Retrieved bucket name from SSM (fallback)")
            return bucket_name
        except ClientError as e:
            logger.error("Failed to get bucket name from both environment and SSM")
            raise Exception("Could not determine S3 bucket name from environment variable or SSM parameter")
    
    def store_code_file(
        self, 
        session_id: str, 
        code_content: str, 
        code_type: str,
        file_extension: str = '.py'
    ) -> Dict[str, Any]:
        """
        Store code file in S3 temporary storage.
        
        Args:
            session_id: Unique session identifier
            code_content: The code content to store
            code_type: Type of code ('pure_strands', 'agentcore_ready', or 'requirements')
            file_extension: File extension to use (default: '.py', use '.txt' for requirements)
            
        Returns:
            Dictionary with S3 URI and metadata
        """
        try:
            # Validate code_type
            if code_type not in ['pure_strands', 'agentcore_ready', 'requirements']:
                raise ValueError(f"Invalid code_type: {code_type}. Must be 'pure_strands', 'agentcore_ready', or 'requirements'")
            
            # Validate inputs
            if not session_id or not session_id.strip():
                raise ValueError("session_id cannot be empty")
            
            if not code_content or not code_content.strip():
                raise ValueError("code_content cannot be empty")
            
            # Sanitize session_id for S3 key (remove invalid characters)
            safe_session_id = ''.join(c for c in session_id if c.isalnum() or c in '-_')
            if not safe_session_id:
                raise ValueError("session_id contains no valid characters for S3 key")
            
            # Create S3 key
            s3_key = f"temp-code/{safe_session_id}/{code_type}{file_extension}"
            
            # Determine content type based on file extension
            content_type = 'text/plain' if file_extension == '.txt' else 'text/x-python'
            
            # Store file in S3
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=s3_key,
                Body=code_content.encode('utf-8'),
                ContentType=content_type,
                Metadata={
                    'session-id': session_id,
                    'code-type': code_type,
                    'content-length': str(len(code_content)),
                    'file-extension': file_extension
                }
            )
            
            # Generate S3 URI
            s3_uri = f"s3://{self.bucket_name}/{s3_key}"
            
            logger.info("Successfully stored code file")
            
            return {
                "status": "success",
                "s3_uri": s3_uri,
                "bucket": self.bucket_name,
                "key": s3_key,
                "code_type": code_type,
                "session_id": session_id,
                "content_length": len(code_content)
            }
            
        except ValueError as e:
            logger.error("Validation error in store_code_file")
            return {
                "status": "error",
                "error": "Validation error"
            }
        except ClientError as e:
            error_code = e.response['Error']['Code']
            logger.error("AWS error in store_code_file")
            return {
                "status": "error",
                "error": "AWS S3 error"
            }
        except Exception as e:
            logger.error("Unexpected error in store_code_file")
            return {
                "status": "error",
                "error": "Unexpected error"
            }
    
    def get_code_file(self, session_id: str, code_type: str) -> Dict[str, Any]:
        """
        Retrieve code file from S3 temporary storage.
        
        Args:
            session_id: Unique session identifier
            code_type: Type of code ('pure_strands', 'agentcore_ready', or 'requirements')
            
        Returns:
            Dictionary with code content and metadata
        """
        try:
            # Validate code_type
            if code_type not in ['pure_strands', 'agentcore_ready', 'requirements']:
                raise ValueError(f"Invalid code_type: {code_type}. Must be 'pure_strands', 'agentcore_ready', or 'requirements'")
            
            # Sanitize session_id for S3 key
            safe_session_id = ''.join(c for c in session_id if c.isalnum() or c in '-_')
            if not safe_session_id:
                raise ValueError("session_id contains no valid characters for S3 key")
            
            # Create S3 key with appropriate file extension
            file_extension = '.txt' if code_type == 'requirements' else '.py'
            s3_key = f"temp-code/{safe_session_id}/{code_type}{file_extension}"
            
            # Get file from S3
            response = self.s3_client.get_object(
                Bucket=self.bucket_name,
                Key=s3_key
            )
            
            # Read content
            code_content = response['Body'].read().decode('utf-8')
            
            logger.info("Successfully retrieved code file")
            
            return {
                "status": "success",
                "code_content": code_content,
                "s3_uri": f"s3://{self.bucket_name}/{s3_key}",
                "code_type": code_type,
                "session_id": session_id,
                "last_modified": response.get('LastModified'),
                "content_length": len(code_content)
            }
            
        except ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == 'NoSuchKey':
                logger.warning("Code file not found")
                return {
                    "status": "not_found",
                    "error": "Code file not found"
                }
            else:
                logger.error("AWS error in get_code_file")
                return {
                    "status": "error",
                    "error": "AWS S3 error"
                }
        except Exception as e:
            logger.error("Unexpected error in get_code_file")
            return {
                "status": "error",
                "error": "Unexpected error"
            }
    
    def list_session_files(self, session_id: str) -> Dict[str, Any]:
        """
        List all code files for a session.
        
        Args:
            session_id: Unique session identifier
            
        Returns:
            Dictionary with list of files and metadata
        """
        try:
            # Sanitize session_id for S3 key
            safe_session_id = ''.join(c for c in session_id if c.isalnum() or c in '-_')
            if not safe_session_id:
                raise ValueError("session_id contains no valid characters for S3 key")
            
            # List objects with prefix
            prefix = f"temp-code/{safe_session_id}/"
            
            response = self.s3_client.list_objects_v2(
                Bucket=self.bucket_name,
                Prefix=prefix
            )
            
            files = []
            if 'Contents' in response:
                for obj in response['Contents']:
                    key = obj['Key']
                    # Extract code type from filename
                    filename = key.split('/')[-1]
                    code_type = filename.replace('.py', '') if filename.endswith('.py') else filename
                    
                    files.append({
                        "key": key,
                        "code_type": code_type,
                        "size": obj['Size'],
                        "last_modified": obj['LastModified'],
                        "s3_uri": f"s3://{self.bucket_name}/{key}"
                    })
            
            logger.info("Retrieved session files")
            
            return {
                "status": "success",
                "session_id": session_id,
                "files": files,
                "count": len(files)
            }
            
        except Exception as e:
            logger.error("Error in list_session_files")
            return {
                "status": "error",
                "error": "Error listing files"
            }
    
    def delete_session_files(self, session_id: str) -> Dict[str, Any]:
        """
        Delete all code files for a session.
        
        Args:
            session_id: Unique session identifier
            
        Returns:
            Dictionary with deletion results
        """
        try:
            # First list all files for the session
            list_result = self.list_session_files(session_id)
            
            if list_result['status'] != 'success':
                return list_result
            
            files = list_result['files']
            if not files:
                return {
                    "status": "success",
                    "message": f"No files found for session {session_id}",
                    "deleted_count": 0
                }
            
            # Delete all files
            objects_to_delete = [{'Key': file['key']} for file in files]
            
            response = self.s3_client.delete_objects(
                Bucket=self.bucket_name,
                Delete={
                    'Objects': objects_to_delete,
                    'Quiet': False
                }
            )
            
            deleted_count = len(response.get('Deleted', []))
            errors = response.get('Errors', [])
            
            logger.info("Deleted session files")
            
            result = {
                "status": "success",
                "session_id": session_id,
                "deleted_count": deleted_count,
                "total_files": len(files)
            }
            
            if errors:
                result["errors"] = errors
                logger.warning("Some files could not be deleted")
            
            return result
            
        except Exception as e:
            logger.error("Error in delete_session_files")
            return {
                "status": "error",
                "error": "Error deleting files"
            }