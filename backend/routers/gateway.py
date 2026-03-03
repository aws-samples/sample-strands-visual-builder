# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

"""Runtime gateway endpoints for canvas integration."""
from fastapi import APIRouter, Depends, HTTPException
import logging
from models.api_models import User
from services.auth_service import get_current_user
from services.gateway_service import gateway_runtime_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/gateway", tags=["gateway-runtime"])


@router.get("/{gateway_id}/tools")
async def list_gateway_tools(gateway_id: str, current_user: User = Depends(get_current_user)):
    """List tools available from a gateway."""
    try:
        tools = await gateway_runtime_service.list_gateway_tools(gateway_id)
        return {"success": True, "tools": tools, "gateway_id": gateway_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{gateway_id}/details")
async def get_gateway_details(gateway_id: str, current_user: User = Depends(get_current_user)):
    """Get gateway details."""
    try:
        details = await gateway_runtime_service.get_gateway_details(gateway_id)
        return {"success": True, **details}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
