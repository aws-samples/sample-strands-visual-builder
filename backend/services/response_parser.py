# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

"""
Response parsing utilities for extracting code, text, and metadata from Strands agent responses.
Extracted from agent_service.py during refactor.
"""
import re
import logging

logger = logging.getLogger(__name__)


class ResponseParser:
    """Handles all response text extraction, code extraction, and metadata parsing."""

    def extract_response_text_properly(self, result) -> str:
        """
        Properly extract text from Strands agent response without escaping newlines.
        This is the ROOT CAUSE FIX - handles the response structure correctly.
        """
        if not hasattr(result, 'message'):
            return str(result)

        message = result.message

        # Case 1: Simple string message (ideal case)
        if isinstance(message, str):
            return message

        # Case 2: Dict-like structure with content
        if isinstance(message, dict):
            # Handle {'role': 'assistant', 'content': [...]} structure
            if 'content' in message:
                content = message['content']
                if isinstance(content, list) and len(content) > 0:
                    # Extract text from content blocks
                    text_parts = []
                    for block in content:
                        if isinstance(block, dict) and 'text' in block:
                            text_parts.append(block['text'])
                        elif isinstance(block, str):
                            text_parts.append(block)
                    return '\n'.join(text_parts) if text_parts else str(message)
                elif isinstance(content, str):
                    return content

            # Handle other dict structures
            if 'text' in message:
                return message['text']

        # Case 3: Object with content attribute
        if hasattr(message, 'content'):
            content = message.content
            if isinstance(content, list) and len(content) > 0:
                text_parts = []
                for block in content:
                    if hasattr(block, 'text'):
                        text_parts.append(block.text)
                    elif isinstance(block, dict) and 'text' in block:
                        text_parts.append(block['text'])
                    elif isinstance(block, str):
                        text_parts.append(block)
                return '\n'.join(text_parts) if text_parts else str(content)
            elif isinstance(content, str):
                return content

        # Case 4: Object with text attribute
        if hasattr(message, 'text'):
            return message.text

        # Fallback: convert to string (this is where escaping might happen)
        logger.warning(f"Unknown message structure: {type(message)}, falling back to str()")
        return str(message)

    def extract_code_with_fallbacks(self, response: str) -> dict:
        """Extract code using multiple fallback methods"""
        extraction_methods = [
            ("python_blocks", self._extract_python_blocks),
            ("generic_blocks", self._extract_generic_blocks),
            ("import_based", self._extract_import_based),
            ("pattern_matching", self._extract_pattern_matching)
        ]

        for method_name, method in extraction_methods:
            try:
                code = method(response)
                if code and len(code.strip()) > 50:  # Minimum viable code length
                    # With proper response extraction, this should not be needed
                    if '\\n' in code:
                        logger.error(f"CRITICAL: {method_name} extracted code with escape sequences - investigate extraction logic!")
                        # Don't fix it - let it fail to identify the issue

                    return {
                        "success": True,
                        "code": code,
                        "method": method_name,
                        "confidence": self._calculate_confidence(code)
                    }
            except Exception as e:
                logger.debug(f"Extraction method {method_name} failed: {e}")
                continue

        return {
            "success": False,
            "error": "All code extraction methods failed",
            "raw_response": response[:500]  # First 500 chars for debugging
        }

    def _extract_python_blocks(self, response: str) -> str:
        """Extract Python code from ```python``` blocks"""
        python_pattern = r'```python\s*\n(.*?)\n```'
        matches = re.findall(python_pattern, response, re.DOTALL | re.IGNORECASE)

        if matches:
            # Return the last (most complete) code block
            return matches[-1].strip()

        raise ValueError("No Python code blocks found")

    def _extract_generic_blocks(self, response: str) -> str:
        """Extract code from generic ``` blocks"""
        code_pattern = r'```\s*\n(.*?)\n```'
        matches = re.findall(code_pattern, response, re.DOTALL)

        if matches:
            # Filter for Python-like content
            for match in reversed(matches):
                if self._looks_like_python(match):
                    return match.strip()

        raise ValueError("No generic code blocks with Python content found")

    def _extract_import_based(self, response: str) -> str:
        """Extract code based on import statements"""
        import_pattern = r'(from strands.*?(?=\n\n|\Z))'
        matches = re.findall(import_pattern, response, re.DOTALL)

        if matches:
            return matches[-1].strip()

        raise ValueError("No import-based code found")

    def _extract_pattern_matching(self, response: str) -> str:
        """Extract code using pattern matching"""
        patterns = [
            r'(from strands import.*?(?=\n\n|\Z))',
            r'(import strands.*?(?=\n\n|\Z))',
            r'(Agent\(.*?\).*?(?=\n\n|\Z))'
        ]

        for pattern in patterns:
            matches = re.findall(pattern, response, re.DOTALL)
            if matches:
                return matches[-1].strip()

        raise ValueError("No pattern-based code found")

    def _looks_like_python(self, code: str) -> bool:
        """Check if code looks like Python"""
        python_indicators = [
            'from strands',
            'import strands',
            'Agent(',
            'def ',
            'class ',
            'if __name__'
        ]
        return any(indicator in code for indicator in python_indicators)

    def _calculate_confidence(self, code: str) -> float:
        """Calculate confidence score for extracted code"""
        confidence = 0.0

        if 'from strands' in code or 'import strands' in code:
            confidence += 0.3
        if 'Agent(' in code:
            confidence += 0.3
        if 'def ' in code or 'class ' in code:
            confidence += 0.2
        if '#' in code:
            confidence += 0.1
        if 'import' in code:
            confidence += 0.1

        return min(confidence, 1.0)

    def extract_metadata_from_freeform(self, response: str, code: str) -> dict:
        """Extract metadata from free-form response"""
        metadata = {
            "generation_method": "free_form",
            "response_length": len(response),
            "code_length": len(code),
            "extraction_method": "regex",
            "security_validated": True,
            "testing_completed": False,
            "configuration_analysis": "",
            "testing_verification": "",
            "reasoning_process": ""
        }

        # Extract configuration analysis
        analysis_pattern = r'(?:CONFIGURATION ANALYSIS|Analysis|ANALYSIS):\s*(.*?)(?=\n\n|\n[A-Z]|$)'
        analysis_match = re.search(analysis_pattern, response, re.DOTALL | re.IGNORECASE)
        if analysis_match:
            metadata["configuration_analysis"] = analysis_match.group(1).strip()

        # Extract testing verification
        testing_patterns = [
            r'(?:TESTING|TEST|VERIFICATION).*?:\s*(.*?)(?=\n\n|\n[A-Z]|$)',
            r'✅.*?passed.*?(.*?)(?=\n\n|\n[A-Z]|$)',
            r'❌.*?failed.*?(.*?)(?=\n\n|\n[A-Z]|$)'
        ]

        for pattern in testing_patterns:
            testing_match = re.search(pattern, response, re.DOTALL | re.IGNORECASE)
            if testing_match:
                metadata["testing_verification"] = testing_match.group(1).strip()
                metadata["testing_completed"] = True
                break

        # Extract reasoning process
        reasoning_pattern = r'(?:REASONING|APPROACH|IMPLEMENTATION):\s*(.*?)(?=\n\n|\n[A-Z]|$)'
        reasoning_match = re.search(reasoning_pattern, response, re.DOTALL | re.IGNORECASE)
        if reasoning_match:
            metadata["reasoning_process"] = reasoning_match.group(1).strip()

        return metadata

    def extract_s3_uris_from_response(self, response_text: str) -> dict:
        """Extract S3 URIs from expert agent response"""
        s3_uris = {}

        logger.debug(f"Response text preview (first 1000 chars): {response_text[:1000]}")

        s3_pattern = r's3://[a-zA-Z0-9\-\.]+/[a-zA-Z0-9\-\./]+'
        uris = re.findall(s3_pattern, response_text)

        logger.debug(f"Found S3 URIs in response: {uris}")

        for uri in uris:
            if 'pure_strands.py' in uri:
                s3_uris['pure_strands'] = uri
            elif 'agentcore_ready.py' in uri:
                s3_uris['agentcore_ready'] = uri
            elif 'requirements.txt' in uri:
                s3_uris['requirements'] = uri

        logger.info(f"Extracted S3 URIs: {s3_uris}")
        return s3_uris

    def cleanup_code_formatting(self, code: str) -> str:
        """Final cleanup to ensure proper code formatting"""
        if not code:
            return code

        if '\\n' in code or '\\t' in code or '\\"' in code or "\\'" in code:
            logger.error("CRITICAL: Code still contains escape sequences after proper extraction - this indicates a bug!")
            logger.error(f"Code preview: {code[:200]}...")

        # Normalize line endings
        code = code.replace('\r\n', '\n').replace('\r', '\n')

        # Remove excessive blank lines (more than 2 consecutive)
        code = re.sub(r'\n{3,}', '\n\n', code)

        # Ensure code ends with a single newline
        code = code.rstrip() + '\n'

        return code
