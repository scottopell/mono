# Requirements-Based Planning Strategy

## Table of Contents

- [Overview](#overview)
- [Why This System?](#why-this-system)
- [EARS Format Guide](#ears-format-guide)
- [File Structure](#file-structure)
- [Workflow](#workflow)
- [Traceability](#traceability)
- [Migration Strategy](#migration-strategy)
- [Examples](#examples)
- [FAQ](#faq)

## Overview

This project uses a **requirements-based planning system** inspired by EARS (Easy Approach to Requirements Syntax) and the Kiro Code application. The system provides explicit traceability from business requirements → acceptance tests → implementation code.

### Core Principles

1. **Requirements First**: Define what needs to be built before writing tests or code
2. **Testable Specifications**: Every requirement must be verifiable through automated tests
3. **Immutable Traceability**: Requirements get permanent IDs that never change
4. **Living Documentation**: Specs evolve with the codebase, not separate artifacts

### The Three-Document Pattern

Each feature gets a `specs/feature-name/` directory with:

```
specs/feature-name/
├── requirements.md   # WHAT to build (EARS format, immutable IDs, timeless)
├── design.md         # HOW to build it (architecture, implementation, living)
└── executive.md      # WHERE are we (status tracking, executive summaries, authoritative)
```

## Why This System?

### Problems It Solves

**Problem 1: "Why did we build this?"**

- Without documented requirements, future maintainers don't understand intent
- Code comments describe "what" not "why"
- Git history provides implementation details, not business context

**Solution:** `requirements.md` captures business need and acceptance criteria

**Problem 2: "Is this feature complete?"**

- No clear definition of "done"
- Edge cases discovered in production
- Test coverage is unclear

**Solution:** EARS format provides testable acceptance criteria, `executive.md` tracks status

**Problem 3: "What will break if I change this?"**

- Hard to find all code related to a feature
- Tests don't clearly indicate what requirement they validate
- Refactoring is risky without understanding dependencies

**Solution:** Requirement IDs create grep-able links between requirements, tests, and code

**Problem 4: "What tests do I need to write?"**

- Easy to miss edge cases
- Tests written after code may just verify current behavior
- No systematic approach to test planning

**Solution:** EARS statements directly translate to test cases (one WHEN/SHALL = one test)

### Benefits Over Previous Approach

**Before (Journey-based approach):**

- ✅ Good: User journey concept with personas
- ✅ Good: Comprehensive validation documents
- ⚠️ Limitation: Journey numbers informal, can shift
- ⚠️ Limitation: Documentation often written after implementation
- ⚠️ Limitation: No machine-verifiable traceability
- ⚠️ Limitation: PLAN.md cleared after completion (lost context)

**After (Requirements-based with specs/):**

- ✅ Preserves: User journey concept
- ✅ Preserves: Comprehensive documentation
- ✅ Adds: Immutable requirement IDs (REQ-RL-001)
- ✅ Adds: Requirements written before implementation
- ✅ Adds: Grep-able traceability (rg "REQ-RL-001")
- ✅ Adds: Permanent historical record

## EARS Format Guide

EARS (Easy Approach to Requirements Syntax) was developed at Rolls-Royce for aviation systems. It provides a simple, consistent structure for writing unambiguous requirements.

### Basic Structure

```
WHEN [trigger condition]
THE SYSTEM SHALL [expected behavior]
```

### The Five EARS Patterns

#### 1. **Ubiquitous Requirements** (Always true)

```markdown
THE SYSTEM SHALL validate email format before account creation
THE SYSTEM SHALL encrypt passwords using bcrypt
```

#### 2. **Event-Driven Requirements** (State changes)

```markdown
WHEN user clicks "Submit" button
THE SYSTEM SHALL validate form fields

WHEN API returns 500 error
THE SYSTEM SHALL retry request up to 3 times
```

#### 3. **State-Driven Requirements** (Conditional behavior)

```markdown
WHILE user is authenticated
THE SYSTEM SHALL display logout button

WHILE request queue is full
THE SYSTEM SHALL return 503 Service Unavailable
```

#### 4. **Unwanted Behavior** (Explicit prohibitions)

```markdown
IF user quota is exhausted
THE SYSTEM SHALL NOT process new LLM requests

IF authentication token is invalid
THE SYSTEM SHALL NOT return sensitive data
```

#### 5. **Optional Features** (Configurable behavior)

```markdown
WHERE cache is enabled
THE SYSTEM SHALL return cached data within 100ms

WHERE analysis mode is set to "premium"
THE SYSTEM SHALL include extended forecast analysis
```

### Writing Good EARS Requirements

#### ✅ Good Examples

**Specific and Measurable:**

```markdown
WHEN user makes 11th token request from same IP within 1 hour
THE SYSTEM SHALL return HTTP 429 with X-RateLimit-Remaining: 0 header
```

**Error Conditions Explicit:**

```markdown
WHEN LLM API returns 503 error
THE SYSTEM SHALL send SSE event with type: error and message: "Service temporarily unavailable"
```

**Edge Cases Covered:**

```markdown
WHEN rate limit resets at hour boundary
THE SYSTEM SHALL allow new requests from previously blocked IPs

WHEN user requests nowcast at exact midnight UTC
THE SYSTEM SHALL use current day's quota, not previous day
```

#### ❌ Bad Examples

**Vague:**

```markdown
❌ THE SYSTEM SHALL be fast
✅ THE SYSTEM SHALL return nowcast data within 2 seconds for cached locations
```

**Ambiguous:**

```markdown
❌ THE SYSTEM SHALL handle errors gracefully
✅ WHEN database connection fails, THE SYSTEM SHALL return HTTP 503 with retry-after: 60
```

**Not Testable:**

```markdown
❌ THE SYSTEM SHALL provide good user experience
✅ WHEN form validation fails, THE SYSTEM SHALL display error message within 100ms
```

**Implementation Detail (belongs in design.md):**

```markdown
❌ THE SYSTEM SHALL use Redis for rate limiting storage
✅ THE SYSTEM SHALL persist rate limit state across server restarts
```

## File Structure

### Directory Organization

```
specs/
  newspaper/
    requirements.md
    design.md
    executive.md
  rate-limiting/
    requirements.md
    design.md
    executive.md
  current-conditions/
    requirements.md
    design.md
    executive.md
```

### Feature Naming Conventions

Use **kebab-case** for directory names:

- `rate-limiting` (not `RateLimiting` or `rate_limiting`)
- `current-conditions` (not `currentConditions`)
- `nowcast-streaming` (not `nowcast_streaming`)

Match feature names to user-facing concepts when possible:

- ✅ `quota-visibility` - Clear business feature
- ⚠️ `redis-storage` - Implementation detail, not a feature
- ✅ `location-search` - User-facing capability

### requirements.md Template

```markdown
# [Feature Name]

## User Story

As a [user type], I need to [capability] so that [benefit].

## Requirements

### REQ-[ABBREV]-001: [User Benefit Title]

WHEN [condition]
THE SYSTEM SHALL [behavior]

WHEN [edge case]
THE SYSTEM SHALL [error handling]

**Rationale:** [Why does the USER care? What user problem does this solve?]

**Dependencies:** REQ-[ABBREV]-002 (if applicable)

---

### REQ-[ABBREV]-002: [Next Requirement]

WHEN [condition]
THE SYSTEM SHALL [behavior]

**Rationale:** [User benefit explanation]

---
```

**Key Principles:**

- NO status fields (status lives in executive.md)
- NO test coverage sections (coverage lives in executive.md)
- NO implementation sections (implementation lives in design.md)
- Git history shows evolution (no "Updated YYYY-MM-DD" notes)
- Requirements can be added, modified, or deprecated (ID never changes)

### design.md Template

```markdown
# [Feature Name] - Technical Design

## Architecture Overview

[High-level description of how components interact]

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Frontend   │────▶│  API Layer   │────▶│   Storage    │
│  Component  │     │  Middleware  │     │   (Redis)    │
└─────────────┘     └──────────────┘     └──────────────┘
```

## Data Models

### Rust Structures
```rust
pub struct RateLimitInfo {
    pub limit: u32,
    pub remaining: u32,
    pub reset_at: DateTime<Utc>,
}
```

### TypeScript Interfaces
```typescript
interface RateLimitResponse {
    limit: number;
    remaining: number;
    resetAt: string;
}
```

## API Endpoints

### GET /api/v1/auth/token/anonymous

**Purpose:** Generate anonymous authentication token

**Rate Limiting:** 10 requests per hour per IP (REQ-RL-001)

**Request:**
- Headers: None required
- Body: None

**Response (200 OK):**
```json
{
  "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "expiresAt": "2025-01-03T12:00:00Z"
}
```

**Response (429 Too Many Requests):**
```json
{
  "error": "Rate limit exceeded",
  "error_code": "RATE_LIMIT_EXCEEDED",
  "retry_after": 3456
}
```

**Headers:**
- X-RateLimit-Limit: 10
- X-RateLimit-Remaining: 0
- Retry-After: 3456

## Component Interactions

[Sequence diagrams, data flow descriptions]

## Error Handling Strategy

| Error Condition | HTTP Status | Error Code | Client Action |
|----------------|-------------|------------|---------------|
| Rate limit exceeded | 429 | RATE_LIMIT_EXCEEDED | Retry after delay |
| Quota exhausted | 402 | LLM_QUOTA_EXCEEDED | Upgrade or wait |
| Storage failure | 503 | SERVICE_UNAVAILABLE | Retry with backoff |

## Testing Strategy

**Unit Tests:** Test rate limiting logic in isolation with mock storage
**E2E Tests:** Test complete user flows with production Docker image (includes Redis integration testing)

## Security Considerations

- IP address extraction from X-Forwarded-For header
- Token validation using JWT with expiration
- Rate limit bypass prevention (no cache headers)

## Performance Considerations

- Redis operations complete in <10ms for rate limit checks
- Token generation cached for repeated requests
- Rate limit state stored with TTL matching window
```

### executive.md Template

**Purpose:** Authoritative status tracking with executive summaries. Target persona: CTO of hard-tech startup (busy, no BS, wants essential facts).

```markdown
# [Feature Name] - Executive Summary

## Requirements Summary

[250 words max, user-focused: What problem does this solve? What can users do? What's the value proposition?]

## Technical Summary

[250 words max, architecture-focused: How is it built? Key technical decisions? Data flow? API design?]

## Status Summary

| Requirement | Backend | Frontend | Testing | Verification & Gaps |
|-------------|---------|----------|---------|---------------------|
| **REQ-[ABBREV]-001:** [Short Title] | ✅ | ✅ | ✅ E2E | E2E test simulates [scenario], verifies [outcome] (`test.spec.ts`) |
| **REQ-[ABBREV]-002:** [Short Title] | 🔄 | ❌ | ⏭️ | Manual procedure in OPERATIONS.md. Gap: No automated test |
| **REQ-[ABBREV]-003:** [Short Title] | ✅ | N/A | ⚠️ Manual | Manual verification only (operational feature) |
| **REQ-[ABBREV]-004:** [Short Title] | ❌ | ❌ | ❌ | Not implemented |

**Progress:** X of Y complete

## Test Execution

```bash
./dev.py test e2e --spec feature.spec.ts
```
```

**Key Principles:**
- 250 words max for each summary
- NO code snippets (zero tolerance)
- NO fluff ("tests run on every PR", etc.)
- All verification details folded into Status Summary table
- Include requirement titles in table (no need to look up IDs)
- Keep verification descriptions concise (1-2 sentences max)
- Manual testing is valid (mark with ⚠️)

## Workflow

### 1. Planning a New Feature

**Input:** User story or business requirement

**Steps:**

1. Create spec directory:
   ```bash
   mkdir -p specs/feature-name
   ```

2. Write `requirements.md`:
   - Define user story
   - Write EARS-formatted requirements with IDs
   - NO status fields (status lives in executive.md)

3. Write `design.md`:
   - Document architecture approach
   - Define data models
   - Specify API contracts
   - Plan implementation approach per requirement

4. Write `executive.md`:
   - Write 250-word requirements summary (user-focused)
   - Write 250-word technical summary (architecture-focused)
   - Create status table (all ❌ initially)
   - Plan verification approach per requirement

**Output:** Complete spec ready for implementation

### 2. Implementing a Feature

**Input:** Completed spec in `specs/feature-name/`

**Steps:**

1. Update `executive.md` status table (❌ → 🔄 for affected cells)

2. Write tests first (TDD):
   ```typescript
   /**
    * @requirement REQ-[ABBREV]-001
    * @acceptance-criteria Rate limiting enforcement
    */
   test("should enforce rate limit", async () => {
     // Implement test for EARS statement
   });
   ```

3. Implement code with requirement comments:
   ```rust
   // REQ-[ABBREV]-001: Token rate limiting
   pub async fn check_rate_limit(...) -> Result<...> {
     // Implementation
   }
   ```

4. Update `design.md` with implementation details:
   - Add file locations per requirement
   - Document technical decisions
   - Explain trade-offs

5. Update `executive.md`:
   - Change status cells (🔄 → ✅)
   - Add verification coverage section
   - Keep requirements.md unchanged

**Output:** Fully implemented feature with complete traceability

### 3. Modifying an Existing Feature

**Input:** Change request for existing feature

**Steps:**

1. Review existing `requirements.md`
   - Does change fit existing requirements?
   - Or does it need new requirement?

2. If new requirement needed:
   - Add REQ-[ABBREV]-XXX with next sequential ID
   - **NEVER reuse or renumber existing IDs**

3. If existing requirement changes:
   - Update EARS statements in requirements.md (git shows evolution)
   - Update affected tests
   - Update design.md implementation section

4. Update implementation with requirement comments

5. Update `executive.md` with new verification coverage

**Output:** Updated spec with git audit trail

### 4. Deprecating a Requirement

**Input:** Requirement no longer needed

**Steps:**

1. Do NOT delete requirement from `requirements.md`

2. Change status to ⚠️ Deprecated:
   ```markdown
   ### REQ-RL-003: IP Whitelist Support

   **Status:** ⚠️ Deprecated (replaced by REQ-RL-008)
   **Deprecated:** 2025-01-15
   **Reason:** Whitelist approach replaced by tier-based quotas
   ```

3. Keep tests for deprecated requirement (regression protection)

4. Add deprecation comments to code:
   ```rust
   // REQ-RL-003: DEPRECATED - Use tier-based quotas instead
   ```

**Output:** Requirement preserved for historical context

## Traceability

### Grep-Based Verification

The system is designed for **grep-based traceability** - every requirement ID should be findable across codebase.

**Find all references to a requirement:**
```bash
rg "REQ-RL-001"
```

Expected output:
```
specs/rate-limiting/requirements.md
22:### REQ-RL-001: IP-Based Token Rate Limiting

specs/rate-limiting/tests.md
15:| REQ-RL-001 | Should enforce IP rate limiting | 30-50 | ✅ Pass |

frontend/tests/e2e/specs/rate-limiting.spec.ts
25: * @requirement REQ-RL-001

src/middleware/rate_limit.rs
45:// REQ-RL-001: Token rate limiting implementation
```

**Find all requirements in a feature:**
```bash
rg "^### REQ-" specs/rate-limiting/requirements.md
```

**Find untested requirements:**
```bash
# Requirements with no test references
rg "REQ-RL-" specs/rate-limiting/requirements.md | \
  while read -r req; do
    if ! rg -q "$req" frontend/tests/ src/; then
      echo "Missing tests: $req"
    fi
  done
```

### Traceability Matrix

For each requirement, you should be able to trace:

```
REQ-RL-001
  ├── requirements.md:22 (definition)
  ├── design.md:45 (implementation approach and file locations)
  ├── executive.md:15 (status and verification coverage)
  ├── frontend/tests/e2e/specs/rate-limiting.spec.ts:25 (@requirement tag)
  ├── src/rate_limit/tests.rs:15 (unit test)
  ├── src/middleware/rate_limit.rs:45 (implementation comment)
  └── git log --all --grep="REQ-RL-001" (commits)
```

### Automated Verification (Future)

Planned tooling:

```bash
# ./dev.py verify-requirements
# - Scans all REQ-* IDs in specs/
# - Verifies each has test coverage
# - Reports missing implementation comments
# - Generates traceability report
```

## Migration Strategy

### Migrating Existing Features

**Option 1: Retroactive Documentation (Recommended)**

For well-tested features like rate limiting:

1. Create `specs/feature-name/` directory
2. Extract requirements from existing documentation or test names
3. Write EARS-formatted requirements (no status fields)
4. Write executive.md with current status and verification coverage
5. Document implementation in design.md
6. Add requirement comments to existing code

**Option 2: Gradual Migration**

For features needing test improvements:

1. Write requirements.md from current behavior (no status fields)
2. Identify test coverage gaps
3. Add missing tests incrementally
4. Update executive.md as coverage improves

**Option 3: Next-Touch Migration**

For stable features not actively changing:

1. Keep existing documentation as-is
2. Migrate to specs/ when next modified
3. Apply full requirements-based process to changes

### New Features

**All new features MUST use requirements-based planning:**

1. Write `specs/feature-name/requirements.md` before any code
2. Review requirements in PR before implementation
3. Write tests that reference requirements
4. Add requirement comments during implementation

## Examples

### Example 1: Newspaper Feature

See `specs/newspaper/` for complete example including:

- User-benefit focused requirement titles
- EARS-formatted acceptance criteria
- Executive summaries (requirements + technical)
- Comprehensive status tracking in executive.md
- Implementation details in design.md

### Example 2: Simple Feature

**Spec:** `specs/build-info/requirements.md`

```markdown
# Build Information Display

## User Story

As a user, I need to see which version of the application is running so that I can report issues accurately.

## Requirements

### REQ-BI-001: View Application Version

WHEN user views application footer
THE SYSTEM SHALL display 7-character git commit SHA

WHEN git SHA is not available
THE SYSTEM SHALL display "unknown"

**Rationale:** Users need version information to provide useful bug reports. Without knowing which version they're using, developers can't reproduce issues or verify if reported bugs are already fixed.
```

**Spec:** `specs/build-info/executive.md`

```markdown
# Build Information - Executive Summary

## Requirements Summary

Users can view the application version (git commit SHA) in the footer to report issues accurately.

## Technical Summary

Footer component displays `window.__GIT_SHA__` injected at build time. Falls back to "unknown" if unavailable.

## Status Summary

| Requirement | Backend | Frontend | Testing | Overall |
|-------------|---------|----------|---------|---------|
| REQ-BI-001 | N/A | ✅ | ✅ E2E | ✅ Complete |

## Verification Coverage

### REQ-BI-001: View Application Version

**Verification:** E2E test checks footer displays git SHA.
**Location:** `build-info.spec.ts`
```

This shows minimal spec for simple feature - still follows pattern but appropriately lightweight.

## FAQ

### Q: Do I need specs for bug fixes?

**A:** Usually no. For simple bugs:

- Fix the bug
- Add regression test
- Reference issue number in commit

For bugs revealing missing requirements:

- Add requirement to existing spec
- Write test for requirement
- Implement fix

### Q: When do I create a new spec vs add to existing?

**A:** Create new spec when:

- Feature is logically independent
- Different team members might work on it
- Deployment could be separate

Add to existing spec when:

- Feature extends existing capability
- Shares same data models/architecture
- Would be confusing to separate

### Q: What if requirements change frequently?

**A:** EARS format handles change well:

- Add new requirements with new IDs
- Update existing EARS statements (with note)
- Deprecate obsolete requirements (don't delete)
- Tests verify current behavior

Immutable IDs provide stability; EARS statements can evolve.

### Q: Isn't this a lot of overhead?

**A:** Upfront cost, long-term savings:

- **Cost:** 15-30 minutes to write requirements
- **Savings:** Hours debugging unclear requirements
- **Savings:** Days refactoring untested code
- **Savings:** Weeks onboarding new developers

For complex features, you'd write this documentation anyway - specs just provide structure.

### Q: How detailed should EARS statements be?

**A:** Detailed enough to write tests:

- If you can't write test from EARS statement → too vague
- If EARS statement describes implementation → too detailed
- If multiple interpretations possible → add specifics

Good test: Can someone else implement from requirements alone?

### Q: Do tests need to reference requirements?

**A:** Yes, via comments:

```typescript
/** @requirement REQ-RL-001 */
test('should enforce rate limit', ...)
```

This makes traceability grep-able and helps reviewers verify coverage.

### Q: What about performance/security requirements?

**A:** Include in requirements.md using EARS:

**Performance:**
```markdown
WHEN user requests nowcast data
THE SYSTEM SHALL respond within 2 seconds for cached locations
```

**Security:**
```markdown
WHEN authentication token is invalid
THE SYSTEM SHALL return 401 without revealing token format
```

### Q: Can requirements reference other requirements?

**A:** Yes, using Dependencies field:

```markdown
### REQ-RL-002: LLM Quota Enforcement

**Dependencies:** REQ-RL-001 (requires rate limiting infrastructure)
```

### Q: How do I handle configuration-dependent requirements?

**A:** Use EARS "WHERE" pattern:

```markdown
WHERE rate limiting is enabled in configuration
THE SYSTEM SHALL enforce 10 requests per hour limit

WHERE rate limiting is disabled
THE SYSTEM SHALL allow unlimited requests
```

## Tools and Automation

### Current Tools

**Grep-based verification:**

```bash
# Find all references to requirement
rg "REQ-RL-001"

# List all requirements
rg "^### REQ-" specs/

# Find requirements in tests
rg "@requirement" frontend/tests/ src/
```

### Future Tools (Planned)

**Coverage verification:**

```bash
./dev.py verify-requirements
# Reports:
# - ✅ REQ-RL-001: 3 tests (2 E2E, 1 unit)
# - ⚠️  REQ-RL-002: 1 test (needs E2E coverage)
# - ❌ REQ-RL-003: No tests found
```

**Traceability report:**

```bash
./dev.py requirements-report rate-limiting
# Generates markdown with:
# - Requirement → Test mapping
# - Requirement → Code mapping
# - Coverage gaps
```

**PR integration:**

```bash
# Automatically comments on PRs:
# "This PR affects REQ-RL-001, REQ-RL-003"
# "Coverage: E2E ✅ | Unit ✅ | Docs ⚠️"
```

## References

### External Resources

- **EARS Guide**: [Rolls-Royce EARS Whitepaper](https://www.researchgate.net/publication/224079416_Easy_Approach_to_Requirements_Syntax_EARS)
- **Kiro Code**: [Specification-driven development](https://kiro.dev/docs/specs/concepts/)
- **Requirements Engineering**: [IEEE Guide to SRS](https://standards.ieee.org/standard/29148-2018.html)

### Project Documentation

- **CLAUDE_ADDENDUM.md**: Workflow instructions for AI assistants
- **PLAN.md**: High-level roadmap and future features
- **specs/**: Individual feature specifications (requirements, design, executive)
  - **requirements.md**: Timeless EARS requirements (no status)
  - **design.md**: Living technical documentation
  - **executive.md**: Authoritative status tracking
- **frontend/README.md**: Design system rules and frontend development guide
- **OPERATIONS.md**: Deployment procedures and infrastructure details

## Conclusion

Requirements-based planning provides **lightweight but rigorous structure** for feature development. It preserves the agility of the current workflow while adding traceability and clarity.

**Key takeaways:**

1. **Requirements → Tests → Code** workflow prevents untested code
2. **EARS format** makes requirements specific and testable
3. **Immutable IDs** enable grep-based traceability
4. **Three-document pattern** balances detail with maintainability
5. **Gradual adoption** allows migration without big-bang rewrite

Start with one feature (rate-limiting), learn the pattern, then apply broadly.
