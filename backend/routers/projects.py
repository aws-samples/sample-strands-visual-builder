"""
Project management router for CRUD operations
"""
from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict
import logging
from models.api_models import (
    User, ProjectData, ProjectResponse, 
    ProjectListResponse, ProjectListItem
)
from routers.auth import get_current_user
from services.db_service import DynamoDBService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["projects"])

# Initialize database service (will be updated by main.py on startup)
db_service = None

@router.post("/projects", response_model=Dict[str, str])
async def save_project(
    project_data: ProjectData,
    current_user: User = Depends(get_current_user)
):
    """Save a project for the authenticated user"""
    try:
        if not db_service:
            raise HTTPException(status_code=503, detail="Database service not available")
        project_id = await db_service.save_project(current_user.email, project_data)
        return {"projectId": project_id}
    except Exception as e:
        logger.error("Failed to save project")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save project"
        )

@router.get("/projects", response_model=ProjectListResponse)
async def list_projects(current_user: User = Depends(get_current_user)):
    """List all projects for the authenticated user"""
    try:
        if not db_service:
            raise HTTPException(status_code=503, detail="Database service not available")
        projects = await db_service.list_projects(current_user.email)
        return ProjectListResponse(projects=projects)
    except Exception as e:
        logger.error("Failed to list projects")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list projects"
        )

@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get a specific project for the authenticated user"""
    try:
        if not db_service:
            raise HTTPException(status_code=503, detail="Database service not available")
        project = await db_service.get_project(current_user.email, project_id)
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found"
            )
        return project
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get project")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get project"
        )

@router.delete("/projects/{project_id}")
async def delete_project(
    project_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a specific project for the authenticated user"""
    try:
        if not db_service:
            raise HTTPException(status_code=503, detail="Database service not available")
        success = await db_service.delete_project(current_user.email, project_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found"
            )
        return {"message": "Project deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete project")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete project"
        )