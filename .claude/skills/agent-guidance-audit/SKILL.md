---
name: agent-guidance-audit
description: >
  Audit a project's agent-facing guidance -- the instructions that LLM coding
  agents receive when they USE the project as a tool, library, API, or
  framework. Not the guidance for developing/contributing to the project itself
  (AGENTS.md, CONTRIBUTING.md), but what end-user agents are told to do when
  they consume the project's output. Use this skill whenever the user wants to
  review, audit, or improve the guidance their project gives to agent consumers,
  or when they ask "what do agents see when they use this?" Trigger on phrases
  like "agent guidance", "what do agents see", "review agent instructions",
  "audit agent-facing docs", or "how does my tool instruct agents".
---

# Agent Guidance Audit

Surface all guidance a project gives to LLM agents who are **consumers** of
its output, presented as labeled snippets with exact source references for
easy review and staleness detection.

## The key distinction

Every project has two audiences for its documentation:

- **Contributors**: agents working ON the project (build commands, test
  conventions, code style). Lives in AGENTS.md, CONTRIBUTING.md, etc.
- **Consumers**: agents using the project AS a tool. Lives in CLI help text,
  API docs, schema output, README usage sections, error messages, etc.

This skill focuses exclusively on the consumer side. If you encounter
contributor guidance while searching, note it exists but don't include it in
the output.

## Step 1: Identify what the project is and how agents consume it

Before searching, figure out what kind of project this is and how an agent
would interact with it. This determines where to look.

| Project type | Agent consumption mechanism | Where guidance likely lives |
|---|---|---|
| CLI tool | Shell commands, parsing output | --help text, man pages, schema output, error messages |
| Python/JS library | Import and call functions | Docstrings, type hints, README examples, API docs |
| REST API | HTTP requests | OpenAPI spec, endpoint docs, error responses |
| Framework | Scaffolding, config files | Getting-started guide, config schema, template comments |
| MCP server | Tool definitions | Tool descriptions, parameter schemas |
| GitHub Action | Workflow YAML | action.yml description, README usage |

If the project type or consumption mechanism is unclear, ask the user before
proceeding. A wrong assumption here wastes the entire search.

## Step 2: Search broadly for agent-facing guidance

Search across all surfaces where consumer-facing guidance might live. Cast a
wide net -- it's better to find something irrelevant than to miss something
important.

Typical surfaces to check:

- **CLI help/schema output**: Run the tool with --help, --agent, or similar
  flags. Check for structured schema output that embeds guidance.
- **README.md**: Usage sections, quickstart, examples. Skip the "Contributing"
  and "Development" sections.
- **API/library docs**: Docstrings on public functions, module-level docs,
  type annotations that encode constraints.
- **Error messages**: Grep for error strings -- good tools embed guidance in
  errors ("invalid status 'X', valid values: ...").
- **Schema files**: OpenAPI specs, JSON schemas, GraphQL schemas with
  descriptions.
- **Config templates**: Default configs with comments explaining valid values.
- **Inline guidance**: Constants, enums, or validation logic that defines what
  agents can/should do.

For each surface, note:
- Where the guidance lives (file:line or command)
- The exact text
- Whether it's prescriptive (do this), descriptive (this is how it works), or
  constraining (these are the valid values)

## Step 3: Present findings as labeled snippets

Group findings by source location. For each group, show the file path and
line numbers (or command used to generate the output), then quote the exact
guidance text. Use blockquotes for the verbatim text so the user can scan
for staleness, inaccuracies, or tone issues.

Format:

```
**Source label** (`file.py:42-58` or `command --flag`):

> Exact quoted guidance text here
> Continuing on next line

> Another piece of guidance from the same source
```

After presenting all snippets, add a brief summary noting:
- Total number of guidance surfaces found
- Any inconsistencies between sources (e.g., README says one thing, --help
  says another)
- Any gaps where you'd expect guidance but found none
- Whether the tone is consistent (prescriptive vs permissive, positive vs
  negative framing)

## Step 4: Confirm completeness with the user

After presenting findings, ask the user:
- Did you miss any surfaces where agents encounter this project?
- Are there guidance channels you haven't built yet but plan to?

This catches cases where the project has guidance mechanisms you couldn't
discover by searching (e.g., a Slack bot that serves help text, a web UI
with tooltips, runtime warnings).

## What NOT to include

- Build/test/lint instructions (contributor guidance)
- Code comments explaining implementation details
- Git history or changelog entries
- License text
- CI/CD configuration
- Internal architecture docs (unless they're exposed to consumers)
