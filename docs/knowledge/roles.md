# Roles

`PlatformRole` on the person, not on a workspace:

| Role | Typical people | Notes |
|---|---|---|
| Super admin | Env `PLATFORM_SUPER_ADMIN_EMAIL` | Assign roles, View as anyone, backups, danger zone. Counts as an executive for stage 3. Cannot be given out in Admin. |
| Adviser | Env `PACKAGE_ADVISER_EMAIL` | Same admin powers as super admin. The only role that approves stage 2. Never counts as an executive for stage 3. |
| Executive producer | Heads of ops, personnel, creative | Stage 3 (two distinct executives; three if the package is marked controversial). Grade Editor. All Groups. Admin → People. Package Cycle chart edits. Master Calendar **Anchors & PA** counts. |
| Associate producer | Assigned packages in Groups | Stage 1 on assigned packages. Required packages: 2 in semester 1, 3 in semester 2. |
| (no role) | Reporters | Student cycle tabs for packages they are on. Required packages: 3 S1 / 4 S2. |

Super admin and the adviser give out Associate Producer, Executive Producer, and Adviser in Admin → Producer Team. The env accounts above always keep their role, whatever Producer Team says. View as belongs to the env super admin and adviser accounts (plus limited grants), not to everyone given the Adviser role.

## Rules that confuse people

- An AP **on a package roster** works that package as a student (cycle tabs). They do not produce their own package.
- APs only produce **assigned** packages. They cannot edit the Package Cycle chart.
- Assigned producer on a package can be an AP or an EP/super-admin (when the usual AP is a student on that package). That person does stage 1. Assigned EP is not a substitute for stage 3.
- `isExecutiveProducer()` excludes the adviser. Use that for stage 3, The Show EP checks, and similar.
- Student Grades tab is hidden for EP, adviser, and super admin. APs still see it for their own student work.
- EP, super admin, and adviser stay off Participation and Grade Editor rosters.

## Appointed managers

Separate from `PlatformRole`. Any producer (associate and up) appoints or removes them from each tool (see `managers.md`). Associate producers and up can already do everything below. Being a manager never makes someone a producer, and removal takes effect on their next page load.

| Manager | Unlocks |
|---|---|
| Equipment | Equipment Dashboard (`/equipment/manage`) and every Manage tab, plus checkout |
| Livestream | Edit the livestream schedule, approve sign-ups, the **Completion** tab and credit edits, the livestream dashboard PIN in Settings, and new OBS links. Earns manager credit for completed livestreams they manage |
| Website | Read-only Publishing Queue (`/publishing-queue`). No queue or group editing |
| Social media | Instagram Post Maker (`/managers/social-media`) |

Everyone signed in sees the Managers tab; cards a person cannot open are locked.
