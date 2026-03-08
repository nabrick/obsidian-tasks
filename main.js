// main.js

const { Plugin, ItemView, TFile, PluginSettingTab, Setting, Modal, Notice } = require("obsidian");
const VIEW_TYPE_TASKS = "tasks-view";

const PRIORITY = {
	high:   { icon: "🔴", label: "Alta" },
	medium: { icon: "🟡", label: "Media" },
	low:    { icon: "🟢", label: "Baja" },
};

module.exports = class TasksPlugin extends Plugin {
	async onload() {
		await this.loadSettings();
		new Notice("Plugin Tareas activado");

		this.addRibbonIcon("check-square", "Abrir Tareas", () => this.activateView());
		this.addRibbonIcon("plus-circle", "Nueva Tarea", () => new AddTaskModal(this.app, this).open());

		this.registerView(VIEW_TYPE_TASKS, (leaf) => new TasksView(leaf, this));
		this.addSettingTab(new TasksSettingTab(this.app, this));

		this.addCommand({
			id: "add-task",
			name: "Nueva tarea",
			hotkeys: [{ modifiers: ["Mod", "Shift"], key: "t" }],
			callback: () => new AddTaskModal(this.app, this).open(),
		});
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_TASKS);
		new Notice("Plugin Tareas desactivado");
	}

	async activateView() {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(VIEW_TYPE_TASKS)[0];
		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			await leaf.setViewState({ type: VIEW_TYPE_TASKS, active: true });
		}
		workspace.revealLeaf(leaf);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{ folder: "", showUpcoming: false },
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async getTasksFile() {
		const folderPath = this.settings.folder || "";
		const filePath = folderPath ? `${folderPath}/Tasks.md` : "Tasks.md";
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (file instanceof TFile) return file;
		if (folderPath && !this.app.vault.getAbstractFileByPath(folderPath)) {
			await this.app.vault.createFolder(folderPath);
		}
		return this.app.vault.create(filePath, "# 📋 Tareas\n\n");
	}

	async readTasks() {
		const file = await this.getTasksFile();
		const content = await this.app.vault.read(file);
		const tasks = [];

		for (const line of content.split("\n")) {
			if (!line.startsWith("|")) continue;
			if (/^\|\s*(ID|---|-\s)/.test(line)) continue;

			// Columnas: | id | done | title | date | priority | doneDate | desc | subtasks |
			const cols = line
				.split("|")
				.slice(1, -1)
				.map(c => c.trim());

			if (cols.length < 6 || !cols[0]) continue;

			// Parsear subtareas: "[x]Título~~[ ]Título2"
			const subtasks = cols[7]
				? cols[7].split("~~").filter(Boolean).map(s => {
					const done  = s.startsWith("[x]");
					const title = s.replace(/^\[.\]/, "").replace(/\\\|/g, "|");
					return { done, title };
				})
				: [];

			tasks.push({
				id:       cols[0],
				done:     cols[1] === "x",
				title:    (cols[2] || "").replace(/\\\|/g, "|"),
				date:     cols[3] || "",
				priority: cols[4] || "medium",
				doneDate: cols[5] || null,
				desc:     (cols[6] || "").replace(/\\n/g, "\n").replace(/\\\|/g, "|"),
				subtasks,
			});
		}
		return tasks;
	}

	async writeTasks(tasks) {
		tasks.sort((a, b) => a.date.localeCompare(b.date));

		const escape     = (str) => (str || "").replace(/\|/g, "\\|");
		const escapeDesc = (str) => escape(str).replace(/\n/g, "\\n");
		const serializeSubs = (subs) =>
			(subs || []).map(s => `${s.done ? "[x]" : "[ ]"}${escape(s.title)}`).join("~~");

		const header =
			"| ID | ✓ | Título | Fecha | Prioridad | Completado | Descripción | Subtareas |\n" +
			"|---|:---:|---|---|---|---|---|---|";

		const rows = tasks.map((t) =>
			`| ${t.id} | ${t.done ? "x" : " "} | ${escape(t.title)} | ${t.date} | ${t.priority || "medium"} | ${t.doneDate || ""} | ${escapeDesc(t.desc)} | ${serializeSubs(t.subtasks)} |`
		);

		const content = "# 📋 Tareas\n\n" + header + "\n" + rows.join("\n") + "\n";
		const file = await this.getTasksFile();
		await this.app.vault.modify(file, content);
	}

	async deleteTask(id) {
		const tasks = await this.readTasks();
		await this.writeTasks(tasks.filter((t) => t.id !== id));
		this.app.workspace.trigger("tasks-updated");
	}

	async cleanOldCompletedTasks() {
		const tasks = await this.readTasks();
		const now = new Date();
		const pending = tasks.filter((t) => {
			if (!t.done || !t.doneDate) return true;
			const diff = (now - new Date(t.doneDate)) / (1000 * 60 * 60 * 24);
			return diff <= 7;
		});
		await this.writeTasks(pending);
		this.app.workspace.trigger("tasks-updated");
	}
};

