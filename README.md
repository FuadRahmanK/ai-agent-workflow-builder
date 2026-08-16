# AI Agent Workflow Builder

A full-stack workflow automation platform for building, configuring, and
executing AI-powered workflows inside isolated organizations.

The project combines **Next.js + React**, **Nhost/Hasura GraphQL**,
**PostgreSQL**, and a **Node.js/TypeScript workflow execution backend**.
Workflows can be started manually or automatically through webhooks,
schedules, and database events, while execution progress is streamed
live to the frontend.

## Features

### Workflow management

-   Create new workflows as unsaved frontend drafts
-   Edit workflow name and description
-   Add, edit, reorder, and delete workflow steps
-   Add, configure, enable/disable, and delete triggers
-   Save workflows only when explicitly requested
-   Delete workflows
-   Execute workflows
-   View complete execution history
-   View individual workflow run details
-   Live execution status through GraphQL subscriptions

### Workflow step types

The builder supports:

  -----------------------------------------------------------------------
  Step                                Purpose
  ----------------------------------- -----------------------------------
  `llm_call`                          Calls a real LLM through Groq

  `http_request`                      Makes a generic external HTTP
                                      request

  `db_write`                          Saves workflow output into
                                      application data

  `notify`                            Sends notification through the
                                      event-driven notification path

  `conditional_branch`                Selects a true/false branch using
                                      the previous output

  `approval_gate`                     Pauses execution until an
                                      authorized organization member
                                      approves
  -----------------------------------------------------------------------

### Trigger types

  -----------------------------------------------------------------------
  Trigger                             Purpose
  ----------------------------------- -----------------------------------
  Manual                              User starts a workflow from the UI

  Webhook                             External systems start a workflow
                                      through a Hasura Action

  Scheduled                           Backend scheduler starts workflows
                                      according to their configuration

  Database Event                      Hasura Event Trigger starts
                                      workflows on database changes
  -----------------------------------------------------------------------

Database-event workflows support:

-   `INSERT`
-   `UPDATE`
-   `DELETE`

Scheduled workflows support:

-   Interval schedules
-   Daily schedules
-   Weekly schedules
-   Timezone-aware configuration
-   Scheduler polling and next-run calculation

## Organization and permissions

The application uses organization membership and roles:

  -------------------------------------------------------------------------------------
  Role       View       Create/Edit   Execute    Delete     Manage     Restricted
                                                            members    steps/triggers
  ---------- ---------- ------------- ---------- ---------- ---------- ----------------
  Owner      Yes        Yes           Yes        Yes        Yes        Yes

  Editor     Yes        Yes           Yes        No         No         Restricted by
                                                                       step-level rules

  Viewer     Yes        No            No         No         No         No
  -------------------------------------------------------------------------------------

Access is scoped through the user's organization membership. A user from
one organization cannot access another organization's workflows or
execution data by guessing IDs.

### Two permission layers

The assignment requires permissions to be enforced at two different
levels.

**Layer 1 --- organization and role scoping**

Hasura permissions and backend authorization scope workflow access to
the caller's organization through `org_members`.

This prevents a member of Organization B from reading or modifying
Organization A's workflows even when the user knows the workflow ID.

**Layer 2 --- step-level gating**

Sensitive operations are additionally checked by the backend
execution/Action layer.

Restricted capabilities include:

-   `db_write`
-   webhook triggers
-   `notify`

Approval is also enforced in the backend Action handler because approval
is a mid-execution decision rather than a simple database row
permission.

## Approval-gate execution

An `approval_gate` pauses a workflow rather than completing it.

``` text
Workflow execution
        |
        v
approval_gate
        |
        +--> step_run = paused
        |
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
        +--> verify step is an approval gate
        +--> verify run is paused
        |
        v
Record approved_by / approved_at
        |
        v
workflow_run = running
        |
        v
Resume execution
```

The approval Action joins the step run to its workflow and organization
membership, so an approver from another organization cannot approve a
workflow by supplying an ID directly.

## Workflow execution

The backend executes workflow steps in order and records a `step_run`
for each step.

Execution state is persisted in PostgreSQL:

``` text
workflow
   |
   +-- workflow_steps
   |
   +-- workflow_triggers
   |
   +-- workflow_runs
           |
           +-- step_runs
```

Workflow run states include:

-   `pending`
-   `running`
-   `paused`
-   `completed`
-   `failed`

Step runs record status, input/output, errors, attempt count, and
approval information where applicable.

### Retry handling

External LLM execution supports two attempts. A failed first attempt is
retried before the step is marked failed.

The workflow executor records failures in `step_runs` and marks the
corresponding `workflow_run` as failed when execution cannot continue.

## Usage quota

Organizations have a workflow execution quota:

``` text
quota_used
quota_limit
```

The backend checks the organization's available quota before starting
execution.

