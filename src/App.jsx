/**
 * Taskenhower
 *
 * Features:
 * - Multiple matrices (Work/Personal/Goals pinned + optional Focus matrix)
 * - Combined 2x2 Eisenhower grid view across selected matrices
 * - Drag between quadrants + reorder within a quadrant (per matrix)
 * - Inline task editing (double-click)
 * - Archive + Delete lists with newest/oldest sorting
 * - Export / Import (JSON)
 */

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

const urgencyLevels = ["High", "Medium", "Low", "None"];

const DEFAULT_MATRICES = [
  { id: "work", name: "Work", pinned: true },
  { id: "personal", name: "Personal", pinned: true },
  { id: "goals", name: "Goals", pinned: true },
];

function slugify(input) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function DroppableQuadrant({ id, className, children }) {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`${className} ${isOver ? "ring-2 ring-slate-400" : ""}`}
    >
      {children}
    </div>
  );
}

function DroppableTaskTarget({ id, children }) {
  const { setNodeRef } = useDroppable({ id });
  return <div ref={setNodeRef}>{children}</div>;
}

function DraggableTaskRow({
  task,
  showMatrixBadge,
  matrixName,
  onToggleComplete,
  onArchive,
  onDelete,
  isEditing,
  draftText,
  onStartEdit,
  onChangeDraft,
  onCommitEdit,
  onCancelEdit,
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: task.id,
      data: {
        matrixId: task.matrixId,
        urgency: task.urgency,
      },
    });

  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex items-center justify-between text-sm gap-2 group hover:bg-white/50 rounded px-1">
        <button
          onClick={() => onToggleComplete(task.id)}
          className={`w-3 h-3 rounded-full border-2 mt-1 ${
            task.status === "Completed"
              ? "bg-green-600 border-green-700"
              : "border-slate-400"
          }`}
          title="Toggle complete"
        />

        <button
          {...listeners}
          {...attributes}
          className="invisible group-hover:visible group-focus-within:visible cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
          title="Drag"
          aria-label="Drag task"
        >
          ⠿
        </button>

        {isEditing ? (
          <input
            className="flex-1 border border-slate-300 rounded px-2 py-1 text-sm bg-white"
            value={draftText}
            autoFocus
            onChange={(e) => onChangeDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCommitEdit();
              if (e.key === "Escape") onCancelEdit();
            }}
            onBlur={() => onCommitEdit()}
          />
        ) : (
          <span
            className={`flex-1 cursor-text ${
              task.status === "Completed"
                ? "line-through text-gray-400"
                : "text-gray-800"
            }`}
            onDoubleClick={() => onStartEdit()}
            title="Double-click to edit"
          >
            {task.text}
          </span>
        )}

        {showMatrixBadge && (
          <span
            className="text-[10px] px-1 py-0 rounded bg-slate-200/50 text-slate-500 leading-none opacity-70 tracking-tight whitespace-nowrap self-center"
            title="Which matrix this task belongs to"
          >
            {matrixName}
          </span>
        )}

        <button
          onClick={() => onArchive(task.id)}
          className="text-xs text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          title="Archive task"
        >
          🗃
        </button>

        <button
          onClick={() => onDelete(task.id)}
          className="text-xs text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          title="Delete task"
        >
          🗑️
        </button>
      </div>
    </div>
  );
}

