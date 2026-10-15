import Link from "next/link";
import { Kanban } from "@/components/board/kanban";
import { NewTaskDialog } from "@/components/tasks/new-task-dialog";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { requireUser, requireWorkspace } from "@/server/auth";
import { loadAssignees, loadBoard } from "@/server/queries/board";

export const metadata = { title: "Board" };

export default async function BoardPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ subtasks?: string }> }) {
  const { slug } = await params;
  const { subtasks } = await searchParams;
  const me = await requireUser();
  const ws = await requireWorkspace(me, slug);
  const [cards, members] = await Promise.all([loadBoard(ws.id), loadAssignees(ws.id)]);
  const showSubtasks = subtasks !== "0";
  return (
    <div>
      <PageHeader
        title="Board"
        description="Drag cards between columns. Blocking asks for a reason; only the owner can approve Done."
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href={showSubtasks ? `/w/${slug}/board?subtasks=0` : `/w/${slug}/board`}>{showSubtasks ? "Hide subtasks" : "Show subtasks"}</Link>
            </Button>
            <NewTaskDialog workspaceId={ws.id} slug={slug} members={members} />
          </>
        }
      />
      <Kanban cards={cards} slug={slug} workspaceId={ws.id} role={me.role} showSubtasks={showSubtasks} />
    </div>
  );
}
