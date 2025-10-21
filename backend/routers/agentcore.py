"""
AgentCore API Router

Handles AgentCore deployment and invocation endpoints.
"""

import json
import logging
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services.agentcore_service import (
    agentcore_service, 
    DeploymentConfig
)
from services.agentcore_invocation_service import (
    agentcore_invocation_service
)
from services.auth_service import get_current_user
from models.api_models import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agentcore", tags=["agentcore"])


# Request/Response Models
class DeployAgentRequest(BaseModel):
    """Request to deploy agent to AgentCore"""
    strands_code: str
    config: DeploymentConfig
    requirements_txt: Optional[str] = None


class DeployAgentResponse(BaseModel):
    """Response from agent deployment"""
    success: bool
    agent_runtime_arn: str
    message: str


class InvokeAgentRequest(BaseModel):
    """Request to invoke deployed agent"""
    agent_runtime_arn: str
    message: str
    session_id: Optional[str] = None


class InvokeAgentResponse(BaseModel):
    """Response from agent invocation"""
    session_id: str
    response: str
    metadata: Dict[str, Any] = {}
    timestamp: str


class ChatSessionResponse(BaseModel):
    """Chat session information"""
    session_id: str
    agent_runtime_arn: str
    message_count: int
    is_active: bool
    created_at: str
    last_activity: str


# Deployment Endpoints
@router.post("/deploy", response_model=DeployAgentResponse)
async def deploy_agent(request: DeployAgentRequest, current_user: User = Depends(get_current_user)) -> DeployAgentResponse:
    """Deploy Strands agent to AgentCore - synchronous deployment"""
    try:
        logger.info(f"AgentCore deployment started - Agent: {request.config.agent_name}")
        
        # Deploy agent synchronously - this waits for completion and returns ARN
        agent_runtime_arn = await agentcore_service.deploy_agent(
            request.strands_code,
            request.config,
            request.requirements_txt
        )
        
        logger.info(f"AgentCore deployment completed - ARN: {agent_runtime_arn}")
        
        return DeployAgentResponse(
            success=True,
            agent_runtime_arn=agent_runtime_arn,
            message="Agent deployed successfully"
        )
        
    except Exception as e:
        logger.error("Deployment failed")
        raise HTTPException(
            status_code=500,
            detail="Deployment failed"
        )



@router.get("/agents/{agent_runtime_arn:path}/status")
async def get_agent_runtime_status(agent_runtime_arn: str, current_user: User = Depends(get_current_user)):
    """Get agent runtime status from AWS"""
    try:
        logger.info("Getting agent runtime status")
        status = await agentcore_service.get_agent_runtime_status(agent_runtime_arn)
        
        if not status:
            raise HTTPException(
                status_code=404,
                detail=f"Agent runtime {agent_runtime_arn} not found"
            )
        
        return {"agent_runtime": status}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get agent runtime status")
        raise HTTPException(
            status_code=500,
            detail="Failed to get agent runtime status"
        )


# Invocation Endpoints
@router.post("/invoke", response_model=InvokeAgentResponse)
async def invoke_agent(request: InvokeAgentRequest, current_user: User = Depends(get_current_user)) -> InvokeAgentResponse:
    """Invoke deployed agent"""
    try:
        logger.info("Invoking agent")
        
        result = await agentcore_invocation_service.invoke_agent(
            request.agent_runtime_arn,
            request.message,
            request.session_id,
            current_user.email  # Pass user email for session management
        )
        
        return InvokeAgentResponse(**result)
        
    except Exception as e:
        logger.error("Agent invocation failed")
        raise HTTPException(
            status_code=500,
            detail="Agent invocation failed"
        )


@router.post("/invoke/stream")
async def invoke_agent_streaming(request: InvokeAgentRequest, current_user: User = Depends(get_current_user)):
    """Invoke deployed agent with streaming response"""
    try:
        logger.info("Starting streaming invocation")
        
        async def event_stream():
            async for chunk in agentcore_invocation_service.invoke_agent_streaming(
                request.agent_runtime_arn,
                request.message,
                request.session_id,
                current_user.email  # Pass user email for session management
            ):

                yield f"data: {chunk}\n\n"
        
        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Cache-Control"
            }
        )
        
    except Exception as e:
        logger.error("Streaming invocation failed")
        raise HTTPException(
            status_code=500,
            detail="Streaming invocation failed"
        )


