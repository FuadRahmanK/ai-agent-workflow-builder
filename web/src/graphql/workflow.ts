export const GET_WORKFLOW = `
  query GetWorkflow($id: uuid!) {
    workflows(
      where: {
        id: { _eq: $id }
      }
      limit: 1
    ) {
      id
      name
      description
      org_id

      workflow_steps(
        order_by: {
          position: asc
        }
      ) {
        id
        name
        type
        position
        config
        branch
      }

      workflow_triggers {
        id
        type
        config
        enabled
      }

      workflow_runs(
        order_by: {
          started_at: desc
        }
        limit: 5
      ) {
        id
        status
        trigger_type
        started_at
        completed_at
        error
      }
    }
  }
`;