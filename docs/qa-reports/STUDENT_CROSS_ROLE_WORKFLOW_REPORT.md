# ROLE 5 — STUDENT / LEARNER: CROSS-ROLE WORKFLOW AUDIT

**Application**: Next-Gen LMS & CRM  
**Target Environment**: Live Production (`https://next-gen-lms-omega.vercel.app`)  
**Production Commit SHA**: `4d3cfd5e59b535737a79fb72f41f3d07d2eaef38`  
**Execution Date**: 21 November 2026  

---

## 1. CROSS-ROLE INTERACTION TOPOLOGY

The student role directly interacts across all 4 previously audited roles in the Next-Gen ecosystem:

```
┌─────────────────────────────────────────────────────────────┐
│                       SUPER ADMIN                           │
│  - System policies, master tenant config, DB schemas        │
└───────────────┬─────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────┐
│                          ADMIN                              │
│  - Approves onboarding (`student_lms_access`), issues certs │
└───────────────┬─────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────┐
│                       COUNSELLOR                            │
│  - Lead conversion, admission creation, fee collection      │
└───────────────┬─────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────┐
│                    TRAINER / FACULTY                        │
│  - Attendance marking, assignment grading, batch classes    │
└───────────────┬─────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────┐
│                    STUDENT / LEARNER                        │
│  - Attends classes, submits work, views verified certs      │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. CROSS-ROLE RECONCILIATION SUMMARY

| Interaction Point | Counterpart Role | Governance Mechanism | Production Status |
|---|---|---|:---:|
| **Admission Creation** | Counsellor | Admission creation maps lead to `students` table | **VERIFIED** |
| **LMS Access Activation** | Admin / Super Admin | Granting `enabled = true` in `student_lms_access` unlocks `/portal` | **VERIFIED (Rule G03)** |
| **Batch Enrollment** | Admin / Trainer | Linking `batch_id` to student cohort | **VERIFIED** |
| **Attendance Logging** | Trainer | Trainer marks attendance in `attendance_records` | **VERIFIED** |
| **Assignment Grading** | Trainer | Trainer evaluates submissions in `assignment_submissions` | **VERIFIED** |
| **Fee Approval** | Counsellor / Admin | Offline/Online payments verified in accounts queue | **VERIFIED** |
| **Certificate Issuance** | Academic Director | Minting credential in `certificates` table | **VERIFIED (Live Cert Shown)** |

---

## 3. AUDIT CONCLUSION

Cross-role workflows function coherently with strict role-based separation of duties.
