# Strands Multi-Agent Patterns Reference

## Overview

Strands provides multiple sophisticated patterns for multi-agent coordination, each optimized for different use cases:

1. **Agents as Tools** - Hierarchical delegation with specialized agents as callable functions
2. **Swarm** - Self-organizing collaborative teams with shared context
3. **Graph (DAG)** - Deterministic workflows with explicit dependencies
4. **Sequential Workflows** - Simple linear processing chains
5. **A2A Protocol** - Cross-platform agent communication
6. **Dynamic Tools** - Runtime creation of multi-agent systems

## When to Use Each Pattern

### Agents as Tools
**Best for:** Clear hierarchical delegation, specialized expertise, simple coordination
**Use when:** You have distinct specialized tasks and a clear orchestrator role

```python
# Orchestrator routes to specialists
orchestrator -> research_agent
orchestrator -> code_agent  
orchestrator -> review_agent
```

### Swarm
**Best for:** Collaborative problem-solving, autonomous coordination, complex tasks requiring multiple perspectives
**Use when:** Agents need to work together dynamically and hand off tasks based on expertise

```python
# Agents collaborate autonomously with shared context
researcher <-> analyst <-> writer <-> reviewer
```

### Graph (DAG)
**Best for:** Deterministic workflows, clear dependencies, parallel processing, complex pipelines
**Use when:** You need guaranteed execution order and explicit dependency management

```python
# Deterministic execution with dependencies
research -> analysis -> report
research -> fact_check -> report
```

### Sequential Workflows
**Best for:** Simple linear processes, explicit control, step-by-step execution
**Use when:** Tasks must happen in strict order with manual control over each step

```python
# Linear execution with explicit control
step1 -> step2 -> step3 -> step4
```

## Pattern Implementations

### 1. Agents as Tools Pattern

Create specialized agents as callable tools:

```python
from strands import Agent, tool

@tool
def research_assistant(query: str) -> str:
    """Specialized research agent for factual information."""
    agent = Agent(
        system_prompt="You are a research specialist focused on factual information.",
        tools=[retrieve, http_request]
    )
    return str(agent(query))

@tool
def code_assistant(task: str) -> str:
    """Specialized coding agent for development tasks."""
    agent = Agent(
        system_prompt="You are a coding specialist focused on implementation.",
        tools=[python_repl, file_read, file_write]
    )
    return str(agent(task))

# Orchestrator with specialist tools
orchestrator = Agent(
    system_prompt="Route tasks to appropriate specialists based on the request type.",
    tools=[research_assistant, code_assistant]
)

# Automatic routing to specialists
result = orchestrator("Research Python best practices and implement a sample function")
```

**Key Features:**
- Clear separation of concerns
- Hierarchical delegation
- Simple tool-based interface
- Automatic specialist selection

### 2. Swarm Pattern

Self-organizing collaborative teams:

```python
from strands import Agent
from strands.multiagent import Swarm

# Create specialized team members
researcher = Agent(name="researcher", system_prompt="Research specialist...")
architect = Agent(name="architect", system_prompt="System design specialist...")
coder = Agent(name="coder", system_prompt="Implementation specialist...")
reviewer = Agent(name="reviewer", system_prompt="Code review specialist...")

# Create collaborative swarm
swarm = Swarm(
    [researcher, architect, coder, reviewer],
    max_handoffs=20,
    max_iterations=20,
    execution_timeout=900.0
)

# Agents collaborate autonomously
result = swarm("Design and implement a microservices architecture for an e-commerce platform")
```

**Key Features:**
- Autonomous agent coordination
- Shared working memory
- Dynamic task handoffs
- Emergent collaboration patterns
- Built-in safety mechanisms

**Swarm Configuration:**
- `max_handoffs`: Maximum agent-to-agent transfers
- `max_iterations`: Total execution limit
- `execution_timeout`: Overall time limit
- `node_timeout`: Per-agent time limit
- `repetitive_handoff_detection_window`: Prevent ping-pong behavior

### 3. Graph (DAG) Pattern

Deterministic workflows with dependencies:

```python
from strands import Agent
from strands.multiagent import GraphBuilder

# Create workflow agents
data_collector = Agent(name="collector", system_prompt="Data collection specialist...")
data_processor = Agent(name="processor", system_prompt="Data processing specialist...")
analyzer = Agent(name="analyzer", system_prompt="Data analysis specialist...")
reporter = Agent(name="reporter", system_prompt="Report generation specialist...")

# Build dependency graph
builder = GraphBuilder()
builder.add_node(data_collector, "collect")
builder.add_node(data_processor, "process")
builder.add_node(analyzer, "analyze")
builder.add_node(reporter, "report")

# Define execution dependencies
builder.add_edge("collect", "process")    # process depends on collect
builder.add_edge("process", "analyze")    # analyze depends on process
builder.add_edge("analyze", "report")     # report depends on analyze

# Optional: Add parallel branches
builder.add_node(validator, "validate")
builder.add_edge("collect", "validate")   # validate runs parallel to process
builder.add_edge("validate", "report")    # both feed into report

graph = builder.build()

# Execute deterministic workflow
result = graph("Collect sales data, process it, analyze trends, and generate a report")
```

