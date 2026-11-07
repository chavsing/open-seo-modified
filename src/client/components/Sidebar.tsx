import { Link, useLocation, useMatchRoute } from "@tanstack/react-router";
import type { LinkOptions } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type ComponentType } from "react";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  Check,
  CircleHelp,
  CreditCard,
  LogOut,
  Settings,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";
import { organizationContextQueryOptions } from "@/client/features/team/organizationQueries";
import { switchOrganization } from "@/serverFunctions/organization";
import { getAdminStatus } from "@/serverFunctions/admin";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { clearLastProjectId } from "@/client/lib/active-project";
import {
  connectNavGroup,
  getProjectNavGroups,
} from "@/client/navigation/items";
import { ProjectSwitcher } from "@/client/features/projects/ProjectSwitcher";
import {
  SamChatListSkeleton,
  SamSidebarPanel,
} from "@/client/features/sam/SamSidebarPanel";
import {
  ThemePreferenceRadio,
  ThemeToggleButton,
} from "@/client/components/ThemePreferenceMenuItems";
import { Button } from "@/client/components/ui/button";
import { PRO_PLAN_OFFER } from "@/client/features/billing/plan-offers";
import { useCreditBalance } from "@/client/features/billing/useCreditBalance";
import { useCanManageBilling } from "@/client/features/team/organizationQueries";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { signOutAndRedirect, useSession } from "@/lib/auth-client";
import { BILLING_ROUTE, SUBSCRIBE_ROUTE } from "@/shared/billing";
import {
  Sidebar as UiSidebar,
  SidebarContent,
  SidebarFooter as UiSidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  useSidebar,
} from "@/client/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
import { BRAND_NAME } from "@/shared/brand";

// The active page is a filled violet pill with white text.
const navButtonClass =
  "relative text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground data-active:bg-sidebar-primary data-active:font-semibold data-active:text-sidebar-primary-foreground data-active:hover:bg-sidebar-primary/90 data-active:hover:text-sidebar-primary-foreground";

function SidebarNavLink({
  icon: Icon,
  label,
  linkProps,
  placeholder = false,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  linkProps: LinkOptions;
  /** Show the row without its link, while its project is still unknown. */
  placeholder?: boolean;
}) {
  const { setOpenMobile } = useSidebar();
  const matchRoute = useMatchRoute();
  const isPromptHistory =
    linkProps.to === "/p/$projectId/ai-visibility" &&
    Boolean(
      matchRoute({
        to: "/p/$projectId/ai-visibility/prompts/$promptId",
        fuzzy: true,
      }),
    );
  const row = (isActive: boolean) => (
    <SidebarMenuButton
      render={<span />}
      isActive={isActive}
      aria-disabled={placeholder || undefined}
      className={navButtonClass}
    >
      <Icon className="size-4" />
      <span>{label}</span>
    </SidebarMenuButton>
  );
  return (
    <SidebarMenuItem>
      {placeholder ? (
        row(false)
      ) : (
        <Link
          {...linkProps}
          activeOptions={{
            exact: false,
            includeSearch: false,
            ...linkProps.activeOptions,
          }}
          onClick={() => setOpenMobile(false)}
          inactiveProps={
            isPromptHistory ? { "aria-current": "page" } : undefined
          }
        >
          {({ isActive }) => row(isActive || isPromptHistory)}
        </Link>
      )}
    </SidebarMenuItem>
  );
}

