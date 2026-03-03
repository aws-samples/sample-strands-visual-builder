# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

"""Runtime gateway operations — list tools, test connections."""
import boto3
import logging
from typing import Dict, Any, List
from services.config_service import config_service

logger = logging.getLogger(__name__)


class GatewayRuntimeService:
    def __init__(self):
        self._control_client = None
        self._region = None

    def _init_clients(self):
        if self._control_client:
            return
        config = config_service.get_all_config()
        self._region = config.get('REGION', 'us-west-2')
        self._control_client = boto3.client('bedrock-agentcore-control', region_name=self._region)

    async def list_gateway_tools(self, gateway_id: str) -> List[Dict[str, Any]]:
        """List tools available from a gateway by checking its targets."""
        self._init_clients()
        try:
            response = self._control_client.list_gateway_targets(gatewayIdentifier=gateway_id)
            tools = []
            for target in response.get('targets', []):
                tools.append({
                    "target_id": target.get('targetId', target.get('name', '')),
                    "name": target.get('name', ''),
                    "status": target.get('status', 'UNKNOWN'),
                })
            return tools
        except Exception as e:
            logger.error(f"Failed to list gateway tools: {e}")
            return []

    async def get_gateway_details(self, gateway_id: str) -> Dict[str, Any]:
        """Get gateway details including endpoint URL."""
        self._init_clients()
        try:
            response = self._control_client.get_gateway(gatewayIdentifier=gateway_id)
            gw_id = response.get('gatewayId', response.get('name', gateway_id))
            return {
                "gateway_id": gw_id,
                "name": response.get('name', ''),
                "status": response.get('status', 'UNKNOWN'),
                "endpoint": f"https://{gw_id}.gateway.bedrock-agentcore.{self._region}.amazonaws.com/mcp",
                "auth_type": response.get('authorizerType', 'UNKNOWN'),
            }
        except Exception as e:
            logger.error(f"Failed to get gateway details: {e}")
            return {"gateway_id": gateway_id, "status": "ERROR", "error": str(e)}


gateway_runtime_service = GatewayRuntimeService()