**Key Features:**
- Deterministic execution order
- Parallel processing where possible
- Clear dependency management
- Input/output propagation
- Conditional edge traversal

**Graph Topologies:**
- **Sequential Pipeline**: A -> B -> C -> D
- **Parallel Processing**: A -> [B,C,D] -> E
- **Branching Logic**: A -> B (if condition) or C (if other condition)

### 4. Sequential Workflow Pattern

Explicit step-by-step control:

```python
from strands import Agent

# Create pipeline agents
extractor = Agent(system_prompt="Extract data from sources...")
transformer = Agent(system_prompt="Transform and clean data...")
loader = Agent(system_prompt="Load data into target systems...")

def etl_pipeline(source_data):
    """Explicit ETL pipeline with manual control."""
    
    # Step 1: Extract
    print("Step 1: Extracting data...")
    extracted = extractor(f"Extract data from: {source_data}")
    
    # Step 2: Transform
    print("Step 2: Transforming data...")
    transformed = transformer(f"Transform this data: {extracted}")
    
    # Step 3: Load
    print("Step 3: Loading data...")
    result = loader(f"Load this transformed data: {transformed}")
    
    return result

# Execute with full control
final_result = etl_pipeline("customer_database.csv")
```

**Key Features:**
- Explicit execution control
- Step-by-step monitoring
- Easy debugging and intervention
- Simple error handling
- Clear progress tracking

### 5. A2A Protocol Integration

Cross-platform agent communication:

```python
from strands import Agent
from strands.multiagent.a2a import A2AServer
from strands_tools.a2a_client import A2AClientToolProvider

# Server: Expose your agent via A2A protocol
calculator_agent = Agent(
    name="Calculator Agent",
    description="Performs mathematical calculations",
    tools=[calculator]
)

a2a_server = A2AServer(agent=calculator_agent, port=9000)
a2a_server.serve()

# Client: Connect to other A2A agents
provider = A2AClientToolProvider(
    known_agent_urls=["http://127.0.0.1:9000", "http://other-agent:8080"]
)

coordinator = Agent(
    tools=provider.tools,
    system_prompt="Coordinate with other A2A agents to solve complex problems."
)

# Discover and use external agents
result = coordinator("Find available agents and use them to solve this math problem: 25 * 48 + sqrt(144)")
```

**Key Features:**
- Cross-platform compatibility
- Agent discovery and communication
- Standardized protocol
- Distributed agent networks
- Streaming and non-streaming support

### 6. Dynamic Multi-Agent Tools

Runtime creation of agent teams:

```python
from strands import Agent
from strands_tools import swarm, graph, workflow

# Meta-agent that creates other agent systems
meta_agent = Agent(
    tools=[swarm, graph, workflow],
    system_prompt="Create and orchestrate teams of specialized agents dynamically."
)

# Dynamically create swarms
swarm_result = meta_agent("Create a swarm of agents to research, analyze, and summarize quantum computing advances")

# Dynamically create graphs  
graph_result = meta_agent("Create a workflow graph to process customer feedback: collect -> analyze -> categorize -> respond")

# Dynamically create workflows
workflow_result = meta_agent("Create a workflow to handle support tickets with priority-based task assignment")
```

**Available Dynamic Tools:**
- `swarm`: Creates collaborative agent teams
- `graph`: Creates deterministic DAG workflows  
- `workflow`: Creates managed task workflows with dependencies

## Advanced Features

### Multi-Modal Support

All patterns support multi-modal inputs:

```python
from strands.types.content import ContentBlock

# Multi-modal input with text and images
content_blocks = [
    ContentBlock(text="Analyze this architectural diagram:"),
    ContentBlock(image={"format": "png", "source": {"bytes": image_bytes}})
]

# Works with any pattern
swarm_result = swarm(content_blocks)
graph_result = graph(content_blocks)
```

### Nested Patterns

Combine patterns for complex architectures:

```python
# Use a Swarm as a node in a Graph
research_swarm = Swarm([researcher1, researcher2, researcher3])
analysis_agent = Agent(system_prompt="Analyze research results...")

builder = GraphBuilder()
builder.add_node(research_swarm, "research_team")  # Swarm as a node
builder.add_node(analysis_agent, "analysis")
builder.add_edge("research_team", "analysis")

hybrid_graph = builder.build()
```

### Custom Node Types

Create custom nodes for deterministic logic:

```python
from strands.multiagent.base import MultiAgentBase

class ValidationNode(MultiAgentBase):
    """Custom node for data validation."""
    
    def __init__(self, validation_rules):
        super().__init__()
        self.rules = validation_rules
    
    async def invoke_async(self, task, **kwargs):
        # Deterministic validation logic
        result = self.validate_data(task)
        return self.create_result(result)

# Use in graph
validator = ValidationNode(rules=["check_format", "validate_schema"])
builder.add_node(validator, "validator")
```

