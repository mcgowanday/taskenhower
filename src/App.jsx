/**
 * Taskenhower – Step 2 (revised)
 *
 * Updates based on your feedback:
 * - Combined 2x2 grid for any selected matrices
 * - “Manage matrices” tucked away
 *
 * New tweaks:
 * - Focus selector now looks/behaves like the other toggle chips (consistent highlight)
 * - New-task matrix defaults to the most recently selected matrix (focus if chosen, else last pinned toggled on)
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

  // Tracks the most recently selected matrix (used as the default for new tasks)
  const [lastSelectedMatrixId, setLastSelectedMatrixId] = useState("work");

  const [newMatrixName, setNewMatrixName] = useState("");

  const [newTask, setNewTask] = useState({
    text: "",
    matrixId: "work",
    urgency: "Medium",
  });

  const [showArchived, setShowArchived] = useState(false);

  // Inline edit state
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editDraft, setEditDraft] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

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
    if (!exists) setFocusMatrixId("none");
  }, [matrices, focusMatrixId, hasInitialized]);

  // Keep newTask.matrixId aligned with the most recently selected matrix,
  // but only when the input is empty (so we don’t disrupt someone mid-entry).
  useEffect(() => {
    if (!hasInitialized) return;
    if (newTask.text.trim() !== "") return;
    if (newTask.matrixId === lastSelectedMatrixId) return;
    setNewTask((t) => ({ ...t, matrixId: lastSelectedMatrixId }));
  }, [lastSelectedMatrixId, hasInitialized]);

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
    const base = pinnedMatrices
      .filter((m) => activePinnedIds.includes(m.id))
      .map((m) => m.id);

    if (
      focusMatrixId !== "none" &&
      focusCandidates.some((m) => m.id === focusMatrixId)
    ) {
      base.push(focusMatrixId);
    }

    return Array.from(new Set(base));
  }, [pinnedMatrices, activePinnedIds, focusMatrixId, focusCandidates]);

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
    setLastSelectedMatrixId(destId);
  };

  const deleteMatrixArchiveTasks = (matrixId) => {
    if (!matrixId || matrixId === "none") return;

    setTasks((prev) =>
      prev.map((t) =>
        t.matrixId === matrixId && t.status !== "Deleted"
          ? { ...t, status: "Archived" }
          : t
      )
    );

    setMatrices((prev) => prev.filter((m) => m.id !== matrixId));
    setFocusMatrixId("none");

    // fallback to a sensible default
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
    setTasks(tasks.map((t) => (t.id === id ? { ...t, status: "Archived" } : t)));
  };

  const unarchiveTask = (id) => {
    setTasks(tasks.map((t) => (t.id === id ? { ...t, status: "Not Done" } : t)));
  };

  const deleteTask = (id) => {
    // If we delete the task we were editing, exit edit mode
    if (editingTaskId === id) {
      setEditingTaskId(null);
      setEditDraft("");
    }
    setTasks(tasks.map((t) => (t.id === id ? { ...t, status: "Deleted" } : t)));
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

  // ---------- helpers ----------
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

  function getTaskById(id) {
    return tasks.find((t) => t.id === id);
  }

  function getVisibleTasksForQuadrant(selectedIds, urgency) {
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
          const an = matrixNameById.get(a.matrixId) ?? a.matrixId;
          const bn = matrixNameById.get(b.matrixId) ?? b.matrixId;
          return an.localeCompare(bn);
        }
        const ao = typeof a.order === "number" ? a.order : 0;
        const bo = typeof b.order === "number" ? b.order : 0;
        if (ao !== bo) return ao - bo;
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

    const overTask = getTaskById(overId);
    if (!overTask) return;

    if (overTask.matrixId !== activeTask.matrixId) return;

    if (overTask.urgency !== activeTask.urgency) {
      setTasks((prev) => {
        const nextOrder = getNextOrder(prev, activeTask.matrixId, overTask.urgency);
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
    focusMatrixId === "none" ? null : matrices.find((m) => m.id === focusMatrixId);

  const isFocusActive = focusMatrixId !== "none";

  const renderCombinedMatrix = () => {
    return (
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
                const visibleTasks = getVisibleTasksForQuadrant(selectedMatrixIds, level);

                return (
                  <div key={level} className="min-h-[140px]">
                    <DroppableQuadrant id={level} className="h-full w-full">
                      <div
                        className={`rounded p-3 border shadow-sm ${quadrantClass(level)} h-full w-full`}
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
                                matrixName={matrixNameById.get(task.matrixId) ?? task.matrixId}
                                onToggleComplete={toggleComplete}
                                onArchive={archiveTask}
                                onDelete={deleteTask}
                                isEditing={editingTaskId === task.id}
                                draftText={editingTaskId === task.id ? editDraft : task.text}
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
  };

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
                  isActive ? "bg-indigo-600 text-white" : "bg-white text-indigo-600 hover:bg-indigo-50"
                }`}
                onClick={() => {
                  setActivePinnedIds((prev) => {
                    const next = prev.includes(m.id)
                      ? prev.filter((id) => id !== m.id)
                      : [...prev, m.id];
                    return next;
                  });

                  // If turning on, treat it as the most-recent selection
                  setLastSelectedMatrixId((prevLast) => {
                    const willBeActive = !activePinnedIds.includes(m.id);
                    return willBeActive ? m.id : prevLast;
                  });
                }}
                title="Toggle matrix"
              >
                {m.name}
              </button>
            );
          })}

          {/* Focus chip (styled like the others) */}
          <div
            className={`px-3 py-1 rounded text-sm border transition-colors flex items-center gap-2 ${
              isFocusActive ? "bg-indigo-600 text-white" : "bg-white text-indigo-600 hover:bg-indigo-50"
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
                setFocusMatrixId(next);
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
            onChange={(e) => setNewTask({ ...newTask, urgency: e.target.value })}
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

        {/* Manage matrices (tucked away) */}
        <details className="mt-4 max-w-3xl mx-auto">
          <summary className="cursor-pointer text-sm text-slate-600 underline">
            Manage matrices
          </summary>
          <div className="mt-4 space-y-4">
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
                  onMerge={(destId) => mergeMatrixInto(focusMatrix.id, destId)}
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
        </details>

        <div className="mt-10">
          <div className="flex justify-center gap-3">
            <button
              className="text-sm text-gray-600 underline"
              onClick={() => setShowArchived((v) => !v)}
            >
              {showArchived ? "Hide Archived" : "Show Archived"}
            </button>

            <button
              className="text-sm text-gray-600 underline"
              onClick={() => setTasks(tasks.filter((t) => t.status !== "Deleted"))}
            >
              Clear Deleted
            </button>
          </div>

          {showArchived && (
            <div className="mt-4 max-w-3xl mx-auto">
              <h2 className="font-bold text-gray-800 mb-2">Archived</h2>
              <div className="space-y-2">
                {tasks
                  .filter((t) => t.status === "Archived")
                  .map((task) => {
                    const matrixName =
                      matrixNameById.get(task.matrixId) ?? "Unknown";
                    return (
                      <div
                        key={task.id}
                        className="flex items-center justify-between bg-slate-50 border rounded p-2"
                      >
                        <div className="flex flex-col">
                          <span className="text-sm text-gray-700">
                            {task.text}
                          </span>
                          <span className="text-xs text-gray-500">
                            {matrixName}
                          </span>
                        </div>
                        <button
                          className="text-xs text-blue-600 underline"
                          onClick={() => unarchiveTask(task.id)}
                        >
                          Unarchive
                        </button>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      </div>
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







