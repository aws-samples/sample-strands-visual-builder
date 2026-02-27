"""
S3 Code Storage router for fetching generated code files
"""
from fastapi import APIRouter, HTTPException
import logging
from services.s3_code_storage_service import S3CodeStorageService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/s3-code", tags=["s3-code"])

# Initialize S3 service
s3_service = S3CodeStorageService()

@router.get("/{session_id}/{code_type}")
async def get_code_file(session_id: str, code_type: str):
    """
    Fetch code file from S3 temporary storage
    
    Args:
        session_id: Session identifier
        code_type: Type of code ('pure_strands', 'agentcore_ready', or 'requirements')
    """
    try:
        logger.info("Fetching code file")
        
        # Validate code_type
        if code_type not in ['pure_strands', 'agentcore_ready', 'requirements']:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid code_type: {code_type}. Must be 'pure_strands', 'agentcore_ready', or 'requirements'"
            )
        
        # Get code file from S3
        result = s3_service.get_code_file(session_id, code_type)
        
        if result['status'] == 'not_found':
            raise HTTPException(status_code=404, detail=result['error'])
        elif result['status'] == 'error':
            raise HTTPException(status_code=500, detail=result['error'])
        
        logger.info("Code file retrieved successfully")
        
        return {
            "success": True,
            "code_content": result['code_content'],
            "session_id": result['session_id'],
            "code_type": result['code_type'],
            "s3_uri": result['s3_uri'],
            "last_modified": result['last_modified'],
            "content_length": result['content_length']
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error fetching code file")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/{session_id}")
async def list_session_files(session_id: str):
    """
    List all code files for a session
    
    Args:
        session_id: Session identifier
    """
    try:
        logger.info("Listing session files")
        
        # List files for the session
        result = s3_service.list_session_files(session_id)
        
        if result['status'] == 'error':
            raise HTTPException(status_code=500, detail=result['error'])
        
        logger.info("Session files listed successfully")
        
        return {
            "success": True,
            "session_id": result['session_id'],
            "files": result['files'],
            "count": result['count']
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error listing session files")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.delete("/{session_id}")
async def delete_session_files(session_id: str):
    """
    Delete all code files for a session
    
    Args:
        session_id: Session identifier
    """
    try:
        logger.info("Deleting session files")
        
        # Delete files for the session
        result = s3_service.delete_session_files(session_id)
        
        if result['status'] == 'error':
            raise HTTPException(status_code=500, detail=result['error'])
        
        logger.info("Session files deleted successfully")
        
        return {
            "success": True,
            "session_id": result['session_id'],
            "deleted_count": result['deleted_count'],
            "total_files": result['total_files'],
            "errors": result.get('errors', [])
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error deleting session files")
        raise HTTPException(status_code=500, detail="Internal server error")