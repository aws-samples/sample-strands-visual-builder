# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

"""
Agent lifecycle management: initialization, model switching, health checks.
Extracted from agent_service.py during refactor.
"""
import logging
from pathlib import Path
from strands import Agent
from strands.models import BedrockModel
from strands_tools import (
    calculator,
    current_time,
    file_read,
    file_write,
    editor,
    journal,
    think
)
from services.config_service import config_service
from services.model_id_service import model_id_service

logger = logging.getLogger(__name__)

# These tools are imported at module level in agent_service.py and used during agent creation.
# We accept them as parameters to avoid circular imports.


class AgentLifecycleService:
    """Manages agent creation, model switching, and health status."""

    def __init__(self, tools: list = None):
        """
        Args:
            tools: List of tool functions to register with the agent.
                   Passed in from AgentService to avoid circular imports.
        """
        self.expert_agent = None
        self.current_model_id = None
        self.current_advanced_config = None
        self.system_prompt = None
        self._tools = tools or []

    def _get_agent_config(self) -> dict:
        """Get agent configuration from SSM with fallback defaults"""
        try:
            config = config_service.get_all_config()

            formatted_model_id = model_id_service.get_system_default_model_id()
            aws_region = config.get('REGION', 'us-east-1')

            return {
                'bedrock_model_id': formatted_model_id,
                'aws_region': aws_region,
                'bedrock_temperature': float(config.get('BEDROCK_TEMPERATURE', '0.3')),
                'agent_load_tools_from_directory': config.get('AGENT_LOAD_TOOLS_FROM_DIRECTORY', 'false').lower() == 'true',
                'strands_system_prompt': config.get('STRANDS_SYSTEM_PROMPT', 'You are a helpful AI assistant specialized in creating Strands agents.')
            }
        except Exception as e:
            logger.warning("Could not load agent config, using defaults")

            default_model_id = model_id_service.get_system_default_model_id()

            return {
                'bedrock_model_id': default_model_id,
                'aws_region': 'us-east-1',
                'bedrock_temperature': 0.3,
                'agent_load_tools_from_directory': False,
                'strands_system_prompt': 'You are a helpful AI assistant specialized in creating Strands agents.'
            }

    async def initialize(self):
        """Initialize the Strands expert agent with default model"""
        try:
            logger.info("Initializing expert agent")

            self.system_prompt = self._load_system_prompt()
            logger.info("System prompt loaded")

            agent_config = self._get_agent_config()
            await self._create_agent_with_model(agent_config['bedrock_model_id'])

            logger.info("Expert agent created successfully")

        except Exception as e:
            logger.error("Failed to create expert agent")
            self.expert_agent = None
            raise

    async def _create_agent_with_model(self, model_id: str, advanced_config: dict = None):
        """Create or recreate the expert agent with specified model and advanced features"""
        try:
            logger.info(f"Creating expert agent with model: {model_id}")

            config = advanced_config or {}
            enable_reasoning = config.get('enable_reasoning', False)
            enable_prompt_caching = config.get('enable_prompt_caching', False)

            agent_config = self._get_agent_config()

            model_config = {
                'model_id': model_id,
                'region_name': agent_config['aws_region'],
                'temperature': config.get('temperature', agent_config['bedrock_temperature'])
            }

            logger.info("Agent configured for free-form generation")

            if enable_reasoning:
                model_config['enable_reasoning'] = True
                logger.info("Reasoning tokens enabled")

            if enable_prompt_caching:
                model_config['enable_prompt_caching'] = True
                logger.info("Prompt caching enabled")

            model = BedrockModel(**model_config)

            system_prompt = self.system_prompt
            if enable_prompt_caching:
                system_prompt = self._add_caching_markers(system_prompt)

            self.expert_agent = Agent(
                model=model,
                system_prompt=system_prompt,
                tools=self._tools,
                load_tools_from_directory=agent_config['agent_load_tools_from_directory']
            )

            self.current_model_id = model_id
            self.current_advanced_config = config

            logger.info(f"Expert agent initialized successfully with {model_id}")

        except Exception as e:
            logger.error(f"❌ Failed to create expert agent with model {model_id}: {e}")
            raise

    def _load_system_prompt(self) -> str:
        """Load system prompt from the markdown file"""
        try:
            prompt_file = Path(__file__).parent.parent / "strands-visual-builder-system-prompt.md"

            with open(prompt_file, 'r', encoding='utf-8') as f:
                return f.read()

        except FileNotFoundError:
            logger.warning(f"System prompt file not found at {prompt_file}")
            agent_config = self._get_agent_config()
            return agent_config['strands_system_prompt']
        except Exception as e:
            logger.error(f"Error loading system prompt: {e}")
            agent_config = self._get_agent_config()
            return agent_config['strands_system_prompt']

    def _ensure_correct_model(self, requested_model_id: str):
        """Update agent model if different from current using Strands update_config() method"""
        if not requested_model_id:
            return

        if requested_model_id == self.current_model_id:
            return

        formatted_model_id = model_id_service.format_model_for_cris(requested_model_id)

        if formatted_model_id != self.current_model_id:
            try:
                logger.info(f"Dynamic model switching: {self.current_model_id} -> {formatted_model_id}")

                if self.expert_agent and hasattr(self.expert_agent, 'model'):
                    self.expert_agent.model.update_config(model_id=formatted_model_id)
                    self.current_model_id = formatted_model_id

                    logger.info(f"Model switched successfully to {formatted_model_id} (no container restart required)")
                else:
                    logger.warning("Expert agent not initialized, cannot switch model")

            except Exception as e:
                logger.error(f"❌ Failed to switch model from {self.current_model_id} to {formatted_model_id}: {e}")
        else:
            logger.debug(f"Model already set to {formatted_model_id}, reusing existing agent instance")

    def get_agent(self, model_id: str = None, advanced_config: dict = None) -> Agent:
        """Get the expert agent instance, optionally switching models or updating config"""
        config_changed = advanced_config and advanced_config != self.current_advanced_config
        model_changed = model_id and model_id != self.current_model_id

        if model_changed or config_changed:
            logger.info(f"Updating expert agent - Model: {model_id}, Config changed: {config_changed}")
            try:
                self._create_agent_with_model_sync(model_id or self.current_model_id, advanced_config)
            except Exception as e:
                logger.error(f"Failed to update agent: {e}")

        return self.expert_agent

    def _create_agent_with_model_sync(self, model_id: str, advanced_config: dict = None):
        """Create or recreate the expert agent with specified model and advanced features (synchronous version)"""
        try:
            logger.info(f"Creating expert agent with model: {model_id}")

            config = advanced_config or {}
            enable_reasoning = config.get('enable_reasoning', False)
            enable_prompt_caching = config.get('enable_prompt_caching', False)

            agent_config = self._get_agent_config()

            model_config = {
                'model_id': model_id,
                'region_name': agent_config['aws_region'],
                'temperature': config.get('temperature', agent_config['bedrock_temperature']),
            }

            logger.info("Agent configured for free-form generation")

            if enable_reasoning:
                model_config['enable_reasoning'] = True
                logger.info("Reasoning tokens enabled")

            if enable_prompt_caching:
                model_config['enable_prompt_caching'] = True
                logger.info("Prompt caching enabled")

            model = BedrockModel(**model_config)

            system_prompt = self.system_prompt
            if enable_prompt_caching:
                system_prompt = self._add_caching_markers(system_prompt)

            self.expert_agent = Agent(
                model=model,
                system_prompt=system_prompt,
                tools=self._tools,
                load_tools_from_directory=agent_config['agent_load_tools_from_directory']
            )

            self.current_model_id = model_id
            self.current_advanced_config = config
            logger.info(f"Expert agent switched to model: {model_id}")

        except Exception as e:
            logger.error(f"❌ Failed to create expert agent with model {model_id}: {e}")
            raise

    def _add_caching_markers(self, system_prompt: str) -> str:
        """Add prompt caching markers to system prompt for cost optimization"""
        cached_prompt = f"""<cache_control>
{system_prompt}
</cache_control>

This system prompt is cached for performance optimization."""
        return cached_prompt

    def is_ready(self) -> bool:
        """Check if the agent is ready"""
        return self.expert_agent is not None

    def get_agent_info(self) -> dict:
        """Get information about the expert agent"""
        if not self.is_ready():
            return {"status": "not_ready"}

        config = self.current_advanced_config or {}

        return {
            "model": self.current_model_id or "Unknown",
            "model_id": self.current_model_id,
            "tools_count": len(self.expert_agent.tools) if hasattr(self.expert_agent, 'tools') else 0,
            "advanced_features": {
                "structured_output": False,
                "free_form_generation": True,
                "reasoning_enabled": config.get('enable_reasoning', False),
                "prompt_caching": config.get('enable_prompt_caching', False),
                "runtime_switching": config.get('runtime_model_switching', False)
            },
            "capabilities": [
                "Visual configuration analysis",
                "Strands code generation",
                "Architecture pattern implementation",
                "Best practice application",
                "Error handling and validation",
                "Advanced Bedrock features",
                "Free-form code generation",
                "Security validation"
            ],
            "status": "ready"
        }
