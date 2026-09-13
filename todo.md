# Quiet Atlas Redesign Checklist

- [x] Inventory all production frontend pages, layouts, reusable components, and route groups.
- [x] Establish global Quiet Atlas design tokens, typography, accessibility states, and responsive primitives.
- [x] Redesign the public landing page, Situation Room, and all authentication/recovery/application screens.
- [x] Redesign shared application chrome, role dashboards, result workflows, collation, disputes, reports, profile, and notifications surfaces.
- [x] Redesign administration, election, candidate, geography, configuration, application-review, and audit-log views.
- [x] Run frontend production build and verify role workflows remain intact using the existing role-matrix UAT suite.
- [x] Perform desktop and mobile visual acceptance checks, remediate all meaningful findings, and package the updated release.
- [x] Compare rendered public, authentication, operational, and administration routes against the Quiet Atlas design specification and identify every remaining legacy visual pattern.
- [x] Replace residual legacy layout, color, type, card, table, status, and chart treatments with visibly distinctive Quiet Atlas compositions across the full route set.
- [x] Conduct a visual proof pass at desktop and representative responsive layouts before packaging the corrected release.
- [x] Diagnose the Render Service Unavailable response using deployment configuration and application startup evidence.
- [x] Correct the production startup defect and validate the Render-compatible health response.
- [ ] Measure the Quiet Atlas archive and identify the exact files responsible for unnecessary package size.
- [ ] Produce and verify a minimized deployment-ready archive that excludes local test databases, generated artifacts, and workspace-only files.
