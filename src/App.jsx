import { useState, useEffect } from "react";

const urgencyLevels = ["High", "Medium", "Low", "None"];
const tags = ["Work", "Personal", "Goals"];
const combinedViews = {
  "Work + Goals": ["Work", "Goals"],
  "Personal + Work": ["Personal", "Work"]
};
const statusStages = ["Not Done", "Completed", "Archived"];

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [newTask, setNewTask] = useState({ text: "", tag: "Work", urgency: "Medium" });
  const [showArchived, setShowArchived] = useState(false);
  const [activeTags, setActiveTags] = useState(["Work"]);

  useEffect(() => {
    const stored = localStorage.getItem("tasks");
    if (stored) setTasks(JSON.parse(stored));
    setHasInitialized(true);
  }, []);

  useEffect(() => {
    if (hasInitialized) {
      localStorage.setItem("tasks", JSON.stringify(tasks));
    }
  }, [tasks, hasInitialized]);

  const addTask = () => {
    if (!newTask.text.trim()) return;
    setTasks([...tasks, { ...newTask, id: Date.now(), status: "Not Done" }]);
    setNewTask({ text: "", tag: "Work", urgency: "Medium" });
  };

  const toggleComplete = (id) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, status: t.status === "Completed" ? "Not Done" : "Completed" } : t));
  };

  const archiveTask = (id) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, status: "Archived" } : t));
  };

  const unarchiveTask = (id) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, status: "Not Done" } : t));
  };

  const updateTaskUrgency = (id, newUrgency) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, urgency: newUrgency } : t));
  };

  const quadrantLabel = (urgency) => {
    switch (urgency) {
      case "High": return "Do First";
      case "Medium": return "Plan / Schedule";
      case "Low": return "Quick and dirty";
      case "None": return "Backburner";
      default: return "";
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

  const renderMatrix = (tagsToRender) => {
    const relevantTags = Array.isArray(tagsToRender) ? tagsToRender : [tagsToRender];
    return (
      <div className="mb-10">
        <h2 className="text-xl font-bold mb-4 text-gray-800 border-b pb-1 text-center">{relevantTags.join(" + ")} Tasks</h2>
        <div className="flex justify-center">
          <div className="grid grid-cols-2 gap-4 w-full max-w-3xl px-4 auto-rows-fr">
            {urgencyLevels.map(level => ( 
              <div key={level} className="min-h-[140px]">
                <div className={`rounded p-3 border shadow-sm ${quadrantClass(level)} h-full w-full`}>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">
                    {quadrantLabel(level)} 
                  </h3>
                  <div className="space-y-1">
                    {tasks
                      .filter(t => relevantTags.includes(t.tag) && t.urgency === level && t.status !== "Archived" && t.status !== "Deleted")
                      .map(task => (
                        <div
                          key={task.id}
                          className="flex items-center justify-between text-sm gap-2 group hover:bg-white/50 rounded px-1"
                        >
                          <button
                            onClick={() => toggleComplete(task.id)}
                            className={`w-3 h-3 rounded-full border-2 mt-1 ${task.status === "Completed" ? "bg-green-500 border-green-600" : "border-gray-400"}`}
                            title="Toggle complete"
                          />
                          <span
                            className={`flex-1 ${task.status === "Completed" ? "line-through text-gray-400" : "text-gray-800"}`}
                          >
                            {task.text}
                          </span>
                          <button
                            onClick={() => archiveTask(task.id)}
                            className="text-xs text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                            title="Archive task"
                          >
                            🗃
                          </button>
                          <button
                            onClick={() => setTasks(tasks.map(t => t.id === task.id ? { ...t, status: "Deleted" } : t))}
                            className="text-xs text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                            title="Delete task"
                          >
                            🗑️
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4">
      <div className="max-w-6xl mx-auto bg-white p-6 rounded shadow">
        <h1 className="text-4xl font-bold mb-6 text-slate-800 text-center">Taskenhower Matrix</h1>

        <div className="mb-6 flex justify-center gap-4">
          {tags.map(tag => {
            const isActive = activeTags.includes(tag);
            return (
              <button
                key={tag}
                className={`px-4 py-1 rounded text-sm border transition-colors ${isActive ? "bg-blue-600 text-white" : "bg-white text-blue-600"}`}
                onClick={() =>
                  setActiveTags(prev =>
                    prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
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
            placeholder="Task description"
            value={newTask.text}
            onChange={e => setNewTask({ ...newTask, text: e.target.value })}
          />
          <select
            className="border p-2 rounded"
            value={newTask.tag}
            onChange={e => setNewTask({ ...newTask, tag: e.target.value })}
          >
            {tags.map(tag => <option key={tag}>{tag}</option>)}
          </select>
          <select
            className="border p-2 rounded"
            value={newTask.urgency}
            onChange={e => setNewTask({ ...newTask, urgency: e.target.value })}
          >
            {urgencyLevels.map(u => <option key={u}>{u}</option>)}
          </select>
          <button
            onClick={addTask}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Add Task
          </button>
        </div>

        {renderMatrix(activeTags)}

        <div className="mt-6 text-center">
          <div className="mt-4">
            <button
              onClick={() => {
                const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "tasks-backup.json";
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="text-sm text-blue-600 hover:underline"
            >
              Export Tasks
            </button>
          </div>
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="text-sm text-blue-600 hover:underline"
          >
            {showArchived ? "Hide" : "Show"} Archived Tasks
          </button>

          {showArchived && (
            <div className="mt-4 border-t pt-4 max-w-xl mx-auto text-left">
              <h3 className="text-sm font-semibold mb-2">Archived Tasks</h3>
              {tasks.filter(t => t.status === "Archived").length === 0 ? (
                <p className="text-sm text-gray-500">No archived tasks.</p>
              ) : (
                tasks.filter(t => t.status === "Archived").map(task => (
                  <div key={task.id} className="flex items-center justify-between text-xs sm:text-sm mb-1">
                    <span className="text-gray-400 italic">{task.text}</span>
                    <button
                      onClick={() => unarchiveTask(task.id)}
                      className="text-xs text-gray-400 hover:text-gray-600"
                      title="Unarchive"
                    >
                      ↩️
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {tasks.some(t => t.status === "Deleted") && (
            <div className="mt-10 border-t pt-4 max-w-xl mx-auto text-left">
              <div className="text-center mb-2">
                <button
                  onClick={() => setTasks(tasks.filter(t => t.status !== "Deleted"))}
                  className="text-xs text-red-500 hover:underline"
                >
                  Clear All Deleted
                </button>
              </div>
              {tasks.filter(t => t.status === "Deleted").map(task => (
                <div key={task.id} className="flex items-center justify-between text-xs sm:text-sm mb-1">
                  <span className="text-gray-400 italic">{task.text}</span>
                  <button
                    onClick={() => unarchiveTask(task.id)}
                    className="text-xs text-gray-400 hover:text-green-600"
                    title="Undo delete"
                  >
                    ↩️
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