A successful workflow completion increments the organization's usage
counter.

The frontend exposes the organization usage/quota information so the
current usage is visible to users.

The application also exposes an organization usage view containing:

-   Calls used
-   Calls allowed
-   Remaining calls
-   Usage percentage

## Architecture

``` text
                    +----------------------+
                    |      Next.js Web      |
                    |      React UI        |
                    +----------+-----------+
                               |
                         GraphQL / Auth
                               |
                               v
                    +----------------------+
                    |    Nhost / Hasura     |
                    |  Auth + GraphQL +     |
                    |  Permissions + Events |
                    +----------+-----------+
                               |
                         PostgreSQL
                               |
             +-----------------+------------------+
             |                 |                  |
             v                 v                  v
       GraphQL queries     Actions             Event Triggers
       / mutations        / Webhooks            / Scheduler
             |                 |                  |
             +-----------------+------------------+
                               |
                               v
                    +----------------------+
                    | Node.js / TypeScript |
                    | Workflow Backend     |
                    +----------------------+
                               |
              +----------------+----------------+
              |                |                |
              v                v                v
             Groq          External APIs    Notifications
```

## Data model

The core relationships are:

``` text
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

The model separates:

-   organization ownership
-   organization membership and roles
-   workflow definitions
-   workflow execution
-   individual step execution

This makes organization isolation and execution tracking explicit
instead of mixing configuration with runtime state.

## GraphQL

The frontend uses GraphQL for workflow data and mutations.

Important operations include:

-   Workflow queries
-   Workflow creation/update/deletion
-   Step creation/update/deletion
-   Trigger creation/update/deletion
-   Workflow execution
-   Approval
-   Live workflow-run subscriptions
-   Live step-run subscriptions

Execution History subscribes to workflow runs and step runs so the UI
can update without a page refresh.

The step subscription is scoped by `workflow_run_id`, allowing the
frontend to display live step-by-step progress for the selected
execution.

## Event-driven integrations

### Webhook

The backend exposes:

``` text
POST /actions/trigger-workflow-webhook
```

Hasura invokes this path through the webhook-triggering Action.

### Database events

The backend exposes:

``` text
POST /events/database
```

Hasura Event Triggers forward database changes to this endpoint.

The backend validates the configured event secret before processing the
event.

### Notifications

The backend exposes:

``` text
POST /events/notification
```

Notification processing is event-driven and can use Resend when
configured.

## Backend API endpoints

The production backend currently exposes:

``` text
GET  /health

POST /actions/trigger-workflow-run
POST /actions/approve-step
POST /actions/trigger-workflow-webhook

POST /events/notification
POST /events/database
```

Production backend:

``` text
https://ai-agent-workflow-builder-wgz8.onrender.com
```

Health check:

``` text
https://ai-agent-workflow-builder-wgz8.onrender.com/health
```

The production health endpoint verifies both the running backend and its
PostgreSQL connection.

## Tech stack

### Frontend

-   Next.js 16
-   React 19
-   TypeScript
-   Nhost JavaScript SDK
-   GraphQL
-   GraphQL subscriptions

### Backend

-   Node.js
-   TypeScript
-   Express
-   PostgreSQL
-   `pg`
-   Groq SDK
-   Resend
-   `tsx`

### Platform

-   Nhost
-   Hasura GraphQL Engine
-   PostgreSQL
-   Render for the backend
-   Vercel or equivalent for the Next.js frontend

## Project structure

``` text
ai-agent-workflow-builder/
|
+-- backend/
|   +-- src/
|       +-- actions/
|       +-- events/
|       +-- workflow/
|       +-- scheduler.ts
|       +-- db.ts
|       +-- index.ts
|
+-- web/
    +-- app/
    |   +-- dashboard/
    |   +-- login/
    |   +-- workflows/
    |
    +-- src/
        +-- components/
        +-- graphql/
        +-- lib/
        +-- types/
```

## Local setup

### Prerequisites

Install:

-   Node.js
-   npm
-   A Nhost project
-   A configured Hasura/PostgreSQL database
-   A Groq API key for real LLM execution

Optional:

-   Resend API key if notification delivery is being used

### 1. Clone the repository

``` bash
git clone https://github.com/FuadRahmanK/ai-agent-workflow-builder.git
cd ai-agent-workflow-builder
```

### 2. Install backend dependencies

``` bash
cd backend
npm install
```

### 3. Configure backend environment variables

Create:

``` text
backend/.env
```

Configure the environment values required by the backend:

``` env
DATABASE_URL=your_postgresql_connection_string
GROQ_API_KEY=your_groq_api_key

WORKFLOW_DATABASE_EVENT_SECRET=your_database_event_secret

WORKFLOW_SCHEDULER_POLL_MS=10000