// Vista lateral

class TasksView extends ItemView {
	constructor(leaf, plugin) {
		super(leaf);
		this.plugin = plugin;
		this.tasks = [];
	}

	getViewType()    { return VIEW_TYPE_TASKS; }
	getDisplayText() { return "Tareas"; }
	getIcon()        { return "check-square"; }

	async onOpen() {
		this.container = this.containerEl;
		this.container.empty();
		this.container.addClass("tasks-plugin-view");

		// Header: contador + toggle próximas
		const header = this.container.createEl("div", { cls: "tasks-header" });
		this.counterEl = header.createEl("span", { cls: "tasks-counter" });

		const toggleBtn = header.createEl("button", { cls: "tasks-toggle-btn" });
		this.updateToggleBtn(toggleBtn);
		toggleBtn.addEventListener("click", async () => {
			this.plugin.settings.showUpcoming = !this.plugin.settings.showUpcoming;
			await this.plugin.saveSettings();
			this.updateToggleBtn(toggleBtn);
			this.renderTasks();
		});

		this.listEl = this.container.createEl("div", { cls: "task-list" });

		await this.plugin.cleanOldCompletedTasks();
		await this.loadTasks();

		this.registerEvent(
			this.plugin.app.workspace.on("tasks-updated", async () => this.loadTasks())
		);
	}

	updateToggleBtn(btn) {
		const on = this.plugin.settings.showUpcoming;
		btn.textContent = on ? "📅 Próximas ✓" : "📅 Próximas";
		btn.title = on ? "Ocultar tareas futuras" : "Mostrar tareas futuras";
		btn.toggleClass("active", on);
	}

	async loadTasks() {
		this.tasks = await this.plugin.readTasks();
		this.renderTasks();
	}

	getDateLabel(dateStr) {
		const todayStr = new Date().toISOString().split("T")[0];
		if (dateStr === todayStr) return "📌 Hoy";

		const diff = Math.round(
			(new Date() - new Date(dateStr + "T00:00:00")) / (1000 * 60 * 60 * 24)
		);

		if (diff === 1)  return `⚠️ Ayer — ${dateStr}`;
		if (diff > 1)    return `🚨 Hace ${diff} días — ${dateStr}`;
		if (diff === -1) return `🔜 Mañana — ${dateStr}`;
		return `🔜 En ${Math.abs(diff)} días — ${dateStr}`;
	}

