You are performing a formal critical design review and creating a Verification Control Matrix for the NEXUS v2 dashboard project.

The requirements document is at /tmp/ops-dashboard/ROADMAP_V2.md
The implementation is at /tmp/ops-dashboard/src/ and /tmp/ops-dashboard/index.html

Read ALL of these files:
- /tmp/ops-dashboard/ROADMAP_V2.md
- /tmp/ops-dashboard/src/server.js
- /tmp/ops-dashboard/src/config.js
- /tmp/ops-dashboard/src/sessiondb.js
- /tmp/ops-dashboard/src/telemetry.js
- All files in /tmp/ops-dashboard/src/routes/
- All files in /tmp/ops-dashboard/src/services/
- /tmp/ops-dashboard/nexus-config.json
- /tmp/ops-dashboard/index.html
- /tmp/ops-dashboard/package.json

Then produce a report with:

1. CRITICAL DESIGN REVIEW — evaluate completeness, correctness, architecture, integration, error handling, frontend quality
2. VERIFICATION CONTROL MATRIX — table: | Req ID | Requirement | Phase | Implementation | Status (PASS/PARTIAL/FAIL/MISSING) | Evidence | Gap |
3. CORRECTIVE ACTIONS — for each PARTIAL/FAIL/MISSING: | Req ID | Severity | Action | Priority | Effort |
4. SUMMARY — counts, top 5 critical findings, top 5 quick wins

Write the full report to: /tmp/ops-dashboard/.nexus/worker-reports/AUDIT-gemini.md
