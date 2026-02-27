---
inclusion: always
---

# Strands Documentation Reference

## Official Documentation

- **Main Site**: https://strandsagents.com
- **Repository**: https://github.com/strands-agents/docs
- **Built with**: MkDocs

## Key Documentation Sections

### User Guide
- Quickstart guide
- Model providers configuration
- Agent loop concepts
- Tool development
- Streaming and callbacks

### API Reference
- Agent class documentation
- Tool decorator reference
- Model provider APIs
- MCP integration

### Examples and Tutorials
- Basic agent creation
- Custom tool development
- Multi-agent systems
- Production deployment

## Local Documentation Development

```bash
# Setup
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Build static site
mkdocs build

# Development server
mkdocs serve  # http://127.0.0.1:8000/
```

## Documentation Structure

```
docs/
├── user-guide/
│   ├── quickstart/
│   ├── concepts/
│   │   ├── model-providers/
│   │   ├── tools/
│   │   └── streaming/
│   └── examples/
├── api-reference/
│   ├── agent/
│   ├── tools/
│   └── models/
└── tutorials/
```

## Key Concepts from Documentation

### Agent Loop
1. **Input Processing** - User message handling
2. **Tool Selection** - LLM chooses appropriate tools
3. **Tool Execution** - Tools perform actions
4. **Response Generation** - LLM synthesizes results

### Model Providers
- Amazon Bedrock (default)
- Anthropic
- OpenAI
- Ollama
- LiteLLM
- Custom providers

### Tool Development
- `@tool` decorator pattern
- Type hints and docstrings
- Error handling
- Validation

### Streaming Support
- Callback handlers
- Async iterators
- Real-time updates
- Event processing

## Documentation for Visual Builder

The visual builder should reference:
- **Quickstart patterns** for code generation
- **Tool examples** for component library
- **Model configuration** for provider selection
- **Best practices** for validation and error handling