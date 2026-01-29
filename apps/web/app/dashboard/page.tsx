"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { apiFetch } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";

type Task = {
  id: string;
  taskKey: string;
  title: string;
  type: string;
  priority: string;
  status: string;
  dueAt: string | null;
  derivedDueAt: string | null;
  loadNumber?: string | null;
  customerName?: string | null;
  driverName?: string | null;
  invoiceNumber?: string | null;
  assignedToId?: string | null;
  assignedRole?: string | null;
  entityType: string;
  entityId: string;
  deepLink: string;
  primaryActionLabel: string;
};

type TaskResponse = {
  items: Task[];
  total: number;
  page: number;
  limit: number;
};

export default function DashboardPage() {
  const router = useRouter();
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [roleTasks, setRoleTasks] = useState<Task[]>([]);
  const [assignees, setAssignees] = useState<Array<{ id: string; name?: string; email: string; role: string }>>([]);
  const [me, setMe] = useState<{ id: string; role: string; permissions?: string[] } | null>(null);
  const [canAssign, setCanAssign] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"mine" | "queue">("mine");
  const [minePage, setMinePage] = useState(1);
  const [rolePage, setRolePage] = useState(1);
  const [mineTotal, setMineTotal] = useState(0);
  const [roleTotal, setRoleTotal] = useState(0);
  const [filters, setFilters] = useState({ status: "open", priority: "", type: "", search: "" });
  const limit = 10;

  const totalPagesMine = Math.max(1, Math.ceil(mineTotal / limit));
  const totalPagesRole = Math.max(1, Math.ceil(roleTotal / limit));

  const canCompleteTask = (task: Task) => {
    if (!me) return false;
    if (task.assignedToId && task.assignedToId === me.id) return true;
    return canAssign;
  };

  const formatDue = (task: Task) => {
    const dueIso = task.dueAt ?? task.derivedDueAt;
    if (!dueIso) return null;
    const dueDate = new Date(dueIso);
    const diffMs = dueDate.getTime() - Date.now();
    if (Number.isNaN(dueDate.getTime())) return null;
    if (diffMs < 0) return "Overdue";
    const hours = Math.ceil(diffMs / (1000 * 60 * 60));
    if (hours < 24) return `Due in ${hours}h`;
    const days = Math.ceil(hours / 24);
    return `Due in ${days}d`;
  };

  const normalizeDeepLink = (link: string) => {
    if (link.includes("docType=POD") && !link.includes("#")) {
      return `${link}#pod`;
    }
    return link;
  };

  const loadTasks = useCallback(async (targetTab: "mine" | "queue", page: number) => {
    try {
      const params = new URLSearchParams({
        tab: targetTab === "mine" ? "mine" : "role",
        page: String(page),
        limit: String(limit),
      });
      if (filters.status) params.set("status", filters.status);
      if (filters.priority) params.set("priority", filters.priority);
      if (filters.type) params.set("type", filters.type);
      const data = await apiFetch<TaskResponse>(`/tasks/inbox?${params.toString()}`);
      if (targetTab === "mine") {
        setMyTasks(data.items);
        setMineTotal(data.total);
      } else {
        setRoleTasks(data.items);
        setRoleTotal(data.total);
      }
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [filters.status, filters.priority, filters.type, limit]);

  const loadAssignees = useCallback(async () => {
    try {
      const userData = await apiFetch<{ user: { id: string; role: string; permissions?: string[] } }>("/auth/me");
      setMe(userData.user);
      const allowAssign =
        userData.user.role === "ADMIN" ||
        userData.user.role === "DISPATCHER" ||
        userData.user.permissions?.includes("TASK_ASSIGN");
      setCanAssign(Boolean(allowAssign));
      if (allowAssign) {
        const data = await apiFetch<{ users: Array<{ id: string; name?: string; email: string; role: string }> }>(
          "/tasks/assignees"
        );
        setAssignees(data.users);
      } else {
        setAssignees([]);
      }
    } catch {
      setCanAssign(false);
    }
  }, []);

  useEffect(() => {
    loadAssignees();
  }, [loadAssignees]);

  useEffect(() => {
    if (tab === "mine") {
      loadTasks("mine", minePage);
    } else {
      loadTasks("queue", rolePage);
    }
  }, [tab, minePage, rolePage, loadTasks]);

  useEffect(() => {
    setMinePage(1);
    setRolePage(1);
  }, [filters.status, filters.priority, filters.type]);

  const completeTask = async (task: Task) => {
    await apiFetch(`/tasks/${task.id}/complete`, { method: "POST" });
    if (tab === "mine") {
      setMyTasks((prev) => {
        const next = prev.filter((item) => item.id !== task.id);
        if (prev.length === 1 && minePage > 1) {
          setMinePage(minePage - 1);
        }
        return next;
      });
      setMineTotal((prev) => Math.max(0, prev - 1));
    } else {
      setRoleTasks((prev) => {
        const next = prev.filter((item) => item.id !== task.id);
        if (prev.length === 1 && rolePage > 1) {
          setRolePage(rolePage - 1);
        }
        return next;
      });
      setRoleTotal((prev) => Math.max(0, prev - 1));
    }
  };

  const assignTask = async (task: Task, assignedToId: string | null, assignedRole?: string | null) => {
    await apiFetch(`/tasks/${task.id}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignedToId, assignedRole }),
    });
    if (tab === "mine") {
      setMyTasks((prev) => {
        const next = prev.filter((item) => item.id !== task.id);
        if (prev.length === 1 && minePage > 1) {
          setMinePage(minePage - 1);
        }
        return next;
      });
      setMineTotal((prev) => Math.max(0, prev - 1));
    } else {
      setRoleTasks((prev) => {
        const next = prev.filter((item) => item.id !== task.id);
        if (prev.length === 1 && rolePage > 1) {
          setRolePage(rolePage - 1);
        }
        return next;
      });
      setRoleTotal((prev) => Math.max(0, prev - 1));
    }
  };

  const activeTasks = tab === "mine" ? myTasks : roleTasks;
  const filteredTasks = activeTasks.filter((task) => {
    if (!filters.search) return true;
    const needle = filters.search.toLowerCase();
    return (
      task.title.toLowerCase().includes(needle) ||
      task.type.toLowerCase().includes(needle) ||
      (task.loadNumber ?? "").toLowerCase().includes(needle) ||
      (task.customerName ?? "").toLowerCase().includes(needle) ||
      (task.driverName ?? "").toLowerCase().includes(needle) ||
      (task.invoiceNumber ?? "").toLowerCase().includes(needle)
    );
  });
  const activePage = tab === "mine" ? minePage : rolePage;
  const activeTotalPages = tab === "mine" ? totalPagesMine : totalPagesRole;
  const activeTotal = tab === "mine" ? mineTotal : roleTotal;

  return (
    <AppShell title="Task Inbox" subtitle="Action-first queue for ops">
      {error ? <div className="text-sm text-[color:var(--color-danger)]">{error}</div> : null}
      <Card className="space-y-4">
        <SectionHeader
          title="Tasks"
          subtitle="Focus on what needs attention now"
          action={
            <SegmentedControl
              value={tab}
              options={[
                { label: "Mine", value: "mine" },
                { label: "Role Queue", value: "queue" },
              ]}
              onChange={(value) => setTab(value as "mine" | "queue")}
            />
          }
        />
        <div className="grid gap-3 lg:grid-cols-4">
          <FormField label="Search" htmlFor="taskSearch">
            <Input
              placeholder="Load, customer, driver"
              value={filters.search}
              onChange={(event) => setFilters({ ...filters, search: event.target.value })}
            />
          </FormField>
          <FormField label="Status" htmlFor="taskStatus">
            <Select
              value={filters.status}
              onChange={(event) => setFilters({ ...filters, status: event.target.value })}
            >
              <option value="open">Open</option>
              <option value="completed">Completed</option>
            </Select>
          </FormField>
          <FormField label="Priority" htmlFor="taskPriority">
            <Select
              value={filters.priority}
              onChange={(event) => setFilters({ ...filters, priority: event.target.value })}
            >
              <option value="">All priorities</option>
              <option value="HIGH">High</option>
              <option value="MED">Med</option>
              <option value="LOW">Low</option>
            </Select>
          </FormField>
          <FormField label="Type" htmlFor="taskType">
            <Select
              value={filters.type}
              onChange={(event) => setFilters({ ...filters, type: event.target.value })}
            >
              <option value="">All types</option>
              <option value="COLLECT_POD">Collect POD</option>
              <option value="MISSING_DOC">Missing doc</option>
              <option value="STOP_DELAY_FOLLOWUP">Stop delay</option>
              <option value="INVOICE_DISPUTE">Invoice dispute</option>
              <option value="PAYMENT_FOLLOWUP">Payment follow-up</option>
              <option value="DRIVER_COMPLIANCE_EXPIRING">Driver compliance</option>
            </Select>
          </FormField>
        </div>
        <div className="grid gap-3">
          {filteredTasks.map((task) => {
            const dueLabel = formatDue(task);
            const overdue = dueLabel === "Overdue";
            return (
              <div
                key={task.taskKey}
                className="rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-white px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusChip label={task.priority} tone={task.priority === "HIGH" ? "warning" : "neutral"} />
                      <span className="text-xs uppercase tracking-[0.2em] text-[color:var(--color-text-subtle)]">
                        {task.type}
                      </span>
                      {dueLabel ? (
                        <span
                          className={`text-xs ${overdue ? "text-[color:var(--color-danger)]" : "text-[color:var(--color-text-muted)]"}`}
                        >
                          {dueLabel}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-ink">{task.title}</div>
                    <div className="text-xs text-[color:var(--color-text-muted)]">
                      Load {task.loadNumber ?? "-"} · {task.customerName ?? "Customer"}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => router.push(normalizeDeepLink(task.deepLink))}>
                      {task.primaryActionLabel}
                    </Button>
                    {tab === "mine" ? (
                      <>
                        {canCompleteTask(task) ? (
                          <Button size="sm" variant="secondary" onClick={() => completeTask(task)}>
                            Mark done
                          </Button>
                        ) : null}
                        {canAssign && me ? (
                          <Button size="sm" variant="secondary" onClick={() => assignTask(task, null, me.role)}>
                            Send to queue
                          </Button>
                        ) : null}
                      </>
                    ) : (
                      <>
                        {canAssign && me ? (
                          <Button size="sm" variant="secondary" onClick={() => assignTask(task, me.id)}>
                            Assign to me
                          </Button>
                        ) : null}
                        {canAssign && assignees.length ? (
                          <div>
                            <label htmlFor={`assignTask-${task.id}`} className="sr-only">Assign to user</label>
                            <Select
                              id={`assignTask-${task.id}`}
                              defaultValue=""
                              onChange={(event) => {
                                if (event.target.value) {
                                  assignTask(task, event.target.value);
                                }
                              }}
                              className="text-xs"
                            >
                              <option value="">Assign to user</option>
                              {assignees.map((user) => (
                                <option key={user.id} value={user.id}>
                                  {user.name ?? user.email} · {user.role}
                                </option>
                              ))}
                            </Select>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {filteredTasks.length === 0 ? (
            <EmptyState
              title={tab === "mine" ? "No tasks assigned to you." : "No tasks in your role queue."}
              description="You're all caught up."
            />
          ) : null}
        </div>
        <div className="flex items-center justify-between border-t border-[color:var(--color-divider)] pt-3 text-xs text-[color:var(--color-text-muted)]">
          <span>
            Page {activePage} of {activeTotalPages} · {activeTotal} tasks
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => (tab === "mine" ? setMinePage(Math.max(1, minePage - 1)) : setRolePage(Math.max(1, rolePage - 1)))}
              disabled={activePage <= 1}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                tab === "mine"
                  ? setMinePage(Math.min(totalPagesMine, minePage + 1))
                  : setRolePage(Math.min(totalPagesRole, rolePage + 1))
              }
              disabled={activePage >= activeTotalPages}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>
    </AppShell>
  );
}
