# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

"""Gateway management API endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any
import logging
import re
from models.api_models import User
from services.auth_service import get_current_user
from services.gateway_management_service import gateway_management_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/gateway-management", tags=["gateway-management"])

GATEWAY_NAME_PATTERN = re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9-]{0,30}[a-zA-Z0-9]$')


@router.post("/create")
async def create_gateway(body: Dict[str, Any], current_user: User = Depends(get_current_user)):
    """Create a new AgentCore Gateway."""
    try:
        name = body.get("name", "").strip()
        if not name or not GATEWAY_NAME_PATTERN.match(name):
            raise HTTPException(
                status_code=400,
                detail="Gateway name must be 2-32 characters, alphanumeric and hyphens only, must start and end with alphanumeric"
            )

        description = body.get("description", "")
        result = await gateway_management_service.create_gateway(
            name=name, description=description, user_email=current_user.email
        )
        return {"success": True, **result}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create gateway: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list")
async def list_gateways(current_user: User = Depends(get_current_user)):
    """List gateways created by Visual Builder."""
    try:
        gateways = await gateway_management_service.list_gateways(user_email=current_user.email)
        return {"success": True, "gateways": gateways}
    except Exception as e:
        logger.error(f"Failed to list gateways: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/target/create")
async def create_target(body: Dict[str, Any], current_user: User = Depends(get_current_user)):
    """Add a Lambda target to a gateway."""
    try:
        gateway_id = body.get("gateway_id", "").strip()
        lambda_arn = body.get("lambda_arn", "").strip()
        tool_schemas_raw = body.get("tool_schemas", [])
        # Frontend may send as JSON string or parsed list
        if isinstance(tool_schemas_raw, str):
            import json as _json
            tool_schemas = _json.loads(tool_schemas_raw)
        else:
            tool_schemas = tool_schemas_raw
        target_name = body.get("target_name", "")

        if not gateway_id or not lambda_arn:
            raise HTTPException(status_code=400, detail="gateway_id and lambda_arn are required")
        if not tool_schemas:
            raise HTTPException(status_code=400, detail="At least one tool schema is required")

        result = await gateway_management_service.add_lambda_target(
            gateway_id=gateway_id, lambda_arn=lambda_arn,
            tool_schemas=tool_schemas, target_name=target_name,
            user_email=current_user.email
        )
        return {"success": True, **result}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create target: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/target/verify/{gateway_id}/{target_id}")
async def verify_target(gateway_id: str, target_id: str, current_user: User = Depends(get_current_user)):
    """Verify a gateway target connection."""
    try:
        result = await gateway_management_service.verify_target_connection(gateway_id, target_id)
        return {"success": True, **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/lambda/list")
async def list_lambdas(current_user: User = Depends(get_current_user)):
    """List available Lambda functions."""
    try:
        functions = await gateway_management_service.list_lambda_functions()
        return {"success": True, "functions": functions}
    except Exception as e:
        logger.error(f"Failed to list Lambda functions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/targets/{gateway_id}")
async def list_targets(gateway_id: str, current_user: User = Depends(get_current_user)):
    """List targets for a gateway."""
    try:
        targets = await gateway_management_service.list_gateway_targets(gateway_id)
        return {"success": True, "targets": targets}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