export function Sidebar({
  projectId,
  projectPending,
  ready,
}: {
  projectId: string | null;
  /** No project is known yet, but the projects list may still name one. */
  projectPending: boolean;
  /** The session is confirmed, so the sidebar's own data can load. */
  ready: boolean;
}) {
  // Until a project is known, show the project nav as rows without links, so
  // the sidebar has its full shape from the first paint instead of growing
  // once projects load. The placeholder rows never render these links.
  const navPlaceholder = projectId === null && projectPending;
  const navGroups =
    projectId !== null || navPlaceholder
      ? getProjectNavGroups(projectId ?? "")
      : [connectNavGroup];
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  // SAM is hidden from navigation: the chat route is only reachable by URL,
  // and while it is open its chat list takes the nav's place.
  const onSamRoute = pathname.includes("/sam");

  return (
    <UiSidebar variant="inset" collapsible="offcanvas" className="md:!p-0">
      <SidebarHeader className="gap-0 px-3 pb-1 pt-3">
        <div className="flex items-center justify-between gap-2 pb-2">
          <Link
            to="/"
            onClick={() => setOpenMobile(false)}
            className="flex items-center gap-2 px-1 text-base font-bold tracking-tight text-sidebar-foreground"
          >
            <img src="/transparent-logo.png" alt="" className="size-7" />
            {BRAND_NAME}
          </Link>
          <ThemeToggleButton className="text-sidebar-foreground/70" />
        </div>
        <ProjectSwitcher
          activeProjectId={projectId}
          ready={ready}
          onCloseDrawer={() => setOpenMobile(false)}
        />
      </SidebarHeader>

      <SidebarContent>
        {onSamRoute && projectId ? (
          ready ? (
            <SamSidebarPanel
              projectId={projectId}
              onNavigate={() => setOpenMobile(false)}
            />
          ) : (
            <div className="px-2 py-1">
              <SamChatListSkeleton />
            </div>
          )
        ) : (
          <nav
            aria-label="Main navigation"
            aria-busy={navPlaceholder || undefined}
          >
            {navGroups.map((group) => (
              <SidebarGroup key={group.label} className="py-1">
                <SidebarGroupLabel className="h-7 uppercase tracking-wider text-sidebar-foreground/40">
                  {group.label}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => {
                      const { icon, label, ...linkProps } = item;
                      return (
                        <SidebarNavLink
                          key={linkProps.to}
                          icon={icon}
                          label={label}
                          linkProps={linkProps}
                          placeholder={navPlaceholder}
                        />
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </nav>
        )}
      </SidebarContent>
      {/* Billing exists only in hosted mode, and waits for the session. */}
      {ready && isHostedClientAuthMode() ? (
        <UpgradeCard onNavigate={() => setOpenMobile(false)} />
      ) : null}
      <AccountFooter ready={ready} />
    </UiSidebar>
  );
}

/** Free-plan nudge at the foot of the sidebar, for whoever can upgrade. */
function UpgradeCard({ onNavigate }: { onNavigate: () => void }) {
  const { accountQuery, isFreePlan } = useCreditBalance();
  const canManageBilling = useCanManageBilling();
  if (!accountQuery.data || !isFreePlan || !canManageBilling) return null;

  return (
    // Hidden on short screens, where it would push the menu out of view.
    <div className="relative mx-3 mb-3 overflow-hidden rounded-xl border glass-panel p-4 [@media(max-height:820px)]:hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 -right-10 size-32 rounded-full bg-brand/25 blur-2xl"
      />
      <div className="relative space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-sidebar-foreground">
          <Sparkles className="size-4 text-primary" />
          Upgrade to Pro
        </div>
        <p className="text-xs leading-relaxed text-sidebar-foreground/70">
          Every feature and ${PRO_PLAN_OFFER.includedCreditsUsd} of credits each
          month.
        </p>
        <Button
          size="sm"
          className="w-full"
          nativeButton={false}
          render={
            <Link
              to={SUBSCRIBE_ROUTE}
              search={{ upgrade: true }}
              onClick={onNavigate}
            />
          }
        >
          Go Pro
        </Button>
      </div>
    </div>
  );
}

function AccountFooter({ ready }: { ready: boolean }) {
  const { data: session } = useSession();
  const { setOpenMobile } = useSidebar();
  const email = session?.user?.email;
  const [isSwitching, setIsSwitching] = useState(false);
  const orgContextQuery = useQuery({
    ...organizationContextQueryOptions(),
    enabled: Boolean(email),
  });
  const organizations = orgContextQuery.data?.organizations ?? [];
  const activeOrganizationId = orgContextQuery.data?.organizationId;
  // Only the emails in ADMIN_EMAILS see the admin page link.
  const adminStatusQuery = useQuery({
    queryKey: ["admin", "status"],
    queryFn: () => getAdminStatus(),
    enabled: Boolean(email) && isHostedClientAuthMode(),
    staleTime: Infinity,
  });

  async function handleSwitchOrganization(organizationId: string) {
    if (isSwitching || organizationId === activeOrganizationId) return;
    setIsSwitching(true);
    try {
      await switchOrganization({ data: { organizationId } });
      // The remembered project belongs to the old workspace; without this,
      // "/" would open it before the access check bounces back.
      clearLastProjectId();
      window.location.assign("/");
    } catch (error) {
      toast.error(getStandardErrorMessage(error));
      setIsSwitching(false);
    }
  }

  return (
    <UiSidebarFooter className="gap-0 border-t border-sidebar-border pb-safe">
      <SidebarMenu>
        {adminStatusQuery.data?.isAdmin ? (
          <SidebarNavLink
            icon={ShieldCheck}
            label="Admin"
            linkProps={{ to: "/admin" }}
          />
        ) : null}
        <SidebarNavLink
          icon={CircleHelp}
          label="Help & Support"
          linkProps={{ to: "/support" }}
        />
        {email ? (
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    className={navButtonClass}
                    aria-label="Open account menu"
                  />
                }
              >
                <User className="size-4" />
                <span className="truncate" data-ph-mask>
                  {email}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" className="w-56">
                {organizations.length > 1 ? (
                  <>
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="flex items-center gap-1.5">
                        <ArrowLeftRight className="size-3" />
                        Organization
                      </DropdownMenuLabel>
                      {organizations.map((organization) => (
                        <DropdownMenuItem
                          key={organization.organizationId}
                          disabled={isSwitching}
                          onClick={() =>
                            void handleSwitchOrganization(
                              organization.organizationId,
                            )
                          }
                        >
                          <span className="truncate">
                            {organization.organizationName}
                          </span>
                          {organization.organizationId ===
                          activeOrganizationId ? (
                            <Check className="ml-auto size-4" />
                          ) : null}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                    <DropdownMenuSeparator />
                  </>
                ) : null}
                <DropdownMenuItem
                  render={
                    <Link to="/settings" onClick={() => setOpenMobile(false)} />
                  }
                >
                  <Settings className="size-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem
                  render={
                    <Link
                      to={BILLING_ROUTE}
                      onClick={() => setOpenMobile(false)}
                    />
                  }
                >
                  <CreditCard className="size-4" />
                  Billing
                </DropdownMenuItem>
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Theme</DropdownMenuLabel>
                  <div className="px-1 pb-1">
                    <ThemePreferenceRadio />
                  </div>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => signOutAndRedirect()}
                >
                  <LogOut className="size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        ) : ready ? (
          <SidebarNavLink
            icon={Settings}
            label="Settings"
            linkProps={{ to: "/settings" }}
          />
        ) : (
          // The account row's slot while the session loads.
          <SidebarMenuItem>
            <SidebarMenuSkeleton showIcon />
          </SidebarMenuItem>
        )}
      </SidebarMenu>
    </UiSidebarFooter>
  );
}
