import { queryOptions, useQuery } from "@tanstack/react-query";
import { canEditWorkspace, hasOrgPermission } from "@/lib/org-permissions";
import { getOrganizationContext } from "@/serverFunctions/organization";

export const organizationContextQueryOptions = () =>
  queryOptions({
    queryKey: ["organization-context"],
    queryFn: () => getOrganizationContext(),
    staleTime: 60 * 1000,
  });

// True while loading: the sole-owner workspace is the overwhelmingly common
// case, and every billing surface is enforced server-side anyway — favor not
// flashing "ask your owner" at actual owners. This is a deliberate cosmetic
// choice, not an authorization gate; the server always re-checks billing:manage.
export function useCanManageBilling() {
  const { data } = useQuery(organizationContextQueryOptions());
  return data ? hasOrgPermission(data.role, { billing: ["manage"] }) : true;
}

// False while loading, like useCanManageBilling: a view-only member is rare,
// and the server refuses their changes either way.
export function useIsViewOnly(enabled = true) {
  const { data } = useQuery({ ...organizationContextQueryOptions(), enabled });
  return data ? !canEditWorkspace(data.role) : false;
}
