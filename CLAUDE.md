# Requirements-Based Planning Workflow

## Overview

This mono repo uses a requirements-based planning system inspired by EARS (Easy Approach to Requirements Syntax) to maintain traceability from requirements → tests → code.

Each project in this mono repo can maintain its own specs when appropriate. All projects strictly adhere to **YAGNI** (You Aren't Gonna Need It) and **KISS** (Keep It Simple, Stupid) principles.

## When to Create Specs

### For New Projects

Create a `specs/` directory within a project when:

- Starting a new project with multiple non-trivial features
- Building something with clear acceptance criteria and testable behavior
- Implementing complex logic that needs comprehensive testing
- Working on projects that will evolve over time with multiple features

**Do NOT create specs for:**

- Simple utility scripts or tools (like pdf_to_jpegs)
- One-off automation scripts
- Trivial projects with < 3 meaningful features
- Projects that can be fully understood by reading the README

### For Features Within Existing Projects

Create a new spec subdirectory (e.g., `ProjectName/specs/feature-name/`) when:

- Adding a feature that involves multiple components
- Adding functionality that requires clear acceptance criteria
- Implementing complex business logic that needs comprehensive testing
- Working on features that will evolve over time

**Do NOT create specs for:**

- Trivial bug fixes
- Simple refactorings without behavior change
- Documentation-only changes
- Minor UI adjustments without new functionality

## File Structure

### Project-Level Specs

```
ProjectName/
├── specs/
│   ├── requirements.md   # For simple projects: single requirements file
│   ├── design.md         # Technical architecture (living document)
│   └── executive.md      # Status tracking (authoritative status source)
├── src/
└── README.md
```

### Multi-Feature Project Specs

```
ProjectName/
├── specs/
│   ├── feature-one/
│   │   ├── requirements.md   # EARS-formatted requirements (timeless, no status)
│   │   ├── design.md         # Technical architecture (living document)
│   │   └── executive.md      # Status tracking (authoritative status source)
│   └── feature-two/
│       ├── requirements.md
│       ├── design.md
│       └── executive.md
├── src/
└── README.md
```

**Note:** For projects with unified functionality (like SnippetManager), use project-level specs. Only create feature subdirectories if the project grows to have distinctly separate feature areas.

## Requirements Document Format (requirements.md)

### Template Structure

```markdown
# [Project/Feature Name]

## User Story

As a [user type], I need to [capability] so that [benefit].

## Requirements

### REQ-[ABBREV]-001: [User Benefit Title]

WHEN [trigger condition or user action]
THE SYSTEM SHALL [expected behavior]

WHEN [edge case or error condition]
THE SYSTEM SHALL [error handling behavior]

**Rationale:** [Why does the USER care? What user problem does this solve?]

**Dependencies:** REQ-[ABBREV]-002 (if applicable)

---

### REQ-[ABBREV]-002: [Next Requirement Title]

WHEN [condition]
THE SYSTEM SHALL [behavior]

**Rationale:** [User benefit explanation]

---
```

### EARS Format Rules

**Structure:** `WHEN [condition] THE SYSTEM SHALL [behavior]`

**Requirements:**

- Be specific and testable (avoid vague terms like "fast" or "user-friendly")
- Include error conditions and edge cases
- Define measurable criteria where applicable
- Use imperative language (SHALL, not "should" or "may")

**Rationale Guidelines:**

Every requirement rationale MUST answer: **"Why does the USER care about this?"** not "Why is this technically necessary?"

**Structure:** [User Benefit] + [Why it matters to user experience] + [Optional: What bad experience this prevents]

**Good Rationale (User Focused):**

```markdown
✅ "Users want to see 'where the action is' without waiting. Fast response enables
curiosity-driven browsing - users can quickly scan across regions to find
interesting weather activity. Slow responses would discourage exploration."
```

**Bad Rationale (Technical Focused):**

```markdown
❌ "Enables spatial discovery of cached weather data. The 500ms target ensures
responsive map interaction. WGS84 is the standard coordinate system."
```

**Test Questions:**

- Does this explain a user benefit or technical implementation?
- Would a non-technical user understand why this matters to THEM?
- Does this answer "so the user can..." or "because the system needs..."?

If rationale sounds like documentation for developers, rewrite for users.

**Good Examples:**

```markdown
✅ WHEN a client makes more than 10 token requests from the same IP within 1 hour
THE SYSTEM SHALL return HTTP 429 with X-RateLimit-Remaining: 0 header

✅ WHEN user submits form with invalid email format
THE SYSTEM SHALL display "Invalid email format" error below email field
```

**Bad Examples:**

```markdown
❌ THE SYSTEM SHALL be fast
❌ THE SYSTEM SHALL provide good error messages
❌ THE SYSTEM SHALL handle rate limiting
```

**Anti-Pattern Examples (Implementation Creeping In):**

```markdown
❌ WHEN a viewport query returns cached nowcasts
THE SYSTEM SHALL include geohash identifier, geographic center coordinates,
generation timestamp, confidence level, and time window identifier

Why bad: Specifies data structure (implementation detail). User doesn't care about "geohash identifier."

✅ WHEN displaying weather activity on the map
THE SYSTEM SHALL show for each location: the place on the map, when someone
last checked weather there, how confident the nowcast is, and location identifier

Why good: Describes user-visible information in user terms.
```

```markdown
❌ WHEN a viewport query is received
THE SYSTEM SHALL complete the query within 500ms by using geohash prefix queries

Why bad: Specifies HOW (geohash prefix queries) instead of just WHAT (performance target).

✅ WHEN a user explores a region by panning or zooming the map
THE SYSTEM SHALL update the displayed activity within 500ms to maintain a
fluid exploration experience

Why good: Focuses on user experience (fluid exploration), mentions performance target without specifying algorithm.
```

**Warning Signs:**

- Technical jargon in WHEN clause (viewport, geohash, API endpoint)
- Data structure field names (latitude, longitude, timestamp)
- Implementation details in SHALL clause (use Redis, query database)
- Rationales explaining "how" instead of "why the user cares"

### Requirement ID Format

Use immutable IDs: `REQ-[ABBREV]-###`

- **[ABBREV]**: Short abbreviation for project or feature (e.g., SM for SnippetManager, RL for Rate Limiting)
- **###**: Zero-padded sequential number (001, 002, etc.)
- **Once assigned, IDs are NEVER reused or changed**

Examples:

- `REQ-SM-001` - SnippetManager requirement #1
- `REQ-SM-015` - SnippetManager requirement #15
- `REQ-RL-001` - Rate Limiting feature requirement #1

### Requirement Titles

Requirement titles SHALL describe USER BENEFITS or OUTCOMES, not system features or technical mechanisms.

**Good Examples (User Benefit Focused):**

```markdown
✅ REQ-SM-001: View All Saved Snippets
✅ REQ-SM-006: Access Save Function from Any App
✅ REQ-SM-014: Insert Snippet Text
```

**Bad Examples (Implementation Focused):**

```markdown
❌ REQ-SM-001: Display List View with UserDefaults Data
❌ REQ-SM-006: Implement Share Extension
❌ REQ-SM-014: Use textDocumentProxy.insertText()
```

**Test:** Ask "Would a non-technical user understand what benefit this provides?" If no, rewrite.

## Design Document Format (design.md)

Document technical implementation details:

```markdown
# [Project/Feature Name] - Technical Design

## Architecture Overview

[High-level architecture diagram or description]

## Data Models

[Structs, classes, database schemas, data formats]

## Component Interactions

[Sequence diagrams, data flow descriptions]

## Error Handling Strategy

[How errors are detected, reported, and recovered]

## Testing Strategy

[Unit tests, integration tests, manual testing procedures]

## Security Considerations

[Authentication, authorization, data validation, privacy]

## Performance Considerations

[Caching, optimization strategies, performance targets]
```

## Executive Document Format (executive.md)

**Purpose:** Authoritative status tracking with executive summaries. Target persona: CTO of hard-tech startup (busy, no BS, wants essential facts).

**Key Principles:**

- Single source of truth for "where are we?"
- NO code snippets (zero tolerance)
- NO fluff ("tests run on every PR", etc.)
- All verification details folded into Status Summary table
- 250 words max for summaries
- Requirement titles in table (no need to look up IDs)

````markdown
# [Project/Feature Name] - Executive Summary

## Requirements Summary

[250 words max, user-focused: What problem does this solve? What can users do? What's the value proposition?]

## Technical Summary

[250 words max, architecture-focused: How is it built? Key technical decisions? Data flow? Design patterns?]

## Status Summary

| Requirement | Status | Notes |
|-------------|--------|-------|
| **REQ-[ABBREV]-001:** [Short Title] | ✅ Complete | Verified via [method] |
| **REQ-[ABBREV]-002:** [Short Title] | 🔄 In Progress | [Component] implemented, [other component] pending |
| **REQ-[ABBREV]-003:** [Short Title] | ⚠️ Manual Only | Manual verification documented |
| **REQ-[ABBREV]-004:** [Short Title] | ❌ Not Started | Planned for next iteration |

**Progress:** X of Y complete
````

**Status Legend:**
- ✅ Complete - Requirement fully implemented and verified
- 🔄 In Progress - Implementation underway
- ⏭️ Planned - Scheduled for future work
- ❌ Not Started - No work begun
- ⚠️ Manual Only - Requires manual verification
- 🟡 Functional - Works but has known gaps
- N/A - Not applicable to this project

## Workflow: Creating Specs for a New Project

### 1. Planning Phase

Create project and specs directory:

```bash
mkdir -p ProjectName/specs
cd ProjectName/specs
# Write requirements.md with EARS-formatted requirements (no status fields)
```

### 2. Design Phase

Create design.md:

- Document architecture decisions
- Define data models
- Specify component interactions
- Plan implementation approach per requirement

### 3. Executive Summary Phase

Create executive.md with status table and summaries (all requirements marked as not started initially).

### 4. Implementation Phase

Add requirement comments to code and document in design.md:

```swift
// REQ-SM-001: Display snippets sorted by timestamp
func loadSnippets() -> [Snippet] {
    // Implementation
}
```

Update design.md with implementation details per requirement (file locations, technical decisions).

### 5. Validation Phase

Update executive.md:

- Change status as implementation progresses (❌ → 🔄 → ✅)
- Document verification approach
- Note any gaps or limitations
- Keep requirements.md unchanged (it's timeless)

## Workflow: Updating Existing Specs

### Adding Requirements

1. Add new requirement to requirements.md with next sequential ID (no status field)
2. Add row to executive.md status table (initially ❌)
3. Update design.md with planned approach
4. Implement with `REQ-*` comments linking to requirements
5. Update executive.md status and notes

### Modifying Requirements

1. **NEVER change requirement IDs**
2. Update EARS statements in requirements.md if behavior changes (git shows history)
3. Update design.md implementation section
4. Update executive.md status and notes
5. Add deprecation note if requirement becomes obsolete:

   ```markdown
   ### REQ-[ABBREV]-003: [Old Requirement]

   **DEPRECATED:** Replaced by REQ-[ABBREV]-007

   [Original EARS statements preserved]
   ```

## Verification

### Traceability

Check traceability with ripgrep within a project:

```bash
# From project root, find all references to a requirement
rg "REQ-SM-001"

# Find all requirement comments in code
rg "// REQ-" src/
rg "# REQ-" src/
```

### Requirements Self-Check Before Committing

Before committing requirements.md, run this checklist on EACH requirement:

**User-Centricity Check:**

- [ ] Requirement title describes a user benefit, not a system feature
- [ ] WHEN clause describes user action or context, not system internals
- [ ] SHALL clause describes observable user outcome, not implementation
- [ ] Rationale answers "why does the user care?" not "how does it work?"
- [ ] A non-technical user could understand what value this provides

**Implementation-Creep Check:**

- [ ] No data structure field names (geohash, latitude, timestamp) in WHEN/SHALL
- [ ] No algorithm/technology names (Redis, geohash prefix query, HTTP endpoint)
- [ ] No "HOW" in requirements (that belongs in design.md)
- [ ] No code-like language or jargon

**Verifiability Check:**

- [ ] Observable behavior that can be verified
- [ ] Specific criteria (numbers, states, messages) not vague terms
- [ ] Clear success/failure conditions

**Red Flags - Rewrite if you see:**

- "The system SHALL return/include/store/cache..." (implementation language)
- Technical acronyms or protocols (WGS84, JWT, HTTP 429) without user context
- Requirement title ends in "-ing" (processing, caching, querying)
- Rationale mentions database, cache, algorithm, or data structure

**Green Flags - Good signs:**

- Requirement title starts with verb describing user action (View, Access, Insert, Enable)
- WHEN clause starts with "When a user..." or "When user..."
- SHALL clause describes what user sees/experiences
- Rationale uses words like: discover, explore, understand, feel, trust, verify

## Best Practices

### DO:

- Write requirements before implementation
- Use specific, measurable criteria in EARS statements
- Link code to requirements with `REQ-*` comments
- Keep requirement IDs immutable
- Update executive.md as implementation progresses
- Keep executive.md concise (no code snippets)
- Use git history for evolution tracking (no "Updated YYYY-MM-DD" notes)
- Apply YAGNI: Only create specs when they provide clear value
- Apply KISS: Keep specs simple and focused

### DON'T:

- Write vague requirements ("fast", "good UX")
- Reuse requirement IDs
- Add status fields to requirements.md (use executive.md for status)
- Document aspirational features in requirements.md
- Create specs for trivial projects or changes
- Let specs become stale
- Include code snippets in executive.md (zero tolerance)
- Add fluff to executive.md
- Over-engineer: Specs are a tool, not a religion

## Integration with Project Planning

### Project README vs specs/

- **README.md**: Project overview, setup instructions, usage examples, quick start
- **specs/**: Detailed requirements for non-trivial projects being actively developed or already implemented
  - **requirements.md**: Timeless requirements (no status)
  - **design.md**: Living technical documentation
  - **executive.md**: Authoritative status tracking (single source of truth)

### Git Workflow

Commit messages should reference requirement IDs:

```
Implement snippet saving (REQ-SM-009)

- Save snippet with type and timestamp
- Display confirmation message
- Auto-dismiss after 1 second

Implements: REQ-SM-008, REQ-SM-009
```

## Examples

See `SnippetManager/specs/` for a complete example of this system in practice:

- `requirements.md` - Pure EARS requirements with rationale (no status)
- `design.md` - Technical architecture and implementation details
- `executive.md` - Status tracking with executive summaries

This is a real iOS project with 24 requirements demonstrating:
- User-focused requirement titles
- Clear EARS format with testable conditions
- Separation of concerns (requirements vs design vs status)
- Immutable requirement IDs (REQ-SM-001 through REQ-SM-024)
