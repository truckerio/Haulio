"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

type Task = {
  id: string;
  title: string;
  type: string;
  priority: string;
  dueAt: string | null;
  load?: { loadNumber: string } | null;
  driver?: { name: string } | null;
  customer?: { name: string } | null;
  assignedToId?: string | null;
  assignedRole?: string | null;
};

export default function DashboardPage() {
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [roleTasks, setRoleTasks] = useState<Task[]>([]);
  const [assignees, setAssignees] = useState<Array<{ id: string; name?: string; email: string; role: string }>>([]);
  const [me, setMe] = useState<{ id: string; role: string } | null>(null);
  const [canAssign, setCanAssign] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTasks = async () => {
    try {
      const data = await apiFetch<{ myTasks: Task[]; roleTasks: Task[] }>("/tasks/inbox");
      setMyTasks(data.myTasks);
      setRoleTasks(data.roleTasks);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const loadAssignees = async () => {
    try {
      const userData = await apiFetch<{ user: { id: string; role: string } }>("/auth/me");
      setMe(userData.user);
      const data = await apiFetch<{ users: Array<{ id: string; name?: string; email: string; role: string }> }>(
        "/tasks/assignees"
      );
      setAssignees(data.users);
      setCanAssign(true);
    } catch {
      setCanAssign(false);
    }
  };

  useEffect(() => {
    loadTasks();
    loadAssignees();
  }, []);

  const completeTask = async (id: string) => {
    await apiFetch(`/tasks/${id}/complete`, { method: "POST" });
    loadTasks();
  };

  const assignTask = async (id: string, assignedToId: string | null, assignedRole?: string | null) => {
    await apiFetch(`/tasks/${id}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignedToId, assignedRole }),
    });
    loadTasks();
  };

  return (
    <AppShell title="Task Inbox" subtitle="Action-first queue for ops">
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      <Card className="space-y-3">
        <div className="text-xs uppercase tracking-widest text-black/50">My tasks</div>
        <div className="grid gap-3">
          {myTasks.map((task) => (
            <Card key={task.id} className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-xs uppercase tracking-widest text-black/50">{task.type} · {task.priority}</div>
                <div className="text-lg font-semibold">{task.title}</div>
                <div className="text-sm text-black/60">
                  Load {task.load?.loadNumber ?? "-"} · {task.customer?.name ?? "Customer"}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => completeTask(task.id)}>Mark done</Button>
                {canAssign && me ? (
                  <Button variant="secondary" onClick={() => assignTask(task.id, null, me.role)}>
                    Send to queue
                  </Button>
                ) : null}
              </div>
            </Card>
          ))}
          {myTasks.length === 0 ? <div className="text-sm text-black/60">No tasks assigned to you.</div> : null}
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="text-xs uppercase tracking-widest text-black/50">Role queue</div>
        <div className="grid gap-3">
          {roleTasks.map((task) => (
            <Card key={task.id} className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-xs uppercase tracking-widest text-black/50">{task.type} · {task.priority}</div>
                <div className="text-lg font-semibold">{task.title}</div>
                <div className="text-sm text-black/60">
                  Load {task.load?.loadNumber ?? "-"} · {task.customer?.name ?? "Customer"}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => me && assignTask(task.id, me.id)}>
                  Assign to me
                </Button>
                {canAssign && assignees.length ? (
                  <select
                    className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                    defaultValue=""
                    onChange={(event) => {
                      if (event.target.value) {
                        assignTask(task.id, event.target.value);
                      }
                    }}
                  >
                    <option value="">Assign to user</option>
                    {assignees.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name ?? user.email} · {user.role}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            </Card>
          ))}
          {roleTasks.length === 0 ? <div className="text-sm text-black/60">No tasks in your queue.</div> : null}
        </div>
      </Card>
    </AppShell>
  );
}