# Chat Session Endpoints
class CreateSessionRequest(BaseModel):
    """Request to create a chat session"""
    agent_runtime_arn: str


@router.post("/sessions")
async def create_chat_session(request: CreateSessionRequest, current_user: User = Depends(get_current_user)):
    """Create a new chat session"""
    try:
        session_id = await agentcore_invocation_service.create_chat_session(request.agent_runtime_arn, current_user.email)
        
        return {
            "session_id": session_id,
            "agent_runtime_arn": request.agent_runtime_arn,
            "user_email": current_user.email,
            "message": "Chat session created successfully"
        }
        
    except Exception as e:
        logger.error("Failed to create chat session")
        raise HTTPException(
            status_code=500,
            detail="Failed to create chat session"
        )


@router.get("/sessions/{session_id}")
async def get_chat_session(session_id: str, current_user: User = Depends(get_current_user)) -> ChatSessionResponse:
    """Get chat session information"""
    try:
        logger.info("Getting chat session")
        session = await agentcore_invocation_service.get_chat_session(session_id)
        
        if not session:
            raise HTTPException(
                status_code=404,
                detail=f"Chat session {session_id} not found"
            )
        
        return ChatSessionResponse(
            session_id=session.session_id,
            agent_runtime_arn=session.agent_runtime_arn,
            message_count=len(session.messages),
            is_active=session.is_active,
            created_at=session.created_at.isoformat(),
            last_activity=session.last_activity.isoformat()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get chat session")
        raise HTTPException(
            status_code=500,
            detail="Failed to get chat session"
        )


@router.get("/sessions/{session_id}/history")
async def get_session_history(session_id: str, current_user: User = Depends(get_current_user)):
    """Get chat history for a session"""
    try:
        logger.info("Getting session history")
        messages = await agentcore_invocation_service.get_session_history(session_id)
        
        return {
            "session_id": session_id,
            "messages": [
                {
                    "id": msg.id,
                    "type": msg.type,
                    "content": msg.content,
                    "timestamp": msg.timestamp.isoformat(),
                    "status": msg.status
                }
                for msg in messages
            ]
        }
        
    except Exception as e:
        logger.error("Failed to get session history")
        raise HTTPException(
            status_code=500,
            detail="Failed to get session history"
        )


@router.get("/sessions")
async def list_chat_sessions(current_user: User = Depends(get_current_user)):
    """List all active chat sessions"""
    try:
        logger.info("Listing chat sessions")
        sessions = await agentcore_invocation_service.list_active_sessions()
        
        return {
            "sessions": [
                {
                    "session_id": session.session_id,
                    "agent_runtime_arn": session.agent_runtime_arn,
                    "message_count": len(session.messages),
                    "is_active": session.is_active,
                    "created_at": session.created_at.isoformat(),
                    "last_activity": session.last_activity.isoformat()
                }
                for session in sessions
            ]
        }
        
    except Exception as e:
        logger.error("Failed to list chat sessions")
        raise HTTPException(
            status_code=500,
            detail="Failed to list chat sessions"
        )


@router.delete("/sessions/{session_id}")
async def delete_chat_session(session_id: str, current_user: User = Depends(get_current_user)):
    """Delete a chat session"""
    try:
        logger.info("Deleting chat session")
        success = await agentcore_invocation_service.delete_session(session_id)
        
        if not success:
            raise HTTPException(
                status_code=404,
                detail=f"Chat session {session_id} not found"
            )
        
        return {"message": f"Chat session {session_id} deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete chat session")
        raise HTTPException(
            status_code=500,
            detail="Failed to delete chat session"
        )


# Deployments Management
@router.get("/deployments")
async def list_deployments(current_user: User = Depends(get_current_user)):
    """List all AgentCore deployments"""
    try:
        logger.info("Listing deployments")
        deployments = await agentcore_service.list_agent_runtimes()
        return {"deployments": deployments}
        
    except Exception as e:
        logger.error("Failed to list deployments")
        raise HTTPException(
            status_code=500,
            detail="Failed to list deployments"
        )




# Conversation endpoints removed - unused compatibility layer


# Health Check
@router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "agentcore",
        "timestamp": "2025-01-09T00:00:00Z"
    }