	renderTasks() {
		this.listEl.empty();

		const todayStr = new Date().toISOString().split("T")[0];
		const showUpcoming = this.plugin.settings.showUpcoming;

		const visible = this.tasks.filter((t) => {
			if (t.done) return false;
			return showUpcoming ? true : t.date <= todayStr;
		});

		// Contador: solo pendientes de hoy/atrasadas
		const pending = this.tasks.filter((t) => !t.done && t.date <= todayStr).length;
		this.counterEl.textContent = pending > 0 ? `${pending} pendiente${pending !== 1 ? "s" : ""}` : "";
		this.counterEl.toggleClass("has-pending", pending > 0);

		// Estado vacío
		if (visible.length === 0) {
			const empty = this.listEl.createEl("div", { cls: "tasks-empty" });
			empty.createEl("div", { text: "✅", cls: "tasks-empty-icon" });
			empty.createEl("p", { text: "¡Todo al día! Sin tareas pendientes." });
			return;
		}

		// Ordenar: por fecha, luego prioridad alta primero
		const priorityOrder = { high: 0, medium: 1, low: 2 };
		visible.sort((a, b) => {
			const byDate = a.date.localeCompare(b.date);
			if (byDate !== 0) return byDate;
			return (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1);
		});

		// Agrupar por fecha
		const grouped = {};
		for (const t of visible) {
			if (!grouped[t.date]) grouped[t.date] = [];
			grouped[t.date].push(t);
		}

		for (const date of Object.keys(grouped).sort()) {
			const isOverdue = date < todayStr;
			const isToday   = date === todayStr;

			const h = this.listEl.createEl("h3", { text: this.getDateLabel(date) });
			if (isOverdue) h.addClass("overdue-header");
			if (isToday)   h.addClass("today-header");

			for (const t of grouped[date]) {
				const row = this.listEl.createEl("div", {
					cls: `task-item priority-${t.priority || "medium"}`,
				});

				// Checkbox
				const checkbox = row.createEl("input", { type: "checkbox" });
				checkbox.checked = t.done;
				checkbox.addEventListener("change", async () => {
					t.done     = checkbox.checked;
					t.doneDate = t.done ? new Date().toISOString().split("T")[0] : null;
					await this.plugin.writeTasks(this.tasks);
					this.plugin.app.workspace.trigger("tasks-updated");
				});

				// Info
				const info = row.createEl("div", { cls: "task-info" });
				const titleRow = info.createEl("div", { cls: "task-title-row" });
				titleRow.createEl("span", {
					text:  PRIORITY[t.priority || "medium"].icon,
					cls:   "priority-icon",
					title: PRIORITY[t.priority || "medium"].label,
				});
				titleRow.createEl("span", { text: t.title, cls: "task-title" });

				if (t.desc) {
					const descEl = info.createEl("div", { cls: "desc" });
					descEl.innerHTML = t.desc.split("\n").join("<br>");
				}

				// Subtareas
				if (t.subtasks && t.subtasks.length > 0) {
					const doneSubs  = t.subtasks.filter(s => s.done).length;
					const totalSubs = t.subtasks.length;

					const subsWrap = info.createEl("div", { cls: "subtasks-wrap" });

					// Barra de progreso
					const progressBar = subsWrap.createEl("div", { cls: "subtasks-progress-bar" });
					const fill = progressBar.createEl("div", { cls: "subtasks-progress-fill" });
					fill.style.width = `${Math.round((doneSubs / totalSubs) * 100)}%`;
					subsWrap.createEl("span", {
						text: `${doneSubs}/${totalSubs}`,
						cls: "subtasks-counter",
					});

					const subList = subsWrap.createEl("div", { cls: "subtask-list" });
					t.subtasks.forEach((sub, idx) => {
						const subRow = subList.createEl("div", { cls: "subtask-item" });
						const subCheck = subRow.createEl("input", { type: "checkbox" });
						subCheck.checked = sub.done;
						subCheck.addEventListener("change", async () => {
							sub.done = subCheck.checked;
							// Auto-completar tarea principal si todas las subtareas están hechas
							if (t.subtasks.every(s => s.done)) {
								t.done     = true;
								t.doneDate = new Date().toISOString().split("T")[0];
							} else {
								t.done     = false;
								t.doneDate = null;
							}
							await this.plugin.writeTasks(this.tasks);
							this.plugin.app.workspace.trigger("tasks-updated");
						});
						subRow.createEl("span", {
							text: sub.title,
							cls: sub.done ? "subtask-title done" : "subtask-title",
						});
					});
				}

				// Acciones
				const actions = row.createEl("div", { cls: "task-actions" });

				this.addActionBtn(actions, "🔄", "Reprogramar", () =>
					new ReprogramTaskModal(this.plugin.app, this.plugin, t).open()
				);
				this.addActionBtn(actions, "✏️", "Editar", () =>
					new EditTaskModal(this.plugin.app, this.plugin, t).open()
				);
				this.addActionBtn(actions, "🗑️", "Eliminar", async () => {
					if (confirm(`¿Eliminar "${t.title}"?`)) {
						await this.plugin.deleteTask(t.id);
					}
				}, "delete-btn");
			}
		}
	}

