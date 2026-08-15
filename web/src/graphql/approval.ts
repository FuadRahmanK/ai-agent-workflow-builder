export const APPROVE_STEP = `
  mutation ApproveStep(
    $stepRunId: uuid!
  ) {
    approveStep(
      step_run_id: $stepRunId
    ) {
      message
      workflow_run_id
      status
    }
  }
`;