function arrayMove(items, from, to) {
  const next = items.slice();
  const [removed] = next.splice(from, 1);
  next.splice(to, 0, removed);
  return next;
}

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [matrices, setMatrices] = useState(DEFAULT_MATRICES);
  const [hasInitialized, setHasInitialized] = useState(false);

  const [activePinnedIds, setActivePinnedIds] = useState(
    DEFAULT_MATRICES.map((m) => m.id)
  );
  const [focusMatrixId, setFocusMatrixId] = useState("none");

  // Order in which matrices were selected for the combined view (most literal / intentional)
  const [viewOrderIds, setViewOrderIds] = useState(
    DEFAULT_MATRICES.map((m) => m.id)
  );

  // Tracks the most recently selected matrix (used as the default for new tasks)
  const [lastSelectedMatrixId, setLastSelectedMatrixId] = useState("work");

  const [newMatrixName, setNewMatrixName] = useState("");

  const [newTask, setNewTask] = useState({
    text: "",
    matrixId: "work",
    urgency: "Medium",
  });

  const [showArchived, setShowArchived] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [historySort, setHistorySort] = useState("new"); // new | old

  // Export / import
  const [importError, setImportError] = useState("");
  const [importOk, setImportOk] = useState("");

  // Inline edit state
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editDraft, setEditDraft] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  // ---------- helpers (pure) ----------
  function safeJsonParse(str, fallback) {
    try {
      return JSON.parse(str);
    } catch {
      return fallback;
    }
  }

  function ensureDefaultPinnedMatrices(list) {
    const byId = new Map(list.map((m) => [m.id, m]));
    DEFAULT_MATRICES.forEach((m) => {
      if (!byId.has(m.id)) byId.set(m.id, m);
      else {
        const existing = byId.get(m.id);
        byId.set(m.id, { ...existing, name: m.name, pinned: true });
      }
    });
    return Array.from(byId.values());
  }

  function makeUniqueMatrixId(baseId, list) {
    let id = baseId;
    let n = 2;
    while (list.some((m) => m.id === id)) {
      id = `${baseId}-${n}`;
      n += 1;
    }
    return id;
  }

  function migrateTasks(allTasks) {
    const migrated = allTasks.map((t) => {
      if (t.matrixId) return t;

      const tag = t.tag;
      let matrixId = "work";
      if (tag === "Personal") matrixId = "personal";
      if (tag === "Goals") matrixId = "goals";

      const { tag: _tag, ...rest } = t;
      return { ...rest, matrixId };
    });

    const hasAnyOrder = migrated.some((t) => typeof t.order === "number");
    if (hasAnyOrder) return migrated;

    const counters = new Map();
    return migrated.map((t) => {
      const key = `${t.matrixId}__${t.urgency}`;
      const next = counters.get(key) ?? 0;
      counters.set(key, next + 1);
      return { ...t, order: next };
    });
  }

  // ---------- persistence ----------
  useEffect(() => {
    const storedMatrices = localStorage.getItem("matrices");
    const loadedMatrices = storedMatrices
      ? safeJsonParse(storedMatrices, DEFAULT_MATRICES)
      : DEFAULT_MATRICES;

    const normalizedMatrices = ensureDefaultPinnedMatrices(loadedMatrices);
    setMatrices(normalizedMatrices);

    const storedTasks = localStorage.getItem("tasks");
    const loadedTasks = storedTasks ? safeJsonParse(storedTasks, []) : [];

    const migratedTasks = migrateTasks(loadedTasks);
    setTasks(migratedTasks);

    const pinned = normalizedMatrices.filter((m) => m.pinned).map((m) => m.id);
    setActivePinnedIds(pinned);
    setViewOrderIds(pinned);

    // best-effort default
    setLastSelectedMatrixId(pinned[0] ?? "work");
    setNewTask((t) => ({ ...t, matrixId: pinned[0] ?? "work" }));

    setHasInitialized(true);
  }, []);

  useEffect(() => {
    if (!hasInitialized) return;
    localStorage.setItem("tasks", JSON.stringify(tasks));
  }, [tasks, hasInitialized]);

  useEffect(() => {
    if (!hasInitialized) return;
    localStorage.setItem("matrices", JSON.stringify(matrices));
  }, [matrices, hasInitialized]);

  useEffect(() => {
    if (!hasInitialized) return;
    if (focusMatrixId === "none") return;
    const exists = matrices.some((m) => m.id === focusMatrixId);
    if (!exists) {
      setFocusMatrixId("none");
      setViewOrderIds((prev) => prev.filter((id) => id !== focusMatrixId));
    }
  }, [matrices, focusMatrixId, hasInitialized]);

  // Keep newTask.matrixId aligned with the most recently selected matrix,
  // but only when the input is empty (so we don’t disrupt someone mid-entry).
  useEffect(() => {
    if (!hasInitialized) return;
    if (newTask.text.trim() !== "") return;
    if (newTask.matrixId === lastSelectedMatrixId) return;
    setNewTask((t) => ({ ...t, matrixId: lastSelectedMatrixId }));
  }, [lastSelectedMatrixId, hasInitialized, newTask.text, newTask.matrixId]);

  // ---------- view model ----------
  const pinnedMatrices = useMemo(
    () => matrices.filter((m) => m.pinned),
    [matrices]
  );

  const focusCandidates = useMemo(
    () => matrices.filter((m) => !m.pinned),
    [matrices]
  );

  const selectedMatrixIds = useMemo(() => {
    // Literal selection order:
    // - When you turn a matrix on, it’s appended
    // - When you turn it off, it’s removed
    // - Focus behaves like any other selected matrix

    const validIds = new Set(matrices.map((m) => m.id));

    const activeSet = new Set(activePinnedIds);
    if (focusMatrixId !== "none") activeSet.add(focusMatrixId);

    // Start with the remembered order, filtered to valid + currently active ids
    let ordered = viewOrderIds
      .filter((id) => validIds.has(id))
      .filter((id) => activeSet.has(id));

    // Ensure any active ids missing from the order are appended (defensive)
    for (const id of activeSet) {
      if (validIds.has(id) && !ordered.includes(id)) ordered.push(id);
    }

    return ordered;
  }, [matrices, activePinnedIds, focusMatrixId, viewOrderIds]);

  const showMatrixBadges = selectedMatrixIds.length > 1;

  const matrixNameById = useMemo(() => {
    const map = new Map();
    matrices.forEach((m) => map.set(m.id, m.name));
    return map;
  }, [matrices]);

  // ---------- actions: matrices ----------
  const addMatrix = () => {
    const name = newMatrixName.trim();
    if (!name) return;

    const baseId = slugify(name);
    if (!baseId) return;

    const uniqueId = makeUniqueMatrixId(baseId, matrices);

    setMatrices([
      ...matrices,
      {
        id: uniqueId,
        name,
        pinned: false,
      },
    ]);

    setNewMatrixName("");
    setFocusMatrixId(uniqueId);
    setViewOrderIds((prev) => {
      const without = prev.filter((id) => id !== uniqueId);
      return [...without, uniqueId];
    });
    setLastSelectedMatrixId(uniqueId);
    setNewTask((t) => ({ ...t, matrixId: uniqueId }));
  };

  const mergeMatrixInto = (sourceId, destId) => {
    if (!sourceId || sourceId === "none") return;
    if (!destId || sourceId === destId) return;

    setTasks((prev) => {
      const moved = prev.map((t) =>
        t.matrixId === sourceId ? { ...t, matrixId: destId } : t
      );
      let next = moved;
      urgencyLevels.forEach((u) => {
        next = normalizeOrders(next, destId, u);
      });
      return next;
    });

    setMatrices((prev) => prev.filter((m) => m.id !== sourceId));
    setFocusMatrixId("none");
    setViewOrderIds((prev) => prev.filter((id) => id !== sourceId));
    setLastSelectedMatrixId(destId);
  };

  const deleteMatrixArchiveTasks = (matrixId) => {
    if (!matrixId || matrixId === "none") return;

    setTasks((prev) =>
      prev.map((t) =>
        t.matrixId === matrixId && t.status !== "Deleted"
          ? { ...t, status: "Archived", archivedAt: new Date().toISOString() }
          : t
      )
    );

    setMatrices((prev) => prev.filter((m) => m.id !== matrixId));
    setFocusMatrixId("none");
    setViewOrderIds((prev) => prev.filter((id) => id !== matrixId));

    const fallback = activePinnedIds[0] ?? "work";
    setLastSelectedMatrixId(fallback);
  };

  // ---------- actions: tasks ----------
  const addTask = () => {
    if (!newTask.text.trim()) return;

    const nextOrder = getNextOrder(tasks, newTask.matrixId, newTask.urgency);

    setTasks([
      ...tasks,
      {
        ...newTask,
        id: Date.now(),
        status: "Not Done",
        order: nextOrder,
        createdAt: new Date().toISOString(),
      },
    ]);

    setNewTask({ text: "", matrixId: newTask.matrixId, urgency: "Medium" });
  };

  const toggleComplete = (id) =>
    setTasks(
      tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              status: t.status === "Completed" ? "Not Done" : "Completed",
            }
          : t
      )
    );

  const archiveTask = (id) => {
    setTasks(
      tasks.map((t) =>
        t.id === id
          ? { ...t, status: "Archived", archivedAt: new Date().toISOString() }
          : t
      )
    );
  };

  const unarchiveTask = (id) => {
    setTasks(
      tasks.map((t) =>
        t.id === id ? { ...t, status: "Not Done", archivedAt: undefined } : t
      )
    );
  };

  const deleteTask = (id) => {
    // If we delete the task we were editing, exit edit mode
    if (editingTaskId === id) {
      setEditingTaskId(null);
      setEditDraft("");
    }

    setTasks(
      tasks.map((t) =>
        t.id === id
          ? { ...t, status: "Deleted", deletedAt: new Date().toISOString() }
          : t
      )
    );
  };

  // ---------- inline edit handlers ----------
  const startEdit = (task) => {
    if (!task) return;
    setEditingTaskId(task.id);
    setEditDraft(task.text);
  };

  const cancelEdit = () => {
    setEditingTaskId(null);
    setEditDraft("");
  };

  const commitEdit = () => {
    if (editingTaskId == null) return;
    const nextText = editDraft.trim();

    // Don’t allow empty text; if empty, just cancel.
    if (!nextText) {
      cancelEdit();
      return;
    }

    setTasks((prev) =>
      prev.map((t) => (t.id === editingTaskId ? { ...t, text: nextText } : t))
    );

    setEditingTaskId(null);
    setEditDraft("");
  };

  // ---------- ordering helpers ----------
  function getTaskById(id) {
    return tasks.find((t) => t.id === id);
  }

  function getVisibleTasksForQuadrant(selectedIds, urgency) {
    // Preserve the *literal selection order* (viewOrderIds) instead of sorting matrices alphabetically.
    const matrixOrder = new Map(selectedIds.map((id, idx) => [id, idx]));

    return tasks
      .filter(
        (t) =>
          selectedIds.includes(t.matrixId) &&
          t.urgency === urgency &&
          t.status !== "Archived" &&
          t.status !== "Deleted"
      )
      .sort((a, b) => {
        if (a.matrixId !== b.matrixId) {
          const ao = matrixOrder.get(a.matrixId) ?? 999;
          const bo = matrixOrder.get(b.matrixId) ?? 999;
          if (ao !== bo) return ao - bo;

          // Stable fallback (should rarely be needed)
          const an = matrixNameById.get(a.matrixId) ?? a.matrixId;
          const bn = matrixNameById.get(b.matrixId) ?? b.matrixId;
          return an.localeCompare(bn);
        }

        const aord = typeof a.order === "number" ? a.order : 0;
        const bord = typeof b.order === "number" ? b.order : 0;
        if (aord !== bord) return aord - bord;
        return a.id - b.id;
      });
  }

  function getNextOrder(allTasks, matrixId, urgency) {
    const max = allTasks
      .filter(
        (t) =>
          t.matrixId === matrixId &&
          t.urgency === urgency &&
          t.status !== "Archived" &&
          t.status !== "Deleted" &&
          typeof t.order === "number"
      )
      .reduce((m, t) => Math.max(m, t.order), -1);
    return max + 1;
  }

  function normalizeOrders(allTasks, matrixId, urgency) {
    const group = allTasks
      .filter(
        (t) =>
          t.matrixId === matrixId &&
          t.urgency === urgency &&
          t.status !== "Archived" &&
          t.status !== "Deleted"
      )
      .sort((a, b) => {
        const ao = typeof a.order === "number" ? a.order : 0;
        const bo = typeof b.order === "number" ? b.order : 0;
        if (ao !== bo) return ao - bo;
        return a.id - b.id;
      });

    const updates = new Map();
    group.forEach((t, idx) => updates.set(t.id, idx));

    return allTasks.map((t) =>
      updates.has(t.id) ? { ...t, order: updates.get(t.id) } : t
    );
  }

  // ---------- archive/delete helpers ----------
  const getCreatedIso = (task) => {
    if (task.createdAt) return task.createdAt;
    if (typeof task.id === "number") return new Date(task.id).toISOString();
    return null;
  };

  const getHistoryIso = (task, kind) => {
    if (kind === "archived") return task.archivedAt || getCreatedIso(task);
    if (kind === "deleted") return task.deletedAt || getCreatedIso(task);
    return getCreatedIso(task);
  };

  const formatAge = (iso) => {
    if (!iso) return "";
    const ms = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(ms) || ms < 0) return "";
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    const years = Math.floor(months / 12);
    return `${years}y ago`;
  };

  // ---------- export/import ----------
  const exportData = () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      matrices,
      tasks,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `taskenhower-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const importDataFromFile = async (file) => {
    setImportError("");
    setImportOk("");

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!parsed || typeof parsed !== "object") {
        throw new Error("Invalid file format.");
      }

      const incomingMatrices = Array.isArray(parsed.matrices)
        ? parsed.matrices
        : null;
      const incomingTasks = Array.isArray(parsed.tasks) ? parsed.tasks : null;

      if (!incomingMatrices || !incomingTasks) {
        throw new Error(
          "Import file must include both 'matrices' and 'tasks' arrays."
        );
      }

      const normalizedMatrices = ensureDefaultPinnedMatrices(incomingMatrices);
      const migratedTasks = migrateTasks(incomingTasks);

      setMatrices(normalizedMatrices);
      setTasks(migratedTasks);

      const pinned = normalizedMatrices.filter((m) => m.pinned).map((m) => m.id);
      setActivePinnedIds(pinned);
      setViewOrderIds(pinned);
      setFocusMatrixId("none");
      setLastSelectedMatrixId(pinned[0] ?? "work");
      setNewTask((t) => ({ ...t, matrixId: pinned[0] ?? "work" }));

      setImportOk("Imported successfully.");
    } catch (e) {
      setImportError(e?.message || "Import failed.");
    }
  };

  // ---------- UI helpers ----------
  const quadrantLabel = (urgency) => {
    switch (urgency) {
      case "High":
        return "Do First";
      case "Medium":
        return "Plan / Schedule";
      case "Low":
        return "Quick and dirty";
      case "None":
        return "Backburner";
      default:
        return "";
    }
  };

  const quadrantClass = (urgency) => {
    const classMap = {
      High: "bg-green-100 border-green-300",
      Medium: "bg-yellow-100 border-yellow-300",
      Low: "bg-blue-100 border-blue-300",
      None: "bg-gray-100 border-gray-300",
    };
    return classMap[urgency] || "";
  };

  // ---------- DnD behavior in combined view ----------
  const handleDragEnd = ({ active, over }) => {
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    const activeTask = getTaskById(activeId);
    if (!activeTask) return;

    if (!selectedMatrixIds.includes(activeTask.matrixId)) return;

    // Dropped on a quadrant container → move to end of that quadrant (same matrix)
    if (urgencyLevels.includes(overId)) {
      if (activeTask.urgency === overId) return;

      setTasks((prev) => {
        const nextOrder = getNextOrder(prev, activeTask.matrixId, overId);
        const moved = prev.map((t) =>
          t.id === activeId ? { ...t, urgency: overId, order: nextOrder } : t
        );
        return normalizeOrders(moved, activeTask.matrixId, activeTask.urgency);
      });

      return;
    }

    // Dropped on a task → reorder/move relative to that task (only within same matrix)
    const overTask = getTaskById(overId);
    if (!overTask) return;

    if (overTask.matrixId !== activeTask.matrixId) return;

    if (overTask.urgency !== activeTask.urgency) {
      setTasks((prev) => {
        const nextOrder = getNextOrder(
          prev,
          activeTask.matrixId,
          overTask.urgency
        );
        const moved = prev.map((t) =>
          t.id === activeId
            ? { ...t, urgency: overTask.urgency, order: nextOrder }
            : t
        );
        return normalizeOrders(moved, activeTask.matrixId, activeTask.urgency);
      });
      return;
    }

    if (activeId === overId) return;

    setTasks((prev) => {
      const group = prev
        .filter(
          (t) =>
            t.matrixId === activeTask.matrixId &&
            t.urgency === activeTask.urgency &&
            t.status !== "Archived" &&
            t.status !== "Deleted"
        )
        .sort((a, b) => {
          const ao = typeof a.order === "number" ? a.order : 0;
          const bo = typeof b.order === "number" ? b.order : 0;
          if (ao !== bo) return ao - bo;
          return a.id - b.id;
        });

      const ids = group.map((t) => t.id);
      const oldIndex = ids.indexOf(activeId);
      const newIndex = ids.indexOf(overId);
      if (oldIndex === -1 || newIndex === -1) return prev;

      const movedIds = arrayMove(ids, oldIndex, newIndex);
      const orderMap = new Map();
      movedIds.forEach((id, idx) => orderMap.set(id, idx));

      return prev.map((t) =>
        orderMap.has(t.id) ? { ...t, order: orderMap.get(t.id) } : t
      );
    });
  };

  const focusMatrix =
    focusMatrixId === "none"
      ? null
      : matrices.find((m) => m.id === focusMatrixId);

  const isFocusActive = focusMatrixId !== "none";

  const renderCombinedMatrix = () => (
    <div className="mb-10">
      <h2 className="text-xl font-bold mb-4 text-gray-800 border-b pb-1 text-center">
        {selectedMatrixIds.length === 0
          ? "No matrices selected"
          : `${selectedMatrixIds
              .map((id) => matrixNameById.get(id) ?? id)
              .join(" + ")} Tasks`}
      </h2>

      <div className="flex justify-center">
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-2 gap-4 w-full max-w-3xl px-4 auto-rows-fr">
            {urgencyLevels.map((level) => {
              const visibleTasks = getVisibleTasksForQuadrant(
                selectedMatrixIds,
                level
              );

              return (
                <div key={level} className="min-h-[140px]">
                  <DroppableQuadrant id={level} className="h-full w-full">
                    <div
                      className={`rounded p-3 border shadow-sm ${quadrantClass(
                        level
                      )} h-full w-full`}
                    >
                      <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">
                        {quadrantLabel(level)}
                      </h3>

                      <div className="space-y-1">
                        {visibleTasks.map((task) => (
                          <DroppableTaskTarget key={task.id} id={task.id}>
                            <DraggableTaskRow
                              task={task}
                              showMatrixBadge={showMatrixBadges}
                              matrixName={
                                matrixNameById.get(task.matrixId) ?? task.matrixId
                              }
                              onToggleComplete={toggleComplete}
                              onArchive={archiveTask}
                              onDelete={deleteTask}
                              isEditing={editingTaskId === task.id}
                              draftText={
                                editingTaskId === task.id ? editDraft : task.text
                              }
                              onStartEdit={() => startEdit(task)}
                              onChangeDraft={setEditDraft}
                              onCommitEdit={commitEdit}
                              onCancelEdit={cancelEdit}
                            />
                          </DroppableTaskTarget>
                        ))}
                      </div>
                    </div>
                  </DroppableQuadrant>
                </div>
              );
            })}
          </div>
        </DndContext>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4">
      <div className="max-w-6xl mx-auto bg-white p-6 rounded shadow">
        <h1 className="text-4xl font-bold mb-6 text-slate-800 text-center">
          Taskenhower Matrix
        </h1>

        {/* Pinned toggles + Focus chip */}
        <div className="mb-6 flex flex-wrap justify-center gap-3 items-center">
          {pinnedMatrices.map((m) => {
            const isActive = activePinnedIds.includes(m.id);
            return (
              <button
                key={m.id}
                className={`px-4 py-1 rounded text-sm border transition-colors ${
                  isActive
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-indigo-600 hover:bg-indigo-50"
                }`}
                onClick={() => {
                  const willBeActive = !activePinnedIds.includes(m.id);

                  setActivePinnedIds((prev) => {
                    const next = prev.includes(m.id)
                      ? prev.filter((id) => id !== m.id)
                      : [...prev, m.id];
                    return next;
                  });

                  // Maintain literal selection order for combined view
                  setViewOrderIds((prev) => {
                    if (willBeActive) {
                      const without = prev.filter((id) => id !== m.id);
                      return [...without, m.id];
                    }
                    return prev.filter((id) => id !== m.id);
                  });

                  if (willBeActive) setLastSelectedMatrixId(m.id);
                }}
                title="Toggle matrix"
              >
                {m.name}
              </button>
            );
          })}

          {/* Focus chip */}
          <div
            className={`px-3 py-1 rounded text-sm border transition-colors flex items-center gap-2 ${
              isFocusActive
                ? "bg-indigo-600 text-white"
                : "bg-white text-indigo-600 hover:bg-indigo-50"
            }`}
            title="Select a focus matrix"
          >
            <span className="text-sm">Focus:</span>
            <select
              className={`text-sm outline-none bg-transparent ${
                isFocusActive ? "text-white" : "text-indigo-600"
              }`}
              value={focusMatrixId}
              onChange={(e) => {
                const next = e.target.value;
                const prevFocus = focusMatrixId;

                setFocusMatrixId(next);

                setViewOrderIds((prev) => {
                  // Remove prior focus id (if any)
                  let nextOrder = prev.filter((id) => id !== prevFocus);

                  if (next === "none") return nextOrder;

                  // If focus is changing from one to another, keep it in the same position if possible
                  const prevIdx = prev.indexOf(prevFocus);
                  if (prevFocus !== "none" && prevIdx !== -1) {
                    const replaced = prev.slice();
                    replaced[prevIdx] = next;

                    // De-dupe while preserving order
                    const seen = new Set();
                    return replaced.filter((id) => {
                      if (id === "none") return false;
                      if (seen.has(id)) return false;
                      seen.add(id);
                      return true;
                    });
                  }

                  // Otherwise, append focus to end (literal selection order)
                  if (!nextOrder.includes(next)) nextOrder = [...nextOrder, next];
                  return nextOrder;
                });

                if (next !== "none") setLastSelectedMatrixId(next);
              }}
            >
              <option value="none">None</option>
              {focusCandidates.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Add task */}
        <div className="mb-10 flex flex-wrap gap-3 items-end justify-center">
          <input
            className="border border-gray-300 p-2 rounded flex-1 min-w-[180px]"
            placeholder="New task"
            value={newTask.text}
            onChange={(e) => setNewTask({ ...newTask, text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") addTask();
            }}
          />

          <select
            className="border border-gray-300 p-2 rounded"
            value={newTask.matrixId}
            onChange={(e) => {
              const id = e.target.value;
              setNewTask({ ...newTask, matrixId: id });
              setLastSelectedMatrixId(id);
            }}
            title="Which matrix should this task live in?"
          >
            {matrices.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          <select
            className="border border-gray-300 p-2 rounded"
            value={newTask.urgency}
            onChange={(e) =>
              setNewTask({ ...newTask, urgency: e.target.value })
            }
          >
            {urgencyLevels.map((lvl) => (
              <option key={lvl}>{lvl}</option>
            ))}
          </select>

          <button
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded"
            onClick={addTask}
          >
            Add
          </button>
        </div>

        <div className="mt-6">
          {selectedMatrixIds.length === 0 ? (
            <p className="text-center text-gray-500">Select a matrix above.</p>
          ) : (
            renderCombinedMatrix()
          )}
        </div>

        <div className="mt-10">
          <details className="max-w-3xl mx-auto">
            <summary className="cursor-pointer text-sm text-slate-600 underline mb-4">
              Tools
            </summary>

            <div className="space-y-6">
              {/* Matrix management */}
              <div className="space-y-4">
                <div className="flex flex-wrap gap-3 items-end justify-center">
                  <input
                    className="border border-gray-300 p-2 rounded flex-1 min-w-[200px]"
                    placeholder="New matrix name (e.g., Today 2/10/26, Project XYZ)"
                    value={newMatrixName}
                    onChange={(e) => setNewMatrixName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addMatrix();
                    }}
                  />
                  <button
                    className="bg-slate-800 text-white px-4 py-2 rounded"
                    onClick={addMatrix}
                  >
                    Add Matrix
                  </button>
                </div>

                {focusMatrix && (
                  <div className="flex flex-wrap gap-3 justify-center items-center">
                    <div className="text-sm text-slate-600">
                      Focus:{" "}
                      <span className="font-semibold text-slate-800">
                        {focusMatrix.name}
                      </span>
                    </div>

                    <MergeControl
                      pinnedMatrices={pinnedMatrices}
                      onMerge={(destId) =>
                        mergeMatrixInto(focusMatrix.id, destId)
                      }
                    />

                    <button
                      className="text-sm text-red-600 underline"
                      onClick={() => deleteMatrixArchiveTasks(focusMatrix.id)}
                      title="Delete matrix (archives its tasks)"
                    >
                      Delete focus (archive tasks)
                    </button>
                  </div>
                )}
              </div>

              {/* Export / Import + History toggles */}
              <div className="flex flex-wrap justify-center gap-4 items-center">
                <button
                  className="text-sm text-gray-600 underline"
                  onClick={() => setShowArchived((v) => !v)}
                >
                  {showArchived ? "Hide Archived" : "Show Archived"}
                </button>

                <button
                  className="text-sm text-gray-600 underline"
                  onClick={() => setShowDeleted((v) => !v)}
                >
                  {showDeleted ? "Hide Deleted" : "Show Deleted"}
                </button>

                <button
                  className="text-sm text-gray-600 underline"
                  onClick={exportData}
                  title="Download your tasks + matrices as a JSON file"
                >
                  Export
                </button>

                <label
                  className="text-sm text-gray-600 underline cursor-pointer"
                  title="Import tasks + matrices from a JSON export"
                >
                  Import
                  <input
                    type="file"
                    accept="application/json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      importDataFromFile(file);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>

              {(importError || importOk) && (
                <div className="text-center">
                  {importOk && (
                    <div className="text-sm text-green-700">{importOk}</div>
                  )}
                  {importError && (
                    <div className="text-sm text-red-700">{importError}</div>
                  )}
                </div>
              )}

              {(showArchived || showDeleted) && (
                <div className="max-w-3xl mx-auto space-y-6">
                  {showArchived && (
                    <HistoryList
                      title="Archived"
                      kind="archived"
                      tasks={tasks}
                      matrixNameById={matrixNameById}
                      sort={historySort}
                      onChangeSort={setHistorySort}
                      getIso={getHistoryIso}
                      formatAge={formatAge}
                      onPrimaryAction={(id) => unarchiveTask(id)}
                      primaryActionLabel="Unarchive"
                    />
                  )}

                  {showDeleted && (
                    <HistoryList
                      title="Deleted"
                      kind="deleted"
                      tasks={tasks}
                      matrixNameById={matrixNameById}
                      sort={historySort}
                      onChangeSort={setHistorySort}
                      getIso={getHistoryIso}
                      formatAge={formatAge}
                      onPrimaryAction={null}
                      primaryActionLabel=""
                      onClearDeleted={() =>
                        setTasks(tasks.filter((t) => t.status !== "Deleted"))
                      }
                    />
                  )}
                </div>
              )}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

function HistoryList({
  title,
  kind,
  tasks,
  matrixNameById,
  sort,
  onChangeSort,
  getIso,
  formatAge,
  onPrimaryAction,
  primaryActionLabel,
  onClearDeleted,
}) {
  const items = tasks
    .filter((t) =>
      kind === "archived" ? t.status === "Archived" : t.status === "Deleted"
    )
    .map((t) => ({
      ...t,
      _iso: getIso(t, kind),
    }))
    .sort((a, b) => {
      const at = a._iso ? new Date(a._iso).getTime() : 0;
      const bt = b._iso ? new Date(b._iso).getTime() : 0;
      return sort === "new" ? bt - at : at - bt;
    });

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-bold text-gray-800">{title}</h2>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Sort</span>
            <select
              className="border border-gray-300 p-1 rounded text-xs"
              value={sort}
              onChange={(e) => onChangeSort?.(e.target.value)}
            >
              <option value="new">Newest</option>
              <option value="old">Oldest</option>
            </select>
          </div>

          {kind === "deleted" && onClearDeleted && (
            <button
              className="text-xs text-slate-600 underline"
              onClick={onClearDeleted}
              title="Permanently remove deleted tasks"
            >
              Clear
            </button>
          )}

          <div className="text-xs text-slate-500">
            {items.length} item{items.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-sm text-slate-500">
          No {title.toLowerCase()} tasks.
        </div>
      ) : (
        <div className="divide-y border rounded bg-white">
          {items.map((task) => {
            const matrixName = matrixNameById.get(task.matrixId) ?? "Unknown";
            const age = formatAge(task._iso);
            return (
              <div
                key={task.id}
                className="flex items-center gap-3 px-3 py-2 text-sm"
              >
                <div className="flex-1 truncate text-slate-800">{task.text}</div>
                <div className="text-[11px] text-slate-500 whitespace-nowrap">
                  {matrixName}
                </div>
                <div className="text-[11px] text-slate-400 whitespace-nowrap">
                  {age}
                </div>
                {onPrimaryAction && (
                  <button
                    className="text-[11px] text-indigo-600 underline whitespace-nowrap"
                    onClick={() => onPrimaryAction(task.id)}
                  >
                    {primaryActionLabel}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MergeControl({ pinnedMatrices, onMerge }) {
  const [destId, setDestId] = useState(pinnedMatrices[0]?.id ?? "work");

  useEffect(() => {
    if (pinnedMatrices.length && !pinnedMatrices.some((m) => m.id === destId)) {
      setDestId(pinnedMatrices[0].id);
    }
  }, [pinnedMatrices, destId]);

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-slate-600">Merge into</span>
      <select
        className="border border-gray-300 p-2 rounded text-sm"
        value={destId}
        onChange={(e) => setDestId(e.target.value)}
        title="Choose destination matrix"
      >
        {pinnedMatrices.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <button
        className="text-sm text-slate-800 underline"
        onClick={() => onMerge(destId)}
        title="Merge focus matrix into selected pinned matrix"
      >
        Merge
      </button>
    </div>
  );
}

// ---------- minimal dev tests (runs only in dev) ----------
function assert(name, condition) {
  if (!condition) {
    // eslint-disable-next-line no-console
    console.error(`Test failed: ${name}`);
  }
}

function runDevTests() {
  assert("slugify trims + lowers", slugify("  Hello World ") === "hello-world");
  assert("slugify removes punctuation", slugify("A&B") === "a-b");

  const moved = arrayMove(["a", "b", "c"], 0, 2);
  assert("arrayMove moves element", moved.join(",") === "b,c,a");
}

try {
  // Vite exposes import.meta.env.DEV
  if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
    runDevTests();
  }
} catch {
  // no-op
}









