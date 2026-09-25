import { and, asc, desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActionLink } from "@/components/ui/action-link";
import { EmptyPanel, Panel } from "@/components/ui/panel";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { AppShell } from "@/components/app-shell";
import { Workspace } from "@/components/ui/workspace";
import { getSessionUser } from "@/lib/auth";
import { getVisibleProject, isProjectMember } from "@/lib/project-access";
import { db, knowledgeRecords } from "@/db";

export const dynamic = "force-dynamic";

type SearchParams = { q?: string; tag?: string };
type KnowledgeEntry = {
  id: string;
  title: string;
  content?: string | null;
  summary?: string | null;
  tags?: string[];
  status?: string;
  work_item_id?: string | null;
  project_id?: string;
  published_at?: string | Date | null;
  created_at?: string | Date | null;
};

export default async function ProjectKnowledgePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const query = await searchParams;
  const project = await getVisibleProject(id, user);
  if (!project || !(await isProjectMember(project.id, user))) notFound();

  const conditions = [eq(knowledgeRecords.projectId, project.id), eq(knowledgeRecords.status, "published")];
  const q = query.q?.trim() ?? "";
  const tag = query.tag?.trim() ?? "";
  if (q) {
    const pattern = `%${q}%`;
    conditions.push(sql`(${knowledgeRecords.title} ILIKE ${pattern} OR ${knowledgeRecords.summary} ILIKE ${pattern} OR ${knowledgeRecords.content} ILIKE ${pattern})`);
  }
  if (tag) conditions.push(sql`${tag} = ANY(${knowledgeRecords.tags})`);
  const entries = await db
    .select({
      id: knowledgeRecords.id,
      title: knowledgeRecords.title,
      content: knowledgeRecords.content,
      summary: knowledgeRecords.summary,
      tags: knowledgeRecords.tags,
      status: knowledgeRecords.status,
      work_item_id: knowledgeRecords.workItemId,
      project_id: knowledgeRecords.projectId,
      published_at: knowledgeRecords.publishedAt,
      created_at: knowledgeRecords.createdAt,
    })
    .from(knowledgeRecords)
    .where(and(...conditions))
    .orderBy(desc(knowledgeRecords.publishedAt), asc(knowledgeRecords.id))
    .limit(100);

  return (
    <AppShell user={user} activeNav="projects">
      <Workspace>
        <PageHeader
          eyebrow="组织知识库"
          title={`${project.displayName ?? "未命名项目"} · 知识`}
          description="检索已经验收并沉淀的决策、约束和验证方法，回到来源工作项继续查看证据。"
          actions={<><ActionLink href={`/projects/${project.id}/work`} variant="primary">工作流</ActionLink><ActionLink href={`/projects/${project.id}`}>项目态势</ActionLink></>}
        />
        <Panel title="检索知识" description="仅项目成员可见；默认展示已发布内容。">
          <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px_auto]" method="get">
            <input name="q" defaultValue={query.q ?? ""} className="tp-input w-full" placeholder="搜索标题、摘要或正文" />
            <input name="tag" defaultValue={query.tag ?? ""} className="tp-input w-full" placeholder="标签（可选）" />
            <button type="submit" className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background">搜索</button>
          </form>
        </Panel>
        <Panel title={`知识条目 · ${entries.length}`}>
          {entries.length === 0 ? <EmptyPanel>暂时没有匹配的已发布知识。验收工作项后，可以在详情页提炼一条组织结论。</EmptyPanel> : <div className="space-y-3">{entries.map((entry) => <KnowledgeCard key={entry.id} projectId={project.id} entry={entry} />)}</div>}
        </Panel>
      </Workspace>
    </AppShell>
  );
}

function KnowledgeCard({ projectId, entry }: { projectId: string; entry: KnowledgeEntry }) {
  const date = entry.published_at ?? entry.created_at;
  return <article className="rounded-[20px] border border-black/[0.07] bg-white/70 p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h2 className="text-base font-semibold">{entry.title}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{entry.summary ?? entry.content ?? "暂无摘要"}</p></div>
      <StatusBadge tone={entry.status === "published" ? "online" : "slate"}>{entry.status === "published" ? "已发布" : entry.status ?? "知识"}</StatusBadge>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {entry.tags?.map((tag) => <span key={tag} className="rounded-full bg-surface px-2 py-1">#{tag}</span>)}
      {date && <span>发布于 {new Date(date).toLocaleDateString("zh-CN")}</span>}
      {entry.work_item_id && <Link href={`/projects/${projectId}/work/${entry.work_item_id}`} className="font-medium text-foreground underline underline-offset-2">查看来源工作项 →</Link>}
    </div>
  </article>;
}
