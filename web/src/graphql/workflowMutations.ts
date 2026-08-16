export const UPDATE_WORKFLOW = `
  mutation UpdateWorkflow(
    $id: uuid!
    $name: String!
    $description: String
  ) {
    update_workflows_by_pk(
      pk_columns: {
        id: $id
      }
      _set: {
        name: $name
        description: $description
      }
    ) {
      id
      name
      description
    }
  }
`;

export const INSERT_WORKFLOW = `
  mutation InsertWorkflow(
    $name: String!
    $description: String
    $orgId: uuid!
  ) {
    insert_workflows_one(
      object: {
        name: $name
        description: $description
        org_id: $orgId
      }
    ) {
      id
      name
      description
      org_id
    }
  }
`;

export const INSERT_WORKFLOW_STEP = `
  mutation InsertWorkflowStep(
    $workflowId: uuid!
    $name: String!
    $type: String!
    $position: Int!
    $config: jsonb!
    $branch: String
  ) {
    insert_workflow_steps_one(
      object: {
        workflow_id: $workflowId
        name: $name
        type: $type
        position: $position
        config: $config
        branch: $branch
      }
    ) {
      id
      workflow_id
      name
      type
      position
      config
      branch
    }
  }
`;

export const UPDATE_WORKFLOW_STEP = `
  mutation UpdateWorkflowStep(
    $id: uuid!
    $name: String!
    $type: String!
    $position: Int!
    $config: jsonb!
    $branch: String
  ) {
    update_workflow_steps_by_pk(
      pk_columns: {
        id: $id
      }
      _set: {
        name: $name
        type: $type
        position: $position
        config: $config
        branch: $branch
      }
    ) {
      id
      workflow_id
      name
      type
      position
      config
      branch
    }
  }
`;

export const DELETE_WORKFLOW_STEP = `
  mutation DeleteWorkflowStep(
    $id: uuid!
  ) {
    delete_workflow_steps_by_pk(
      id: $id
    ) {
      id
    }
  }
`;

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

export const DELETE_WORKFLOW = `
  mutation DeleteWorkflow(
    $id: uuid!
  ) {
    delete_workflows_by_pk(
      id: $id
    ) {
      id
    }
  }
`;