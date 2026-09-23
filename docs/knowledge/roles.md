# Roles

`PlatformRole` on the person, not on a workspace:

| Role | Typical people | Notes |
|---|---|---|
| Super admin | Env `PLATFORM_SUPER_ADMIN_EMAIL` | Assign roles, View as anyone, danger zone |
| Adviser | Env `PACKAGE_ADVISER_EMAIL` | Same admin powers as super admin. Stage 2 of package approval only. Never counts as an executive for stage 3. |
| Executive producer | Heads of ops, personnel, creative | Stage 3 (two distinct EPs). Grade Editor. All Groups. Master Calendar **Anchors & PA** counts. |
| Associate producer | Assigned packages in Groups | Stage 1 on assigned packages. Required packages: 2 in semester 1, 3 in semester 2. |
| (no role) | Reporters | Student cycle tabs for packages they are on. Required packages: 3 S1 / 4 S2. |

## Rules that confuse people

- An AP **on a package roster** works that package as a student (cycle tabs). They do not produce their own package.
- APs only produce **assigned** packages. They cannot edit the Package Cycle chart.
- Assigned producer on a package can be an AP or an EP/super-admin (when the usual AP is a student on that package). That person does stage 1. Assigned EP is not a substitute for stage 3.
- `isExecutiveProducer()` excludes the adviser. Use that for stage 3, The Show EP checks, and similar.
- Student Grades tab is hidden for EP, adviser, and super admin. APs still see it for their own student work.
- EP, super admin, and adviser stay off Participation and Grade Editor rosters.
