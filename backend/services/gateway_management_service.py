# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

"""
Gateway Management Service — creates and manages AgentCore Gateways.
The app creates gateways and gateway roles. Users create Lambda functions
outside the app and grant invoke permission via CLI.
"""
import asyncio
import boto3
import json
import logging
import time
from typing import Dict, Any, List, Optional
from services.config_service import config_service

logger = logging.getLogger(__name__)


class GatewayManagementService:
    def __init__(self):
        self._control_client = None
        self._iam_client = None
        self._lambda_client = None
        self._region = None
        self._account_id = None

    def _init_clients(self):
        if self._control_client:
            return
        config = config_service.get_all_config()
        self._region = config.get('REGION', 'us-west-2')
        self._account_id = boto3.client('sts').get_caller_identity()['Account']
        self._control_client = boto3.client('bedrock-agentcore-control', region_name=self._region)
        self._iam_client = boto3.client('iam')
        self._lambda_client = boto3.client('lambda', region_name=self._region)

    def _get_permissions_boundary_arn(self) -> str:
        config = config_service.get_all_config()
        arn = config.get('GATEWAY_PERMISSIONS_BOUNDARY_ARN')
        if not arn:
            arn = f"arn:aws:iam::{self._account_id}:policy/strands-vb-gw-permissions-boundary-{self._account_id}"
        return arn

    async def create_gateway(self, name: str, description: str = "", user_email: str = "") -> Dict[str, Any]:
        """Create a gateway with IAM role and semantic search."""
        self._init_clients()

        role_name = f"strands-vb-gw-{name}-role"
        role_arn = self._create_gateway_role(role_name)

        # Wait for IAM propagation
        await asyncio.sleep(5)

        response = self._control_client.create_gateway(
            name=name,
            description=description or "Gateway created by Strands Visual Builder",
            protocolType="MCP",
            authorizerType="AWS_IAM",
            roleArn=role_arn,
            protocolConfiguration={"mcp": {"searchType": "SEMANTIC"}},
            tags={"CreatedBy": "strands-visual-builder", "Owner": user_email}
        )

        gateway_id = response.get('gatewayId', response.get('name', name))

        # Poll until ready
        status = await self._poll_gateway_status(gateway_id)

        return {
            "gateway_id": gateway_id,
            "status": status,
            "role_arn": role_arn,
            "role_name": role_name,
            "endpoint": f"https://{gateway_id}.gateway.bedrock-agentcore.{self._region}.amazonaws.com/mcp"
        }

    def _create_gateway_role(self, role_name: str) -> str:
        """Create IAM role for gateway with permissions boundary.
        If the role already exists, return its ARN instead of failing."""
        trust_policy = {
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Principal": {"Service": "bedrock-agentcore.amazonaws.com"},
                "Action": "sts:AssumeRole"
            }]
        }

        try:
            response = self._iam_client.create_role(
                RoleName=role_name,
                AssumeRolePolicyDocument=json.dumps(trust_policy),
                Description="Gateway role created by Strands Visual Builder",
                PermissionsBoundary=self._get_permissions_boundary_arn(),
                Tags=[
                    {"Key": "CreatedBy", "Value": "strands-visual-builder"},
                    {"Key": "ManagedBy", "Value": "strands-visual-builder"}
                ]
            )
            return response['Role']['Arn']
        except self._iam_client.exceptions.EntityAlreadyExistsException:
            # Role already exists — reuse it
            response = self._iam_client.get_role(RoleName=role_name)
            return response['Role']['Arn']

    async def add_lambda_target(self, gateway_id: str, lambda_arn: str,
                                tool_schemas: list, target_name: str = "",
                                user_email: str = "") -> Dict[str, Any]:
        """Add a Lambda function as a gateway target."""
        self._init_clients()

        # Get gateway to find its role
        gateway = self._control_client.get_gateway(gatewayIdentifier=gateway_id)
        role_name = gateway.get('roleArn', '').split('/')[-1]

        # Update gateway role to allow invoking this Lambda
        self._update_gateway_role_policy(role_name, lambda_arn, gateway_id)

        # Create the target
        if not target_name:
            target_name = lambda_arn.split(':')[-1]  # Use function name

        response = self._control_client.create_gateway_target(
            gatewayIdentifier=gateway_id,
            name=target_name,
            targetConfiguration={
                "mcp": {
                    "lambda": {
                        "lambdaArn": lambda_arn,
                        "toolSchema": {"inlinePayload": tool_schemas}
                    }
                }
            },
            credentialProviderConfigurations=[
                {"credentialProviderType": "GATEWAY_IAM_ROLE"}
            ]
        )

        target_id = response.get('targetId', response.get('name', target_name))

        # Generate the permission command for the user
        permission_command = self._generate_permission_command(lambda_arn, gateway.get('roleArn', ''))

        return {
            "target_id": target_id,
            "gateway_id": gateway_id,
            "lambda_arn": lambda_arn,
            "permission_command": permission_command,
            "permission_granted": False,  # User needs to run the command
            "status": "CREATING"
        }

    def _update_gateway_role_policy(self, role_name: str, lambda_arn: str, gateway_id: str):
        """Add Lambda invoke permission to gateway role."""
        policy_name = "LambdaInvokePolicy"

        # Get existing policy to append
        existing_arns = []
        try:
            existing = self._iam_client.get_role_policy(RoleName=role_name, PolicyName=policy_name)
            existing_doc = json.loads(existing['PolicyDocument']) if isinstance(existing['PolicyDocument'], str) else existing['PolicyDocument']
            for stmt in existing_doc.get('Statement', []):
                resource = stmt.get('Resource', [])
                if isinstance(resource, str):
                    existing_arns.append(resource)
                elif isinstance(resource, list):
                    existing_arns.extend(resource)
        except self._iam_client.exceptions.NoSuchEntityException:
            pass

        # Add new ARN
        if lambda_arn not in existing_arns:
            existing_arns.append(lambda_arn)

        policy_doc = {
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Action": "lambda:InvokeFunction",
                "Resource": existing_arns
            }]
        }

        self._iam_client.put_role_policy(
            RoleName=role_name,
            PolicyName=policy_name,
            PolicyDocument=json.dumps(policy_doc)
        )

    def _generate_permission_command(self, lambda_arn: str, role_arn: str) -> str:
        """Generate the CLI command for the user to grant gateway access."""
        function_name = lambda_arn.split(':')[-1]
        return (
            f"aws lambda add-permission \\\n"
            f"  --function-name {function_name} \\\n"
            f"  --statement-id strands-vb-gw-invoke \\\n"
            f"  --action lambda:InvokeFunction \\\n"
            f"  --principal bedrock-agentcore.amazonaws.com \\\n"
            f"  --source-arn {role_arn} \\\n"
            f"  --region {self._region}"
        )

    async def verify_target_connection(self, gateway_id: str, target_id: str) -> Dict[str, Any]:
        """Check if a gateway target is ready and accessible."""
        self._init_clients()
        try:
            response = self._control_client.get_gateway_target(
                gatewayIdentifier=gateway_id,
                targetId=target_id
            )
            status = response.get('status', 'UNKNOWN')
            return {"status": status, "ready": status == "READY"}
        except Exception as e:
            return {"status": "ERROR", "ready": False, "error": str(e)}

    async def list_gateways(self, user_email: str = "") -> List[Dict[str, Any]]:
        """List gateways created by Visual Builder."""
        self._init_clients()
        response = self._control_client.list_gateways()

        gateways = []
        for gw in response.get('items', response.get('gateways', [])):
            # Filter by tag
            try:
                # Construct ARN if not provided
                gateway_arn = gw.get('gatewayArn', '')
                if not gateway_arn:
                    gw_id = gw.get('gatewayId', gw.get('name', ''))
                    gateway_arn = f"arn:aws:bedrock-agentcore:{self._region}:{self._account_id}:gateway/{gw_id}"
                
                tags = self._control_client.list_tags_for_resource(
                    resourceArn=gateway_arn
                ).get('tags', {})

                if tags.get('CreatedBy') == 'strands-visual-builder':
                    if not user_email or tags.get('Owner', '') == user_email:
                        gateways.append({
                            "gateway_id": gw.get('gatewayId', gw.get('name', '')),
                            "name": gw.get('name', ''),
                            "status": gw.get('status', 'UNKNOWN'),
                            "endpoint": f"https://{gw.get('gatewayId', gw.get('name', ''))}.gateway.bedrock-agentcore.{self._region}.amazonaws.com/mcp",
                            "owner": tags.get('Owner', ''),
                        })
            except Exception as e:
                logger.error(f"Failed to get tags for gateway {gw.get('gatewayId', '?')} with ARN {gateway_arn}: {e}")
                continue

        return gateways

    async def list_lambda_functions(self) -> List[Dict[str, Any]]:
        """List Lambda functions relevant to Visual Builder (strands-* prefix only)."""
        self._init_clients()

        functions = []
        paginator = self._lambda_client.get_paginator('list_functions')
        for page in paginator.paginate():
            for fn in page.get('Functions', []):
                # Only include functions with the strands- prefix
                if not fn.get('FunctionName', '').startswith('strands-'):
                    continue
                functions.append({
                    "function_name": fn['FunctionName'],
                    "function_arn": fn['FunctionArn'],
                    "runtime": fn.get('Runtime', 'unknown'),
                    "description": fn.get('Description', ''),
                    "last_modified": fn.get('LastModified', ''),
                })

        return functions

    async def list_gateway_targets(self, gateway_id: str) -> List[Dict[str, Any]]:
        """List targets for a gateway."""
        self._init_clients()
        response = self._control_client.list_gateway_targets(gatewayIdentifier=gateway_id)

        targets = []
        for target in response.get('targets', []):
            targets.append({
                "target_id": target.get('targetId', target.get('name', '')),
                "name": target.get('name', ''),
                "status": target.get('status', 'UNKNOWN'),
            })

        return targets

    async def _poll_gateway_status(self, gateway_id: str, max_wait: int = 120) -> str:
        """Poll gateway until ready or timeout."""
        start = time.time()
        while time.time() - start < max_wait:
            try:
                response = self._control_client.get_gateway(gatewayIdentifier=gateway_id)
                status = response.get('status', 'UNKNOWN')
                if status in ('READY', 'ACTIVE', 'FAILED'):
                    return status
            except Exception:
                pass
            await asyncio.sleep(5)
        return 'TIMEOUT'


gateway_management_service = GatewayManagementService()
