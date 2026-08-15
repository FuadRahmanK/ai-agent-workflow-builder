export const GET_MY_WORKFLOWS = `
  query GetMyWorkflows($orgId: uuid!) {
    workflows(
      where: {
        org_id: { _eq: $orgId }
      }
      order_by: {
        created_at: desc
      }
    ) {
      id
      name
      description

      workflow_steps(
        order_by: {
          position: asc
        }
      ) {
        id
        name
        type
        position
      }

      workflow_triggers {
        id
        type
        config
      }

      workflow_runs(
        order_by: {
          started_at: desc
        }
        limit: 5
      ) {
        id
        status
        started_at
        completed_at
      }
    }
  }
`;