export const GET_MY_ORGANIZATIONS = `
  query GetMyOrganizations($userId: uuid!) {
    org_members(
      where: {
        user_id: { _eq: $userId }
      }
      order_by: {
        organization: {
          name: asc
        }
      }
    ) {
      id
      role
      organization {
        id
        name
        quota_limit
        quota_used
      }
    }
  }
`;