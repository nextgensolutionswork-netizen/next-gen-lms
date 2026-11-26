# 08 — Cross-Role Workflow Report

## Live Cross-Role Data Visibility Comparison (Production Read-Only)
| Metric | Super Admin | Admin | Sales (`counsellor`) |
|---|---:|---:|---:|
| Leads Visible | 29 | 29 | 2 |
| Admissions Students | 2 | 2 | 0 |
| Students API | 2 | 2 | 0 |
| Receipts API Students (BUG-002) | 2 | 2 | 2 (LEAK) |
| Dues API | 1 | 1 | 0 |

- **Mutating Cross-Role Workflows (WF-01..WF-15):** `BLOCKED` — isolated staging does not have the 3 new accounts provisioned, and production writes are prohibited.
