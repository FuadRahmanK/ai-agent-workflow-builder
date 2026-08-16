# AI Agent Workflow Builder

A full-stack workflow automation platform for building and executing AI-powered workflows with organization-based access control, multiple triggers, approval gates, and live execution tracking.

## Tech Stack

- Next.js + React + TypeScript
- Nhost + Hasura GraphQL
- PostgreSQL
- Node.js + Express + TypeScript
- Groq API for LLM steps
- Render for backend deployment
- Vercel for frontend deployment

## Features

- Multi-organization workflows with owner/editor/viewer roles
- Organization-level isolation
- Workflow steps: `llm_call`, `http_request`, `db_write`, `notify`, `conditional_branch`, `approval_gate`
- Triggers: Manual, Webhook, Scheduled, Database Event
- Approval-gated workflow execution
- Live execution history and step status
- Usage/quota tracking
- Retry handling for external calls

## Architecture

```text
                    +----------------------+
                    |      Next.js Web      |
                    |      React UI         |
                    +----------+-----------+
                               |
                         GraphQL / Auth
                               |
                               v
                    +----------------------+
                    |    Nhost / Hasura    |
                    | GraphQL + Auth +     |
                    | Permissions + Events |
                    +----------+-----------+
                               |
                         PostgreSQL
                               |
             +-----------------+------------------+
             |                 |                  |
             v                 v                  v
       GraphQL queries      Actions          Event Triggers
       / mutations         / Webhooks         / Scheduler
             |                 |                  |
             +-----------------+------------------+
                               |
                               v
                    +----------------------+
                    | Node.js / TypeScript |
                    | Workflow Backend     |
                    +----------------------+
                               |
                +--------------+--------------+
                |              |              |
                v              v              v
              Groq       External APIs   Notifications
```

## Data Model

```text
organizations
    |
    +-- org_members
    |
    +-- workflows
          |
          +-- workflow_steps
          |
          +-- workflow_triggers
          |
          +-- workflow_runs
                 |
                 +-- step_runs
```

The model separates organization membership, workflow definitions, and workflow execution state.

## Workflow Steps

| Step | Purpose |
|---|---|
| `llm_call` | Calls a real LLM through Groq |
| `http_request` | Makes a generic external HTTP request |
| `db_write` | Saves workflow output into application data |
| `notify` | Sends a notification through the event-driven notification path |
| `conditional_branch` | Selects behavior using a condition on workflow output |
| `approval_gate` | Pauses execution until an authorized member approves |

## Triggers

| Trigger | Purpose |
|---|---|
| Manual | User starts a workflow from the UI |
| Webhook | External systems start a workflow through the workflow webhook endpoint |
| Scheduled | Backend scheduler starts workflows according to their configuration |
| Database Event | Hasura Event Trigger starts a workflow after a database change |

Database events support `INSERT`, `UPDATE`, and `DELETE`. Scheduled workflows support interval, daily, and weekly configurations with timezone-aware scheduling.

## Permissions

| Role | View | Create/Edit | Execute | Delete | Manage Members |
|---|---|---|---|---|---|
| Owner | Yes | Yes | Yes | Yes | Yes |
| Editor | Yes | Yes | Yes | No | No |
| Viewer | Yes | No | No | No | No |

### Two Permission Layers

**Layer 1 — Organization and role scoping**

Access is scoped through `org_members`, ensuring users can only access workflows belonging to their own organization. Knowing another organization's workflow ID does not bypass this isolation.

**Layer 2 — Step-level gating**

Sensitive operations are additionally checked by the backend execution/Action layer. Restricted capabilities include `db_write`, webhook triggers, and `notify`. Approval authorization is also checked by the backend Action handler because approval is a mid-execution decision.

## Approval Gate

```text
Workflow execution
        |
        v
approval_gate
        |
        +--> step_run = paused
        +--> workflow_run = paused
        |
        v
Wait for approval
        |
        v
approveStep Action
        |
        +--> verify organization membership
        +--> verify owner/editor role
        +--> verify paused approval step
        |
        v
Record approved_by / approved_at
        |
        v
Resume workflow
```

## GraphQL and Live Updates

The frontend uses GraphQL for workflow queries and mutations and subscriptions for live execution progress.

Important operations include:

- Workflow queries
- Workflow/step/trigger creation, update, and deletion
- Workflow execution
- Approval
- Workflow run subscriptions
- Step run subscriptions filtered by `workflow_run_id`

Execution History displays all available workflow runs, ordered with the newest runs first.

## Project Structure

```text
ai-agent-workflow-builder/
├── backend/    # Node.js workflow execution engine
└── web/        # Next.js frontend
```

## Prerequisites

- Node.js 20+
- npm
- Nhost project with Hasura/PostgreSQL
- Groq API key

Resend is required only if notification/email functionality is used.

## Local Setup

### 1. Clone

```bash
git clone https://github.com/FuadRahmanK/ai-agent-workflow-builder.git
cd ai-agent-workflow-builder
```

### 2. Backend

```bash
cd backend
npm install
```

Create `backend/.env`:

```env
DATABASE_URL=your_postgresql_connection_string
GROQ_API_KEY=your_groq_api_key
WORKFLOW_DATABASE_EVENT_SECRET=your_database_event_secret
WORKFLOW_SCHEDULER_POLL_MS=10000
RESEND_API_KEY=your_resend_api_key
NOTIFICATION_FROM_EMAIL=your_sender_email
```

Start the backend:

```bash
npm run dev
```

The backend runs on `http://localhost:4000` by default.

### 3. Frontend

Open another terminal:

```bash
cd web
npm install
```

Create `web/.env.local`:

```env
NEXT_PUBLIC_NHOST_SUBDOMAIN=your_nhost_subdomain
NEXT_PUBLIC_NHOST_REGION=your_nhost_region
NEXT_PUBLIC_WORKFLOW_ENGINE_URL=http://localhost:4000
```

Start the frontend:

```bash
npm run dev
```

Open the local URL shown by Next.js.

## Production

### Frontend

https://ai-agent-workflow-builder-liart-theta.vercel.app/

### Backend

https://ai-agent-workflow-builder-wgz8.onrender.com

### GitHub

https://github.com/FuadRahmanK/ai-agent-workflow-builder