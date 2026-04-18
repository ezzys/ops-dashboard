# Audit Task: Critical Design Review + Verification Control Matrix

## Project: /tmp/ops-dashboard
## Requirements document: /tmp/ops-dashboard/ROADMAP_V2.md (570 lines)
## Implementation: all files under /tmp/ops-dashboard/src/ and /tmp/ops-dashboard/index.html

## Instructions

You are performing a formal critical design review and creating a Verification Control Matrix (VCM). This is an aerospace-grade audit — be thorough, be harsh.

### Part 1: Critical Design Review

Read ROADMAP_V2.md thoroughly. Then read EVERY implementation file:
- `src/server.js`
- `src/config.js`
- `src/sessiondb.js`
- `src/telemetry.js`
- `src/routes/*.js` (all route files)
- `src/services/*.js` (all service files)
- `nexus-config.json`
- `index.html`
- `package.json`

Evaluate:
1. **Completeness** — Does every requirement in ROADMAP_V2.md have a corresponding implementation? List gaps.
2. **Correctness** — Does the implementation actually do what the requirement says? Check logic, not just presence of a file.
3. **Architecture quality** — Is the code well-structured? Any anti-patterns? Security holes? Performance issues?
4. **Integration** — Do the pieces actually connect? Are WebSocket broadcasts wired? Are services initialized?
5. **Error handling** — Does every route handle failure cases? Are edge cases covered?
6. **Frontend** — Does the HTML actually work? Are all tabs populated? WebSocket listeners connected?

### Part 2: Verification Control Matrix (VCM)

Create a table with columns:
| Req ID | Requirement | Phase | Implementation Location | Status | Evidence | Gap Description |

- Req ID: from ROADMAP_V2.md (e.g., R1.1.1, R2.3.2, etc.)
- Requirement: short description
- Phase: which phase it belongs to
- Implementation Location: file:line or file:function
- Status: PASS / PARTIAL / FAIL / MISSING
- Evidence: what confirms implementation (or why it fails)
- Gap Description: what's missing or wrong (blank if PASS)

For PARTIAL/FAIL/MISSING: add a **Corrective Action** row:
| Req ID | Severity | Corrective Action | Priority | Effort Estimate |

### Part 3: Summary

- Total requirements counted
- Pass / Partial / Fail / Missing counts
- Top 5 critical findings
- Top 5 quick wins (easy fixes, high impact)
- Architecture recommendations

## Output
Write the full report to: /tmp/ops-dashboard/.nexus/worker-reports/AUDIT-claude.md

## Format
Use markdown tables throughout. Be specific — cite file names, line numbers, function names. No vague statements.
