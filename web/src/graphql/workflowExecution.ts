export const TRIGGER_WORKFLOW_RUN = `
  mutation TriggerWorkflowRun(
    $workflowId: uuid!
  ) {
    triggerWorkflowRun(
      workflow_id: $workflowId
    ) {
      message
      workflow_run_id
      workflow_id
      status
    }
  }
`;