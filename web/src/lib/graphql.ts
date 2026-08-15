import { nhost } from "./nhost";

export async function graphqlRequest<
  TData,
  TVariables extends Record<string, unknown>
>(
  query: string,
  variables: TVariables
): Promise<TData> {
  const response =
    await nhost.graphql.request<TData, TVariables>({
      query,
      variables,
    });

  if (response.body.errors?.length) {
    throw new Error(
      response.body.errors[0].message
    );
  }

  return response.body.data as TData;
}