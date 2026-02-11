/**
 * Taskenhower – Step 1.5 (no extra deps)
 *
 *
 * This version:
 * - Keeps ONLY @dnd-kit/core (no sortable/utilities)
 * - Still supports:
 *   1) Drag between quadrants (lands at bottom)
 *   2) Reorder within a quadrant (drag onto another task)
 *
 * UI remains light: drag handle (⠿) only.
 */

import { useEffect, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

const urgencyLevels = ["High", "Medium", "Low", "None"];
const tags = ["Work", "Personal", "Goals"];

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

function DraggableTaskRow({ task, onToggleComplete, onArchive, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: task.id,
      data: {
        tag: task.tag,
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
              ? "bg-green-500 border-green-600"
              : "border-gray-400"
          }`}
          title="Toggle complete"
        />

        {/* Drag handle (light UI) */}
        <button
          {...listeners}
          {...attributes}
          className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
          title="Drag"
          aria-label="Drag task"
        >
          ⠿
        </button>

        <span
          className={`flex-1 ${
            task.status === "Completed"
              ? "line-through text-gray-400"
              : "text-gray-800"
          }`}
        >
          {task.text}
        </span>

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

function DroppableTaskTarget({ id, children }) {
  // Makes each task row a droppable target for reordering.
  const { setNodeRef } = useDroppable({ id });
  return <div ref={setNodeRef}>{children}</div>;
}

function arrayMove(items, from, to) {
  const next = items.slice();
  const [removed] = next.splice(from, 1);
  next.splice(to, 0, removed);
  return next;
}

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [newTask, setNewTask] = useState({
    text: "",
    tag: "Work",
    urgency: "Medium",
  });
  const [showArchived, setShowArchived] = useState(false);
  const [activeTags, setActiveTags] = useState(["Work"]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  // ---------- persistence + migration (adds `order` to older tasks) ----------
  useEffect(() => {
    const stored = localStorage.getItem("tasks");
    if (stored) {
      const parsed = JSON.parse(stored);
      setTasks(migrateOrdersIfMissing(parsed));
    }
    setHasInitialized(true);
  }, []);

  useEffect(() => {
    if (hasInitialized) {
      localStorage.setItem("tasks", JSON.stringify(tasks));
    }
  }, [tasks, hasInitialized]);

  const addTask = () => {
    if (!newTask.text.trim()) return;

    const nextOrder = getNextOrder(tasks, newTask.tag, newTask.urgency);

    setTasks([
      ...tasks,
      {
        ...newTask,
        id: Date.now(),
        status: "Not Done",
        order: nextOrder,
      },
    ]);

    setNewTask({ text: "", tag: "Work", urgency: "Medium" });
  };

  const toggleComplete = (id) =>
    setTasks(
      tasks.map((t) =>
        t.id === id
          ? { ...t, status: t.status === "Completed" ? "Not Done" : "Completed" }
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
    setTasks(tasks.map((t) => (t.id === id ? { ...t, status: "Deleted" } : t)));
  };

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

  // ---------- helpers ----------
  function getTaskById(id) {
    return tasks.find((t) => t.id === id);
  }

  function getVisibleTasksForQuadrant(tagList, urgency) {
    return tasks
      .filter(
        (t) =>
          tagList.includes(t.tag) &&
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
  }

  function getNextOrder(allTasks, tag, urgency) {
    const max = allTasks
      .filter(
        (t) =>
          t.tag === tag &&
          t.urgency === urgency &&
          t.status !== "Archived" &&
          t.status !== "Deleted" &&
          typeof t.order === "number"
      )
      .reduce((m, t) => Math.max(m, t.order), -1);
    return max + 1;
  }

  function migrateOrdersIfMissing(allTasks) {
    const hasAnyOrder = allTasks.some((t) => typeof t.order === "number");
    if (hasAnyOrder) return allTasks;

    const counters = new Map();

    return allTasks.map((t) => {
      const key = `${t.tag}__${t.urgency}`;
      const next = counters.get(key) ?? 0;
      counters.set(key, next + 1);
      return { ...t, order: next };
    });
  }

  function normalizeOrders(allTasks, tag, urgency) {
    const group = allTasks
      .filter(
        (t) =>
          t.tag === tag &&
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

  // ---------- DnD behavior ----------
  // Rules:
  // - Drop onto a quadrant container id: move to that urgency, place at bottom.
  // - Drop onto another task id:
  //   - If same (tag + urgency): reorder within that group.
  //   - If different urgency: move to that urgency, place at bottom.
  //   - If different tag: ignore (keeps cross-tag behavior predictable when multiple tags are shown).
  const handleDragEnd = ({ active, over }) => {
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    const activeTask = getTaskById(activeId);
    if (!activeTask) return;

    // Dropped on quadrant background
    if (urgencyLevels.includes(overId)) {
      if (activeTask.urgency === overId) return;

      setTasks((prev) => {
        const nextOrder = getNextOrder(prev, activeTask.tag, overId); // bottom
        const moved = prev.map((t) =>
          t.id === activeId ? { ...t, urgency: overId, order: nextOrder } : t
        );
        // normalize source quadrant so it stays tidy
        return normalizeOrders(moved, activeTask.tag, activeTask.urgency);
      });

      return;
    }

    // Dropped on another task (for reorder or move)
    const overTask = getTaskById(overId);
    if (!overTask) return;

    // Cross-tag drops are ignored to avoid strange behavior when multiple tags are displayed.
    if (overTask.tag !== activeTask.tag) return;

    // Different urgency => move to that urgency (bottom)
    if (overTask.urgency !== activeTask.urgency) {
      setTasks((prev) => {
        const nextOrder = getNextOrder(prev, activeTask.tag, overTask.urgency); // bottom
        const moved = prev.map((t) =>
          t.id === activeId
            ? { ...t, urgency: overTask.urgency, order: nextOrder }
            : t
        );
        return normalizeOrders(moved, activeTask.tag, activeTask.urgency);
      });
      return;
    }

    // Same (tag + urgency): reorder
    if (activeId === overId) return;

    setTasks((prev) => {
      const group = prev
        .filter(
          (t) =>
            t.tag === activeTask.tag &&
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

  const renderMatrix = (tagsToRender) => {
    const relevantTags = Array.isArray(tagsToRender) ? tagsToRender : [tagsToRender];

    return (
      <div className="mb-10">
        <h2 className="text-xl font-bold mb-4 text-gray-800 border-b pb-1 text-center">
          {relevantTags.join(" + ")} Tasks
        </h2>

        <div className="flex justify-center">
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <div className="grid grid-cols-2 gap-4 w-full max-w-3xl px-4 auto-rows-fr">
              {urgencyLevels.map((level) => {
                const visibleTasks = getVisibleTasksForQuadrant(relevantTags, level);

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
                                onToggleComplete={toggleComplete}
                                onArchive={archiveTask}
                                onDelete={deleteTask}
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

        <div className="mb-6 flex justify-center gap-4">
          {tags.map((tag) => {
            const isActive = activeTags.includes(tag);
            return (
              <button
                key={tag}
                className={`px-4 py-1 rounded text-sm border transition-colors ${
                  isActive ? "bg-blue-600 text-white" : "bg-white text-blue-600"
                }`}
                onClick={() =>
                  setActiveTags((prev) =>
                    prev.includes(tag)
                      ? prev.filter((t) => t !== tag)
                      : [...prev, tag]
                  )
                }
              >
                {tag}
              </button>
            );
          })}
        </div>

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
            value={newTask.tag}
            onChange={(e) => setNewTask({ ...newTask, tag: e.target.value })}
          >
            {tags.map((tag) => (
              <option key={tag}>{tag}</option>
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
            className="bg-blue-600 text-white px-4 py-2 rounded"
            onClick={addTask}
          >
            Add
          </button>
        </div>

        <div className="mt-6">
          {activeTags.length === 0 ? (
            <p className="text-center text-gray-500">Select a matrix above.</p>
          ) : (
            renderMatrix(activeTags)
          )}
        </div>

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
                  .map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between bg-slate-50 border rounded p-2"
                    >
                      <span className="text-sm text-gray-700">{task.text}</span>
                      <button
                        className="text-xs text-blue-600 underline"
                        onClick={() => unarchiveTask(task.id)}
                      >
                        Unarchive
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

