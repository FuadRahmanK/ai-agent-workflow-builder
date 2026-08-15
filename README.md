# AI Agent Workflow Builder

A full-stack workflow automation platform for building, configuring, and executing AI-powered workflows.

The application provides a visual workflow builder, multiple trigger mechanisms, scheduled execution, database-event integration, workflow execution history, and organization-based role access control.

---

## Features

### Workflow Management

- Create new workflows
- Unsaved workflow drafts
- Edit workflow name and description
- Add, edit, reorder, and delete workflow steps
- Save workflows
- Delete workflows
- Execute workflows
- View workflow execution history
- View individual workflow run details

### Trigger Types

The workflow builder supports:

- Manual triggers
- Webhook triggers
- Scheduled triggers
  - Interval scheduling
  - Daily scheduling
  - Weekly scheduling
- Database-event triggers
  - INSERT
  - UPDATE
  - DELETE

### Scheduled Triggers

Scheduled workflows support:

- Configurable execution intervals
- Daily execution at a specified time
- Weekly execution
- Timezone-aware scheduling
- Scheduler polling
- Calculation of the next scheduled execution

### Database Event Triggers

Database events are integrated with Hasura Event Triggers.

Supported database operations:

- INSERT
- UPDATE
- DELETE

The backend validates the database-event secret before processing incoming events.

### Role-Based Access Control

The application supports organization-level roles:

| Role | View | Create | Edit | Execute | Delete | Manage Triggers |
|------|------|--------|------|---------|--------|-----------------|
| Owner | Yes | Yes | Yes | Yes | Yes | Yes |
| Editor | Yes | Yes | Yes | Yes | No | Yes |
| Viewer | Yes | No | No | No | No | No |

Access is also isolated between organizations.

A user belonging to one organization cannot access workflows or execution data belonging to another organization.

---

## Architecture

The project consists of two main applications:

```text
AI Agent Workflow Builder
│
├── web/
│   └── Next.js frontend
│
└── backend/
    └── Node.js / TypeScript workflow engine