	addActionBtn(parent, text, title, onClick, extraCls = "") {
		const btn = parent.createEl("button", { text, cls: extraCls || undefined });
		btn.title = title;
		btn.addEventListener("click", onClick);
		return btn;
	}
}

// Modal: Nueva tarea

class AddTaskModal extends Modal {
	constructor(app, plugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("tasks-plugin-modal");

		contentEl.createEl("h2", { text: "Nueva Tarea" });

		const titleInput = contentEl.createEl("input", {
			type: "text",
			placeholder: "Título de la tarea...",
		});
		titleInput.focus();

		const today = new Date().toISOString().split("T")[0];
		const dateInput = contentEl.createEl("input", { type: "date", value: today });

		const priorityWrap = contentEl.createEl("div", { cls: "priority-wrap" });
		priorityWrap.createEl("label", { text: "Prioridad" });
		const prioritySelect = buildPrioritySelect(priorityWrap, "medium");

		const descInput = contentEl.createEl("textarea", {
			placeholder: "Descripción (opcional)...",
		});

		// Subtareas
		contentEl.createEl("label", { text: "Subtareas", cls: "subtasks-label" });
		const { subsContainer, getSubtasks } = buildSubtasksEditor(contentEl, []);

		const addBtn = contentEl.createEl("button", { text: "Agregar tarea" });

		titleInput.addEventListener("keydown", (e) => {
			if (e.key === "Enter") addBtn.click();
		});

		addBtn.addEventListener("click", async () => {
			if (!titleInput.value.trim() || !dateInput.value) return;
			const tasks = await this.plugin.readTasks();
			tasks.push({
				done:     false,
				title:    titleInput.value.trim(),
				date:     dateInput.value,
				desc:     descInput.value,
				priority: prioritySelect.value,
				subtasks: getSubtasks(),
				id:       Date.now().toString(),
			});
			await this.plugin.writeTasks(tasks);
			this.plugin.app.workspace.trigger("tasks-updated");
			this.close();
		});
	}

	onClose() { this.contentEl.empty(); }
}

// Modal: Reprogramar

class ReprogramTaskModal extends Modal {
	constructor(app, plugin, task) {
		super(app);
		this.plugin = plugin;
		this.task   = task;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("tasks-plugin-modal");

		contentEl.createEl("h2", { text: "Reprogramar Tarea" });
		contentEl.createEl("p", { text: this.task.title, cls: "modal-task-title" });

		const dateInput = contentEl.createEl("input", {
			type: "date",
			value: this.task.date,
		});
		const saveBtn = contentEl.createEl("button", { text: "Guardar nueva fecha" });

		dateInput.addEventListener("keydown", (e) => {
			if (e.key === "Enter") saveBtn.click();
		});

		saveBtn.addEventListener("click", async () => {
			if (!dateInput.value) return;
			this.task.date = dateInput.value;
			const tasks = await this.plugin.readTasks();
			const idx = tasks.findIndex((t) => t.id === this.task.id);
			if (idx !== -1) tasks[idx] = this.task;
			await this.plugin.writeTasks(tasks);
			this.plugin.app.workspace.trigger("tasks-updated");
			this.close();
		});
	}

	onClose() { this.contentEl.empty(); }
}

// Modal: Editar

