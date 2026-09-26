import { and, eq, isNull } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Workspace } from "@/components/ui/workspace";
import { WorkItemDetail } from "@/components/work-items/work-item-detail";
import type { WorkAgent, WorkMember } from "@/components/work-items/work-item-types";
import { db, devices, projectMembers, users } from "@/db";
import { getSessionUser } from "@/lib/auth";
import { canWriteProject, getProjectMembership, getVisibleProject, isProjectMember } from "@/lib/project-access";

export const dynamic = "force-dynamic";

export default async function ProjectWorkItemPage({ params }: { params: Promise<{ id: string; itemId: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { id, itemId } = await params;
  const project = await getVisibleProject(id, user);
  if (!project) notFound();
  if (!(await isProjectMember(project.id, user))) notFound();

  const membership = await getProjectMembership(project.id, user);
  const canEdit = await canWriteProject(project.id, user);
  const canManage = membership?.role === "owner" || user.role === "admin";
  const members = await db
    .select({ id: users.id, name: users.name, displayName: users.displayName, role: projectMembers.role })
    .from(projectMembers)
    .innerJoin(users, eq(projectMembers.userId, users.id))
    .where(and(eq(projectMembers.projectId, project.id), isNull(users.revokedAt)));
  const agents = await db
    .select({ id: devices.id, userId: devices.userId, name: devices.agentName, type: devices.agentType, role: devices.agentRole, capabilities: devices.capabilities })
    .from(devices)
    .innerJoin(projectMembers, eq(devices.userId, projectMembers.userId))
    .where(and(eq(projectMembers.projectId, project.id), eq(devices.status, "active")));

  return (
    <AppShell user={user} activeNav="projects">
      <Workspace>
        <PageHeader
          eyebrow="工作项详情"
          title={project.displayName ?? "未命名项目"}
          description="需求、执行记录和验收。"
        />
        <WorkItemDetail
          projectId={project.id}
          itemId={itemId}
          members={members as WorkMember[]}
          agents={agents.map((agent) => ({ ...agent, userId: agent.userId!, name: agent.name ?? agent.type ?? "Agent" })) as WorkAgent[]}
          canEdit={canEdit}
          canManage={canManage}
          canReview={canManage}
          currentUserId={user.id}
          jevEnabled={project.jevEnabled}
        />
      </Workspace>
    </AppShell>
  );
}