## Best Practices

### Pattern Selection Decision Tree

Use this systematic approach to choose the right multi-agent pattern:

#### 1. **Analyze Connection Topology**
- **Hub-and-Spoke** (one agent connects to many, specialists don't interconnect) → **Agents as Tools**
- **Linear Chain** (A → B → C → D) → **Sequential Workflow** 
- **Complex Dependencies** (parallel branches, multiple inputs/outputs) → **Graph (DAG)**
- **Collaborative Network** (complex interconnections, no clear hierarchy) → **Swarm**

#### 2. **Consider Complexity Factors**
- **Agent Count**: < 3 agents → Sequential or Agents as Tools; > 5 agents → Graph or Swarm
- **Connection Density**: Few connections → Sequential; Many connections → Graph or Swarm
- **Branching**: Multiple parallel paths → Graph; Single path → Sequential
- **Coordination Need**: High collaboration → Swarm; Deterministic flow → Graph

#### 3. **Match Use Case Requirements**
- **Need explicit control over execution order** → Graph (DAG) or Sequential
- **Want autonomous agent collaboration** → Swarm
- **Have clear specialist roles** → Agents as Tools
- **Simple step-by-step process** → Sequential Workflow

#### 4. **Progressive Complexity Approach**
1. **Start simple**: Use Agents as Tools for basic delegation
2. **Add dependencies**: Move to Sequential for linear processes  
3. **Scale complexity**: Use Graph for complex dependencies
4. **Enable collaboration**: Use Swarm for autonomous coordination

### Pattern Selection Examples

#### Example 1: Research and Report Generation
```
Visual: Orchestrator → Researcher, Orchestrator → Analyst, Orchestrator → Writer
Pattern: Agents as Tools (hub-and-spoke topology)
Reason: Clear specialist roles, no inter-specialist dependencies
```

#### Example 2: Data Processing Pipeline  
```
Visual: Collector → Processor → Analyzer → Reporter
Pattern: Sequential Workflow (linear chain)
Reason: Simple linear flow, each step depends on previous
```

#### Example 3: Complex Analysis Workflow
```
Visual: Data_Collector → [Processor_A, Processor_B] → Merger → Reporter
       Data_Collector → Validator → Reporter  
Pattern: Graph (DAG) (parallel branches with dependencies)
Reason: Parallel processing with complex dependencies
```

#### Example 4: Collaborative Problem Solving
```
Visual: Researcher ↔ Analyst ↔ Critic ↔ Writer (interconnected)
Pattern: Swarm (collaborative network)
Reason: Agents need to collaborate dynamically and hand off tasks
```

### Performance Optimization
1. **Parallel execution**: Use Graph for independent tasks
2. **Resource limits**: Set appropriate timeouts and iteration limits
3. **Caching**: Reuse agent instances where possible
4. **Monitoring**: Track execution metrics and performance

### Error Handling
1. **Graceful degradation**: Handle individual agent failures
2. **Retry mechanisms**: Implement automatic retries for transient failures
3. **Circuit breakers**: Prevent cascading failures
4. **Monitoring**: Track agent health and performance metrics

### Security Considerations
1. **Input validation**: Validate all inputs to agents
2. **Output sanitization**: Clean agent outputs before use
3. **Access control**: Limit agent capabilities appropriately
4. **Audit logging**: Track all agent interactions

## Migration Patterns

### From Single Agent to Multi-Agent

```python
# Before: Single agent doing everything
monolithic_agent = Agent(
    tools=[research_tool, analysis_tool, report_tool],
    system_prompt="Handle all aspects of research and reporting"
)

# After: Specialized agents with orchestration
research_agent = Agent(tools=[research_tool], system_prompt="Research specialist")
analysis_agent = Agent(tools=[analysis_tool], system_prompt="Analysis specialist") 
report_agent = Agent(tools=[report_tool], system_prompt="Report specialist")

# Choose appropriate pattern based on needs
swarm = Swarm([research_agent, analysis_agent, report_agent])  # Collaborative
# OR
graph = create_sequential_graph([research_agent, analysis_agent, report_agent])  # Deterministic
```

### From Sequential to Parallel

```python
# Before: Sequential execution
def sequential_process(data):
    step1 = agent1(data)
    step2 = agent2(step1)
    step3 = agent3(step2)
    return step3

# After: Parallel where possible
builder = GraphBuilder()
builder.add_node(agent1, "step1")
builder.add_node(agent2a, "step2a")  # Can run in parallel
builder.add_node(agent2b, "step2b")  # Can run in parallel
builder.add_node(agent3, "step3")

builder.add_edge("step1", "step2a")
builder.add_edge("step1", "step2b")
builder.add_edge("step2a", "step3")
builder.add_edge("step2b", "step3")

parallel_graph = builder.build()
```

This comprehensive reference covers all major multi-agent patterns in Strands, helping you choose and implement the right approach for your specific use case.