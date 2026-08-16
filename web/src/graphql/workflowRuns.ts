export const GET_WORKFLOW_RUNS = `
  query GetWorkflowRuns(
    $workflowId: uuid!
  ) {
    workflow_runs(
      where: {
        workflow_id: {
          _eq: $workflowId
        }
      }
      order_by: {
        started_at: desc
      }
    ) {
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