class EditTaskModal extends Modal {
	constructor(app, plugin, task) {
		super(app);
		this.plugin = plugin;
		this.task   = task;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("tasks-plugin-modal");

		contentEl.createEl("h2", { text: "Editar Tarea" });

		const titleInput = contentEl.createEl("input", {
			type: "text",
			value: this.task.title,
		});
		titleInput.focus();

		const dateInput = contentEl.createEl("input", {
			type: "date",
			value: this.task.date,
		});

		const priorityWrap = contentEl.createEl("div", { cls: "priority-wrap" });
		priorityWrap.createEl("label", { text: "Prioridad" });
		const prioritySelect = buildPrioritySelect(priorityWrap, this.task.priority || "medium");

		const descInput = contentEl.createEl("textarea");
		descInput.value = this.task.desc || "";

		// Subtareas
		contentEl.createEl("label", { text: "Subtareas", cls: "subtasks-label" });
		const { subsContainer, getSubtasks } = buildSubtasksEditor(contentEl, this.task.subtasks || []);

		const saveBtn = contentEl.createEl("button", { text: "Guardar cambios" });

		saveBtn.addEventListener("click", async () => {
			if (!titleInput.value.trim()) return;
			this.task.title    = titleInput.value.trim();
			this.task.date     = dateInput.value;
			this.task.desc     = descInput.value;
			this.task.priority = prioritySelect.value;
			this.task.subtasks = getSubtasks();

			const tasks = await this.plugin.readTasks();
			const idx = tasks.findIndex((t) => t.id === this.task.id);
			if (idx !== -1) tasks[idx] = this.task;

			await this.plugin.writeTasks(tasks);
			this.plugin.app.workspace.trigger("tasks-updated");
			this.close();
		});
	}

	onClose() { this.contentEl.empty(); }
}

// Settings

class TasksSettingTab extends PluginSettingTab {
	constructor(app, plugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Configuración de Tareas" });

		new Setting(containerEl)
			.setName("Carpeta de guardado")
			.setDesc("Elige la carpeta donde se guardará Tasks.md")
			.addDropdown((dropdown) => {
				dropdown.addOption("", "— Raíz del vault —");
				this.app.vault.getAllLoadedFiles().forEach((f) => {
					if (f.children) dropdown.addOption(f.path, f.path);
				});
				dropdown.setValue(this.plugin.settings.folder || "");
				dropdown.onChange(async (value) => {
					this.plugin.settings.folder = value;
					await this.plugin.saveSettings();
				});
			});
	}
}

// Helpers

function buildPrioritySelect(parent, selected) {
	const sel = parent.createEl("select");
	for (const [val, { icon, label }] of Object.entries(PRIORITY)) {
		const opt = sel.createEl("option", { value: val, text: `${icon} ${label}` });
		if (val === selected) opt.selected = true;
	}
	return sel;
}

function buildSubtasksEditor(parent, initialSubs) {
	const subsContainer = parent.createEl("div", { cls: "subtasks-editor" });

	const renderSubInput = (sub) => {
		const row = subsContainer.createEl("div", { cls: "subtask-editor-row" });
		const check = row.createEl("input", { type: "checkbox" });
		check.checked = sub.done;
		check.addEventListener("change", () => { sub.done = check.checked; });

		const input = row.createEl("input", { type: "text", value: sub.title });
		input.placeholder = "Subtarea...";
		input.addEventListener("input", () => { sub.title = input.value; });
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") { e.preventDefault(); addSubBtn.click(); }
		});

		const removeBtn = row.createEl("button", { text: "✕", cls: "subtask-remove-btn" });
		removeBtn.addEventListener("click", () => {
			const idx = subs.findIndex(s => s === sub);
			if (idx !== -1) subs.splice(idx, 1);
			row.remove();
		});
	};

	const subs = initialSubs.map(s => ({ ...s }));
	subs.forEach(renderSubInput);

	const addSubBtn = parent.createEl("button", {
		text: "+ Añadir subtarea",
		cls: "subtask-add-btn",
	});
	addSubBtn.addEventListener("click", () => {
		const sub = { done: false, title: "" };
		subs.push(sub);
		renderSubInput(sub);
		// Foco en el último input
		subsContainer.querySelectorAll(".subtask-editor-row input[type=text]")
			.forEach((el, i, arr) => { if (i === arr.length - 1) el.focus(); });
	});

	return {
		subsContainer,
		getSubtasks: () => subs.filter(s => s.title.trim()),
	};
}