RESEND_API_KEY=your_resend_api_key
NOTIFICATION_FROM_EMAIL=your_sender_email
```

`RESEND_API_KEY` and `NOTIFICATION_FROM_EMAIL` are only needed when
notification delivery through Resend is used.

Do not commit `.env` files or API keys to GitHub.

### 4. Start the backend

From `backend/`:

``` bash
npm run dev
```

The backend normally listens on port `4000` locally unless `PORT` is
configured.

### 5. Install frontend dependencies

From the repository root:

``` bash
cd web
npm install
```

### 6. Configure frontend environment

Create:

``` text
web/.env.local
```

Configure the Nhost project values used by the frontend:

``` env
NEXT_PUBLIC_NHOST_SUBDOMAIN=your_nhost_subdomain
NEXT_PUBLIC_NHOST_REGION=your_nhost_region
```

Use the values from your Nhost project.

### 7. Start the frontend

From `web/`:

``` bash
npm run dev
```

The Next.js application will be available on the local development URL
shown by Next.js.

## Production deployment

The backend is deployed on Render.

Current backend:

``` text
https://ai-agent-workflow-builder-wgz8.onrender.com
```

The Render service uses:

``` text
Build:
npm install && npm run build

Start:
npm start
```

The backend package scripts are:

``` json
{
  "dev": "tsx watch src/index.ts",
  "build": "tsc",
  "start": "node dist/index.js"
}
```

The Next.js frontend can be deployed to Vercel or another
Next.js-compatible hosting provider.

### Production integration URLs

Configure Hasura Actions/Event Triggers to use the deployed backend:

``` text
Manual Action:
https://ai-agent-workflow-builder-wgz8.onrender.com/actions/trigger-workflow-run

Approval Action:
https://ai-agent-workflow-builder-wgz8.onrender.com/actions/approve-step

Webhook Action:
https://ai-agent-workflow-builder-wgz8.onrender.com/actions/trigger-workflow-webhook

Database Event:
https://ai-agent-workflow-builder-wgz8.onrender.com/events/database

Notification Event:
https://ai-agent-workflow-builder-wgz8.onrender.com/events/notification
```

## Verification

Before submission, the following checks should pass:

``` bash
# Backend
cd backend
npx tsc --noEmit
npm run build

# Frontend
cd web
npm run lint
npx tsc --noEmit
npm run build
```

The production backend health endpoint should return:

``` json
{
  "status": "ok",
  "database": "connected"
}
```

## Final Task demonstration

The required final scenario should demonstrate the following sequence.

### Organization isolation

1.  Create two organizations.
2.  Give users appropriate roles in each organization.
3.  Log in as an Organization A user.
4.  Build the demonstration workflow.
5.  Log in as an Organization B user.
6.  Verify that Organization B cannot see Organization A's workflow.
7.  Verify that Organization B cannot trigger or approve Organization
    A's workflow, including when an ID is known directly.

### Demonstration workflow

Organization A's workflow should include:

``` text
llm_call
    |
    v
http_request
    |
    v
conditional_branch
    |
    v
approval_gate
    |
    v
next workflow step(s)
```

The conditional branch should use the LLM output to determine which path
executes.

### Execution

Demonstrate:

1.  Start the workflow manually.
2.  Show the `workflow_run`.
3.  Show live `step_runs`.
4.  Show the LLM and HTTP steps executing.
5.  Show the conditional branch selecting its path.
6.  Reach the approval gate.
7.  Show the workflow becoming `paused`.
8.  Approve using an authorized organization member.
9.  Show the workflow changing back to `running`.
10. Show the workflow completing.
11. Start the workflow through a non-manual trigger.
12. Show the second run appearing without using the Run button.
13. Demonstrate Organization B isolation.

## Security notes

-   Environment files are excluded from Git.
-   API keys are kept in environment variables.
-   Database-event requests can be protected by the configured event
    secret.
-   Workflow access is scoped to organization membership.
-   Viewer users cannot trigger workflows.
-   Restricted workflow capabilities are checked beyond basic UI
    visibility.
-   Approval authorization is performed in the backend Action handler.
-   Approval queries join the requested step to the user's organization
    membership, preventing cross-organization approval by guessed IDs.

## Submission

### Repository

``` text
https://github.com/FuadRahmanK/ai-agent-workflow-builder
```

### Hosted application

Replace this placeholder with the final deployed Next.js URL before
submission:

``` text
YOUR_HOSTED_NEXTJS_URL
```

### Backend

``` text
https://ai-agent-workflow-builder-wgz8.onrender.com
```

### Recommended submission package

Submit:

1.  GitHub repository URL
2.  Hosted Next.js application URL
3.  Approximately one-page architecture/security write-up
4.  Short recording of the Final Task scenario

The recording should focus on the complete end-to-end scenario rather
than individual implementation details.
