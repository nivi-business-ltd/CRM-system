# NIVI FINSERV CRM — PRD

## Original Problem Statement
Build a CRM website to store client data, accessible only to the owner and their employees.

## User Choices
- Track: Basics + deal/pipeline stage & value per client
- Auth: Email + password (JWT); admin creates employee accounts
- Access control: Admin manages employees; employees see ONLY their assigned clients
- Features: store & search clients + tasks/reminders + dashboard overview
- Brand: green & white, NIVI FINSERV logo (emerald + navy)

## Architecture
- Backend: FastAPI + MongoDB (motor), JWT (PyJWT) + bcrypt auth, all routes under /api
- Frontend: React (CRA/craco), react-router, shadcn/ui, recharts, sonner; token in localStorage `nivi_token` + Bearer; httpOnly cookie fallback
- RBAC: `get_current_user` / `require_admin`; client & task queries scoped by `assigned_to` for employees, unrestricted for admin

## User Personas
- Admin (owner, finservnivi@gmail.com): full access, manages employees, sees all clients/tasks
- Employee: sees only clients/tasks assigned to them; creates clients auto-assigned to self

## Core Requirements (static)
- Secure login, role-based data isolation, client CRUD with stage & deal value, search/filter, pipeline board, tasks/reminders, admin employee management, dashboard metrics

## Implemented (2026-06)
- JWT auth: /api/auth/login, /me, /logout; idempotent admin seed
- Employees: admin create/list/delete (delete unassigns their clients)
- Clients: scoped list (search q, stage filter, assignee filter), create/get/update/delete
- Tasks: scoped list/create/update/delete, status filter, complete toggle
- Dashboard: total clients, active deals, pipeline value, win rate, stage distribution chart, upcoming tasks, recent clients
- Branded green/white UI with NIVI FINSERV logo; demo data seeded on first run
- Verified via testing agent: 19/19 backend tests, all frontend flows, RBAC scoping confirmed

## Backlog
- P1: Client detail view with activity/notes timeline; drag-and-drop pipeline
- P1: Employee performance metrics (deals closed, task completion)
- P2: Email reminders for due tasks; CSV import/export; dark mode
- P2: Password reset flow; audit log
