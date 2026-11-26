# 15 — Performance Test Report

## Production API Latencies
```json
[
  {
    "endpoint": "/api/dashboard/metrics",
    "status": 200,
    "ms": 790
  },
  {
    "endpoint": "/api/crm/leads",
    "status": 200,
    "ms": 1730
  },
  {
    "endpoint": "/api/admissions",
    "status": 200,
    "ms": 800
  },
  {
    "endpoint": "/api/students",
    "status": 200,
    "ms": 1060
  },
  {
    "endpoint": "/api/fees/payments",
    "status": 200,
    "ms": 1659
  },
  {
    "endpoint": "/api/fees/reconcile",
    "status": 200,
    "ms": 794
  },
  {
    "endpoint": "/api/users",
    "status": 200,
    "ms": 509
  }
]
```
- High-volume 500-student load testing in staging is `BLOCKED` pending 3-account staging provisioning.
