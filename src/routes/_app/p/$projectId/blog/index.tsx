import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ProjectPageHeader } from "@/client/features/projects/ProjectPageHeader";
import { BlogArticlesCard } from "@/client/features/blog/BlogArticlesCard";
import { BlogSettingsCard } from "@/client/features/blog/BlogSettingsCard";
import { BlogTopicsCard } from "@/client/features/blog/BlogTopicsCard";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/client/components/ui/tabs";

const TABS = ["articles", "topics", "settings"] as const;
type BlogTab = (typeof TABS)[number];

export const Route = createFileRoute("/_app/p/$projectId/blog/")({
  validateSearch: z.object({ tab: z.enum(TABS).optional() }),
  component: BlogRoute,
});

function BlogRoute() {
  const { projectId } = Route.useParams();
  const { tab = "articles" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const setTab = (next: BlogTab) =>
    void navigate({
      search: { tab: next === "articles" ? undefined : next },
      replace: true,
    });

  return (
    <div className="h-full overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <ProjectPageHeader projectId={projectId} title="Blog Generator" />
        <Tabs
          value={tab}
          onValueChange={(value) => {
            const next = TABS.find((entry) => entry === value);
            if (next) setTab(next);
          }}
        >
          <TabsList>
            <TabsTrigger value="articles">Articles</TabsTrigger>
            <TabsTrigger value="topics">Topic ideas</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="articles" className="pt-4">
            <BlogArticlesCard
              projectId={projectId}
              onFindTopics={() => setTab("topics")}
            />
          </TabsContent>
          <TabsContent value="topics" className="pt-4">
            <BlogTopicsCard projectId={projectId} />
          </TabsContent>
          <TabsContent value="settings" className="max-w-3xl pt-4">
            <BlogSettingsCard projectId={projectId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
