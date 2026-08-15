export const INSERT_WORKFLOW_TRIGGER = `
  mutation InsertWorkflowTrigger(
    $workflowId: uuid!
    $type: String!
    $config: jsonb!
    $enabled: Boolean!
  ) {
    insert_workflow_triggers_one(
      object: {
        workflow_id: $workflowId
        type: $type
        config: $config
        enabled: $enabled
      }
    ) {
      id
      workflow_id
      type
      config
      enabled
    }
  }
`;

export const UPDATE_WORKFLOW_TRIGGER = `
  mutation UpdateWorkflowTrigger(
    $id: uuid!
    $type: String!
    $config: jsonb!
    $enabled: Boolean!
  ) {
    update_workflow_triggers_by_pk(
      pk_columns: {
        id: $id
      }
      _set: {
        type: $type
        config: $config
        enabled: $enabled
        next_run_at: null
      }
    ) {
      id
      workflow_id
      type
      config
      enabled
    }
  }
`;

export const DELETE_WORKFLOW_TRIGGER = `
  mutation DeleteWorkflowTrigger(
    $id: uuid!
  ) {
    delete_workflow_triggers_by_pk(
      id: $id
    ) {
      id
    }
  }
`;