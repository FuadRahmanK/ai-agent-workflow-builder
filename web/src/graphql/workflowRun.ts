export const GET_WORKFLOW_RUN = `
  query GetWorkflowRun($runId: uuid!) {
    workflow_runs_by_pk(id: $runId) {
      id
      workflow_id
      trigger_type
      status
      error
      started_at
      completed_at

      step_runs(
        order_by: {
          started_at: asc
        }
      ) {
        id
        workflow_run_id
        workflow_step_id
        status
        input
        output
        error
        attempt_count
        approved_by
        approved_at
        started_at
        completed_at

        workflow_step {
          id
          name
          type
          position
        }
      }
    }
  }
`;