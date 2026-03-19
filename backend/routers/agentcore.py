# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

"""
AgentCore API Router

Handles AgentCore deployment and invocation endpoints.
"""

import json
import logging
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import boto3

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
    deployment_type: str = "agent"  # "agent" or "mcp"
    mcp_server_code: Optional[str] = None  # Only needed for MCP deployments


class McpOAuthConfig(BaseModel):
    """MCP OAuth configuration for MCP server integration"""
    mcp_server_url: str
    auth_type: str
    authorization_url: str
    token_url: str
    client_id: str
    scopes: list[str]
    client_secret: Optional[str] = None
    note: Optional[str] = None


class DeployAgentResponse(BaseModel):
    """Response from agent deployment"""
    success: bool
    agent_runtime_arn: str
    message: str
    deployment_type: Optional[str] = None
    mcp_oauth_config: Optional[McpOAuthConfig] = None


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
        logger.info(f"AgentCore deployment started - Agent: {request.config.agent_name}, Type: {request.deployment_type}")
        
        # Deploy agent synchronously - this waits for completion and returns ARN or dict
        deployment_result = await agentcore_service.deploy_agent(
            request.strands_code,
            request.config,
            request.requirements_txt,
            request.deployment_type,
            request.mcp_server_code
        )
        
        logger.info(f"AgentCore deployment completed - Result: {deployment_result}")
        
        # Handle both response formats (string for agents, dict for MCP)
        if isinstance(deployment_result, dict):
            # MCP deployment with OAuth config
            return DeployAgentResponse(
                success=True,
                agent_runtime_arn=deployment_result["agent_arn"],
                message=f"{request.deployment_type.upper()} deployed successfully",
                deployment_type=deployment_result.get("deployment_type"),
                mcp_oauth_config=deployment_result.get("mcp_oauth_config")
            )
        else:
            # Agent deployment (string ARN)
            return DeployAgentResponse(
                success=True,
                agent_runtime_arn=deployment_result,
                message=f"{request.deployment_type.upper()} deployed successfully",
                deployment_type=request.deployment_type
            )
        
    except Exception as e:
        logger.error(f"Deployment failed: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Deployment failed: {str(e)}"
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
        
        # Validate agent belongs to Visual Builder
        try:
            is_valid = await agentcore_service._validate_agent_access(request.agent_runtime_arn)
            if not is_valid:
                raise HTTPException(status_code=403, detail="Access denied: agent not managed by Visual Builder")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=403, detail="Access denied: agent not managed by Visual Builder")
        
        result = await agentcore_invocation_service.invoke_agent(
            request.agent_runtime_arn,
            request.message,
            request.session_id,
            current_user.email  # Pass user email for session management
        )
        
        return InvokeAgentResponse(**result)
        
    except HTTPException:
        raise
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
        
        # Validate agent belongs to Visual Builder
        try:
            is_valid = await agentcore_service._validate_agent_access(request.agent_runtime_arn)
            if not is_valid:
                raise HTTPException(status_code=403, detail="Access denied: agent not managed by Visual Builder")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=403, detail="Access denied: agent not managed by Visual Builder")
        
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
            }
        )
        
    except HTTPException:
        raise
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
        session = await agentcore_invocation_service.get_chat_session_for_user(session_id, current_user.email)
        
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
        messages = await agentcore_invocation_service.get_session_history(session_id, current_user.email)
        
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
        sessions = await agentcore_invocation_service.list_active_sessions(current_user.email)
        
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
        success = await agentcore_invocation_service.delete_session(session_id, current_user.email)
        
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


# Region name mapping for friendly display
REGION_FRIENDLY_NAMES = {
    'us-east-1': 'US East (N. Virginia)',
    'us-east-2': 'US East (Ohio)',
    'us-west-1': 'US West (N. California)',
    'us-west-2': 'US West (Oregon)',
    'af-south-1': 'Africa (Cape Town)',
    'ap-east-1': 'Asia Pacific (Hong Kong)',
    'ap-south-1': 'Asia Pacific (Mumbai)',
    'ap-south-2': 'Asia Pacific (Hyderabad)',
    'ap-southeast-1': 'Asia Pacific (Singapore)',
    'ap-southeast-2': 'Asia Pacific (Sydney)',
    'ap-southeast-3': 'Asia Pacific (Jakarta)',
    'ap-northeast-1': 'Asia Pacific (Tokyo)',
    'ap-northeast-2': 'Asia Pacific (Seoul)',
    'ap-northeast-3': 'Asia Pacific (Osaka)',
    'ca-central-1': 'Canada (Central)',
    'eu-central-1': 'Europe (Frankfurt)',
    'eu-central-2': 'Europe (Zurich)',
    'eu-west-1': 'Europe (Ireland)',
    'eu-west-2': 'Europe (London)',
    'eu-west-3': 'Europe (Paris)',
    'eu-north-1': 'Europe (Stockholm)',
    'eu-south-1': 'Europe (Milan)',
    'me-south-1': 'Middle East (Bahrain)',
    'me-central-1': 'Middle East (UAE)',
    'sa-east-1': 'South America (São Paulo)',
}

# Cached regions list (populated on first call)
_cached_agentcore_regions: Optional[List[Dict[str, str]]] = None


@router.get("/regions")
async def get_supported_regions(current_user: User = Depends(get_current_user)):
    """Get list of AWS regions where AgentCore is available"""
    global _cached_agentcore_regions

    if _cached_agentcore_regions is not None:
        return {"regions": _cached_agentcore_regions}

    try:
        session = boto3.Session()
        available = session.get_available_regions('bedrock-agentcore-control')

        regions = []
        for region_code in sorted(available):
            friendly = REGION_FRIENDLY_NAMES.get(region_code, region_code)
            regions.append({"label": friendly, "value": region_code})

        _cached_agentcore_regions = regions
        return {"regions": regions}

    except Exception as e:
        logger.warning(f"Failed to discover AgentCore regions dynamically: {e}")
        # Fallback to known regions from AWS docs
        fallback = [
            {"label": "US East (N. Virginia)", "value": "us-east-1"},
            {"label": "US East (Ohio)", "value": "us-east-2"},
            {"label": "US West (Oregon)", "value": "us-west-2"},
            {"label": "Asia Pacific (Mumbai)", "value": "ap-south-1"},
            {"label": "Asia Pacific (Singapore)", "value": "ap-southeast-1"},
            {"label": "Asia Pacific (Sydney)", "value": "ap-southeast-2"},
            {"label": "Asia Pacific (Tokyo)", "value": "ap-northeast-1"},
            {"label": "Asia Pacific (Seoul)", "value": "ap-northeast-2"},
            {"label": "Canada (Central)", "value": "ca-central-1"},
            {"label": "Europe (Frankfurt)", "value": "eu-central-1"},
            {"label": "Europe (Ireland)", "value": "eu-west-1"},
            {"label": "Europe (London)", "value": "eu-west-2"},
            {"label": "Europe (Paris)", "value": "eu-west-3"},
            {"label": "Europe (Stockholm)", "value": "eu-north-1"},
            {"label": "South America (São Paulo)", "value": "sa-east-1"},
        ]
        _cached_agentcore_regions = fallback
        return {"regions": fallback}


# Health Check
@router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "agentcore",
        "timestamp": "2025-01-09T00:00:00Z"
    }