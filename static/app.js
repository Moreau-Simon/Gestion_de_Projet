/**
 * FlowSaaS — Frontend Single Page Application
 * Gestion de projet multi-tenant en mode SaaS avec tableau Kanban interactif.
 */

const API_BASE = '/api/v1';

// État global de l'application
const state = {
    token: localStorage.getItem('saas_token') || null,
    user: null,
    company: null,
    projects: [],
    currentProject: null,
    currentProjectTasks: { TODO: [], IN_PROGRESS: [], REVIEW: [], DONE: [] },
    companyUsers: [],
    draggedTaskId: null
};

// =========================================================================
// GESTION DU CYCLE DE VIE ET INITIALISATION
// =========================================================================
document.addEventListener('DOMContentLoaded', async () => {
    if (state.token) {
        const ok = await fetchCurrentUser();
        if (ok) {
            await initApp();
        } else {
            handleLogout();
        }
    } else {
        showScreen('auth');
    }
});

function showScreen(screen) {
    const authScreen = document.getElementById('auth-screen');
    const appScreen = document.getElementById('app-screen');
    if (screen === 'auth') {
        authScreen.classList.remove('hidden');
        appScreen.classList.add('hidden');
    } else {
        authScreen.classList.add('hidden');
        appScreen.classList.remove('hidden');
    }
}

function showAuthTab(tab) {
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    const formLogin = document.getElementById('form-login');
    const formRegister = document.getElementById('form-register');

    if (tab === 'login') {
        tabLogin.className = "flex-1 py-2 text-center font-semibold text-sm border-b-2 border-indigo-400 text-white transition";
        tabRegister.className = "flex-1 py-2 text-center font-medium text-sm text-slate-400 border-b-2 border-transparent hover:text-white transition";
        formLogin.classList.remove('hidden');
        formRegister.classList.add('hidden');
    } else {
        tabRegister.className = "flex-1 py-2 text-center font-semibold text-sm border-b-2 border-indigo-400 text-white transition";
        tabLogin.className = "flex-1 py-2 text-center font-medium text-sm text-slate-400 border-b-2 border-transparent hover:text-white transition";
        formRegister.classList.remove('hidden');
        formLogin.classList.add('hidden');
    }
}

function fillLoginForm(email, password) {
    showAuthTab('login');
    document.getElementById('login-email').value = email;
    document.getElementById('login-password').value = password;
}

// =========================================================================
// COUCHE CLIENT API (FETCH AVEC GESTION DU TOKEN & ERREURS)
// =========================================================================
async function apiCall(endpoint, method = 'GET', body = null, requiresAuth = true) {
    const headers = {};
    if (body) {
        headers['Content-Type'] = 'application/json';
    }
    if (requiresAuth && state.token) {
        headers['Authorization'] = `Bearer ${state.token}`;
    }

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : null
        });

        if (response.status === 401 && requiresAuth) {
            showToast('Session expirée ou non autorisée.', 'error');
            handleLogout();
            return null;
        }

        if (response.status === 204) {
            return { ok: true };
        }

        const data = await response.json();
        if (!response.ok) {
            const errorMsg = data.detail || 'Une erreur est survenue';
            showToast(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg), 'error');
            return null;
        }

        return data;
    } catch (err) {
        console.error('Erreur API :', err);
        showToast('Impossible de joindre le serveur backend.', 'error');
        return null;
    }
}

// =========================================================================
// AUTHENTIFICATION & UTILISATEUR COURANT
// =========================================================================
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    const res = await apiCall('/auth/login-json', 'POST', { email, password }, false);
    if (res && res.access_token) {
        state.token = res.access_token;
        localStorage.setItem('saas_token', res.access_token);
        state.user = res.user;
        showToast(`Bienvenue, ${res.user.full_name} !`, 'success');
        await initApp();
    }
}

async function handleRegisterCompany(e) {
    e.preventDefault();
    const payload = {
        company_name: document.getElementById('reg-company-name').value.trim(),
        company_description: document.getElementById('reg-company-desc').value.trim() || null,
        admin_full_name: document.getElementById('reg-admin-name').value.trim(),
        admin_email: document.getElementById('reg-admin-email').value.trim(),
        admin_password: document.getElementById('reg-admin-password').value
    };

    const res = await apiCall('/auth/register-company', 'POST', payload, false);
    if (res && res.access_token) {
        state.token = res.access_token;
        localStorage.setItem('saas_token', res.access_token);
        state.user = res.user;
        showToast(`Organisation ${payload.company_name} créée avec succès !`, 'success');
        await initApp();
    }
}

async function fetchCurrentUser() {
    const res = await apiCall('/auth/me', 'GET');
    if (res) {
        state.user = res;
        return true;
    }
    return false;
}

function handleLogout() {
    state.token = null;
    state.user = null;
    state.company = null;
    localStorage.removeItem('saas_token');
    showScreen('auth');
    showToast('Vous êtes déconnecté.', 'info');
}

// =========================================================================
// INITIALISATION DE L'APPLICATION CONNECTÉE
// =========================================================================
async function initApp() {
    showScreen('app');

    // Mise à jour de l'UI utilisateur
    document.getElementById('user-name').textContent = state.user.full_name;
    document.getElementById('user-email').textContent = state.user.email;
    document.getElementById('user-avatar').textContent = state.user.full_name.charAt(0).toUpperCase();

    const roleBadge = document.getElementById('user-role-badge');
    roleBadge.textContent = state.user.role.toUpperCase();
    if (state.user.role === 'admin') {
        roleBadge.className = "text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200";
    } else {
        roleBadge.className = "text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-700";
    }

    // Récupérer la fiche entreprise
    const company = await apiCall('/companies/me', 'GET');
    if (company) {
        state.company = company;
        document.getElementById('current-company-name').textContent = company.name;
        document.getElementById('current-company-sub').textContent = `Tenant ID : ${company.id}`;
        document.getElementById('settings-company-name').value = company.name;
        document.getElementById('settings-company-desc').value = company.description || '';
        document.getElementById('settings-company-id').textContent = company.id;
    }

    // Masquer les actions réservées aux admins si membre standard
    const isAdmin = state.user.role === 'admin';
    const btnInvite = document.getElementById('btn-invite-user');
    if (btnInvite) btnInvite.style.display = isAdmin ? 'inline-flex' : 'none';

    const btnSaveCompany = document.getElementById('btn-save-company');
    if (btnSaveCompany) btnSaveCompany.style.display = isAdmin ? 'block' : 'none';

    // Charger les utilisateurs de l'entreprise
    await loadCompanyUsers();

    // Charger la vue par défaut (Projets)
    await navigateView('projects');
}

// =========================================================================
// NAVIGATION ENTRE LES VUES
// =========================================================================
async function navigateView(viewName) {
    const views = ['projects', 'kanban', 'team', 'settings'];
    views.forEach(v => {
        const el = document.getElementById(`view-${v}`);
        if (el) el.classList.add('hidden');

        const navBtn = document.getElementById(`nav-${v}`);
        if (navBtn) {
            navBtn.className = "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition text-slate-400 hover:text-white hover:bg-slate-800";
        }
    });

    const activeView = document.getElementById(`view-${viewName}`);
    if (activeView) activeView.classList.remove('hidden');

    const activeNav = document.getElementById(`nav-${viewName}`);
    if (activeNav) {
        activeNav.className = "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition bg-indigo-600 text-white shadow-md shadow-indigo-600/20";
    }

    if (viewName === 'projects') {
        await loadProjects();
    } else if (viewName === 'team') {
        await loadCompanyUsers();
        renderTeamTable();
    }
}

// =========================================================================
// MODULE PROJETS
// =========================================================================
async function loadProjects() {
    const data = await apiCall('/projects/', 'GET');
    if (data) {
        state.projects = data;
        renderProjectsGrid();
    }
}

function renderProjectsGrid() {
    const container = document.getElementById('projects-grid');
    if (!state.projects || state.projects.length === 0) {
        container.innerHTML = `
            <div class="col-span-full py-16 text-center bg-white rounded-2xl border-2 border-dashed border-slate-200">
                <div class="w-12 h-12 mx-auto rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center text-xl mb-3">
                    <i class="fa-solid fa-folder-open"></i>
                </div>
                <h3 class="font-bold text-slate-800 text-base">Aucun projet pour le moment</h3>
                <p class="text-xs text-slate-500 mt-1 max-w-sm mx-auto">Créez votre premier projet collaboratif pour démarrer la planification de vos tâches Kanban.</p>
                <button onclick="openCreateProjectModal()" class="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs rounded-xl transition">
                    Créer un projet
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = state.projects.map(p => {
        const membersCount = p.member_ids ? p.member_ids.length : 0;
        const isAdmin = state.user.role === 'admin';

        return `
            <div class="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition flex flex-col justify-between group">
                <div>
                    <div class="flex items-start justify-between gap-3 mb-2">
                        <div class="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-base flex-shrink-0">
                            <i class="fa-solid fa-diagram-project"></i>
                        </div>
                        ${isAdmin ? `
                            <button onclick="handleDeleteProject('${p.id}', '${escapeHtml(p.name)}')" title="Supprimer le projet" class="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition">
                                <i class="fa-solid fa-trash text-xs"></i>
                            </button>
                        ` : ''}
                    </div>
                    <h3 class="font-bold text-slate-900 text-base mb-1 group-hover:text-indigo-600 transition cursor-pointer" onclick="openKanban('${p.id}')">
                        ${escapeHtml(p.name)}
                    </h3>
                    <p class="text-xs text-slate-500 line-clamp-2 mb-4 leading-relaxed">
                        ${escapeHtml(p.description || 'Aucune description renseignée.')}
                    </p>
                </div>

                <div class="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span class="flex items-center gap-1.5">
                        <i class="fa-solid fa-users text-slate-400"></i> ${membersCount} membre(s)
                    </span>
                    <button onclick="openKanban('${p.id}')" class="font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                        Tableau Kanban <i class="fa-solid fa-chevron-right text-[10px]"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function openCreateProjectModal() {
    document.getElementById('proj-name').value = '';
    document.getElementById('proj-desc').value = '';

    // Liste des membres sélectionnables
    const container = document.getElementById('proj-members-select');
    container.innerHTML = state.companyUsers.map(u => `
        <label class="flex items-center gap-2 p-1.5 rounded hover:bg-white cursor-pointer">
            <input type="checkbox" value="${u.id}" class="proj-member-cb rounded text-indigo-600 focus:ring-indigo-500" ${u.id === state.user.id ? 'checked' : ''}>
            <span class="font-medium text-slate-800">${escapeHtml(u.full_name)}</span>
            <span class="text-slate-400 text-[10px]">(${u.role})</span>
        </label>
    `).join('');

    openModal('modal-project');
}

async function handleCreateProject(e) {
    e.preventDefault();
    const name = document.getElementById('proj-name').value.trim();
    const description = document.getElementById('proj-desc').value.trim();

    const selectedMembers = Array.from(document.querySelectorAll('.proj-member-cb:checked')).map(cb => cb.value);

    const res = await apiCall('/projects/', 'POST', {
        name,
        description: description || null,
        member_ids: selectedMembers
    });

    if (res) {
        showToast(`Projet "${name}" créé avec succès !`, 'success');
        closeModal('modal-project');
        await loadProjects();
    }
}

async function handleDeleteProject(projectId, projectName) {
    if (!confirm(`Confirmez-vous la suppression du projet "${projectName}" et de toutes ses tâches Kanban associées ?`)) {
        return;
    }

    const res = await apiCall(`/projects/${projectId}`, 'DELETE');
    if (res) {
        showToast('Projet supprimé.', 'info');
        await loadProjects();
    }
}

// =========================================================================
// MODULE KANBAN (GLISSER-DÉPOSER / DRAG & DROP)
// =========================================================================
async function openKanban(projectId) {
    const project = state.projects.find(p => p.id === projectId);
    if (!project) return;

    state.currentProject = project;
    document.getElementById('kanban-project-title').textContent = project.name;
    document.getElementById('kanban-project-desc').textContent = project.description || 'Projet d\'équipe';

    await loadKanbanBoard(projectId);

    // Basculer sur la vue Kanban
    const views = ['projects', 'kanban', 'team', 'settings'];
    views.forEach(v => document.getElementById(`view-${v}`).classList.add('hidden'));
    document.getElementById('view-kanban').classList.remove('hidden');
}

async function loadKanbanBoard(projectId) {
    const data = await apiCall(`/tasks/kanban/${projectId}`, 'GET');
    if (data && data.columns) {
        state.currentProjectTasks = data.columns;
        renderKanbanColumns();
    }
}

function renderKanbanColumns() {
    const statuses = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'];

    statuses.forEach(status => {
        const colEl = document.getElementById(`col-${status}`);
        const countEl = document.getElementById(`count-${status}`);
        const tasks = state.currentProjectTasks[status] || [];

        countEl.textContent = tasks.length;

        if (tasks.length === 0) {
            colEl.innerHTML = `
                <div class="h-28 flex items-center justify-center border-2 border-dashed border-slate-300/70 rounded-xl text-slate-400 text-xs font-medium">
                    Déposer une tâche ici
                </div>
            `;
            return;
        }

        colEl.innerHTML = tasks.map(task => {
            const priorityBadge = getPriorityBadge(task.priority);
            const assignedUser = state.companyUsers.find(u => u.id === task.assigned_user_id);
            const assignedName = assignedUser ? assignedUser.full_name : 'Non assigné';
            const assignedInitial = assignedUser ? assignedUser.full_name.charAt(0).toUpperCase() : '?';

            return `
                <div id="task-${task.id}" class="kanban-card bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow relative group"
                     draggable="true"
                     ondragstart="handleDragStart(event, '${task.id}')"
                     ondragend="handleDragEnd(event)">
                    
                    <div class="flex items-start justify-between gap-2 mb-2">
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${priorityBadge.class}">
                            ${priorityBadge.label}
                        </span>
                        <button onclick="handleDeleteTask('${task.id}')" title="Supprimer la tâche" class="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 rounded transition">
                            <i class="fa-solid fa-xmark text-xs"></i>
                        </button>
                    </div>

                    <h4 class="font-bold text-slate-800 text-sm mb-1 leading-snug">${escapeHtml(task.title)}</h4>
                    ${task.description ? `<p class="text-xs text-slate-500 line-clamp-2 mb-3">${escapeHtml(task.description)}</p>` : ''}

                    <div class="pt-2.5 mt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                        <div class="flex items-center gap-1.5" title="Assigné à : ${escapeHtml(assignedName)}">
                            <span class="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center border border-indigo-200">
                                ${assignedInitial}
                            </span>
                            <span class="text-[11px] text-slate-600 truncate max-w-[110px]">${escapeHtml(assignedName)}</span>
                        </div>
                        <span class="text-[10px] text-slate-400"><i class="fa-regular fa-clock mr-1"></i>${formatDate(task.created_at)}</span>
                    </div>
                </div>
            `;
        }).join('');
    });
}

function getPriorityBadge(priority) {
    switch (priority) {
        case 'URGENT':
            return { label: '🔥 Urgente', class: 'bg-rose-100 text-rose-800 border border-rose-200' };
        case 'HIGH':
            return { label: 'Haute', class: 'bg-amber-100 text-amber-800 border border-amber-200' };
        case 'MEDIUM':
            return { label: 'Moyenne', class: 'bg-sky-100 text-sky-800 border border-sky-200' };
        case 'LOW':
        default:
            return { label: 'Basse', class: 'bg-slate-100 text-slate-700 border border-slate-200' };
    }
}

// DRAG AND DROP HANDLERS (HTML5 NATIF)
function handleDragStart(e, taskId) {
    state.draggedTaskId = taskId;
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => {
        const card = document.getElementById(`task-${taskId}`);
        if (card) card.classList.add('dragging');
    }, 0);
}

function handleDragEnd(e) {
    const card = document.getElementById(`task-${state.draggedTaskId}`);
    if (card) card.classList.remove('dragging');
    document.querySelectorAll('.kanban-col').forEach(c => c.classList.remove('drag-over'));
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const col = e.currentTarget;
    col.classList.add('drag-over');
}

function handleDragLeave(e) {
    const col = e.currentTarget;
    col.classList.remove('drag-over');
}

async function handleDrop(e, targetStatus) {
    e.preventDefault();
    const col = e.currentTarget;
    col.classList.remove('drag-over');

    const taskId = state.draggedTaskId;
    if (!taskId) return;

    // Trouver la tâche et son statut actuel
    let currentTask = null;
    let oldStatus = null;
    for (const [st, tasks] of Object.entries(state.currentProjectTasks)) {
        const found = tasks.find(t => t.id === taskId);
        if (found) {
            currentTask = found;
            oldStatus = st;
            break;
        }
    }

    if (!currentTask || oldStatus === targetStatus) return;

    // Optimistic UI Update
    state.currentProjectTasks[oldStatus] = state.currentProjectTasks[oldStatus].filter(t => t.id !== taskId);
    currentTask.status = targetStatus;
    state.currentProjectTasks[targetStatus].push(currentTask);
    renderKanbanColumns();

    // Persistance dans MongoDB via l'API
    const res = await apiCall(`/tasks/${taskId}`, 'PUT', { status: targetStatus });
    if (!res) {
        // En cas d'échec, recharger l'état réel
        await loadKanbanBoard(state.currentProject.id);
    } else {
        showToast(`Tâche déplacée vers "${targetStatus}"`, 'info');
    }
}

function openCreateTaskModal() {
    if (!state.currentProject) return;

    document.getElementById('task-title').value = '';
    document.getElementById('task-desc').value = '';
    document.getElementById('task-status').value = 'TODO';
    document.getElementById('task-priority').value = 'MEDIUM';

    // Remplir la sélection des collaborateurs
    const select = document.getElementById('task-assigned-user');
    select.innerHTML = '<option value="">-- Non attribuée --</option>' + state.companyUsers.map(u => `
        <option value="${u.id}">${escapeHtml(u.full_name)} (${u.email})</option>
    `).join('');

    openModal('modal-task');
}

async function handleCreateTask(e) {
    e.preventDefault();
    if (!state.currentProject) return;

    const title = document.getElementById('task-title').value.trim();
    const description = document.getElementById('task-desc').value.trim();
    const status = document.getElementById('task-status').value;
    const priority = document.getElementById('task-priority').value;
    const assignedUserId = document.getElementById('task-assigned-user').value || null;

    const res = await apiCall('/tasks/', 'POST', {
        title,
        description: description || null,
        status,
        priority,
        project_id: state.currentProject.id,
        assigned_user_id: assignedUserId
    });

    if (res) {
        showToast('Tâche créée avec succès !', 'success');
        closeModal('modal-task');
        await loadKanbanBoard(state.currentProject.id);
    }
}

async function handleDeleteTask(taskId) {
    if (!confirm('Supprimer cette tâche du tableau Kanban ?')) return;

    const res = await apiCall(`/tasks/${taskId}`, 'DELETE');
    if (res) {
        showToast('Tâche supprimée.', 'info');
        await loadKanbanBoard(state.currentProject.id);
    }
}

// =========================================================================
// MODULE ÉQUIPE & UTILISATEURS
// =========================================================================
async function loadCompanyUsers() {
    const data = await apiCall('/users/', 'GET');
    if (data) {
        state.companyUsers = data;
    }
}

function renderTeamTable() {
    const tbody = document.getElementById('users-table-body');
    const isAdmin = state.user.role === 'admin';

    tbody.innerHTML = state.companyUsers.map(u => {
        const isSelf = u.id === state.user.id;
        const roleBadge = u.role === 'admin'
            ? `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">Administrateur</span>`
            : `<span class="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">Membre</span>`;

        const statusBadge = u.is_active
            ? `<span class="inline-flex items-center gap-1 text-emerald-700 font-medium text-xs"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Actif</span>`
            : `<span class="inline-flex items-center gap-1 text-slate-400 font-medium text-xs"><span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Inactif</span>`;

        return `
            <tr class="hover:bg-slate-50 transition">
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center space-x-3">
                        <div class="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs border border-indigo-200">
                            ${u.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div class="font-semibold text-slate-800">${escapeHtml(u.full_name)} ${isSelf ? '<span class="text-xs text-indigo-500 font-normal">(Vous)</span>' : ''}</div>
                            <div class="text-xs text-slate-400">${escapeHtml(u.email)}</div>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">${roleBadge}</td>
                <td class="px-6 py-4 whitespace-nowrap">${statusBadge}</td>
                <td class="px-6 py-4 whitespace-nowrap text-xs text-slate-400">${formatDate(u.created_at)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-right">
                    ${isAdmin && !isSelf ? `
                        <button onclick="handleDeleteUser('${u.id}', '${escapeHtml(u.full_name)}')" class="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition" title="Supprimer le collaborateur">
                            <i class="fa-solid fa-trash text-xs"></i>
                        </button>
                    ` : '<span class="text-xs text-slate-300">—</span>'}
                </td>
            </tr>
        `;
    }).join('');
}

function openCreateUserModal() {
    document.getElementById('newuser-name').value = '';
    document.getElementById('newuser-email').value = '';
    document.getElementById('newuser-password').value = '';
    document.getElementById('newuser-role').value = 'member';
    openModal('modal-user');
}

async function handleCreateUser(e) {
    e.preventDefault();
    const payload = {
        full_name: document.getElementById('newuser-name').value.trim(),
        email: document.getElementById('newuser-email').value.trim(),
        password: document.getElementById('newuser-password').value,
        role: document.getElementById('newuser-role').value,
        is_active: true
    };

    const res = await apiCall('/users/', 'POST', payload);
    if (res) {
        showToast(`Collaborateur "${payload.full_name}" ajouté !`, 'success');
        closeModal('modal-user');
        await loadCompanyUsers();
        renderTeamTable();
    }
}

async function handleDeleteUser(userId, userName) {
    if (!confirm(`Supprimer le compte de "${userName}" de votre entreprise ?`)) return;

    const res = await apiCall(`/users/${userId}`, 'DELETE');
    if (res) {
        showToast('Collaborateur supprimé.', 'info');
        await loadCompanyUsers();
        renderTeamTable();
    }
}

// =========================================================================
// MODULE PARAMÈTRES DE L'ENTREPRISE
// =========================================================================
async function handleUpdateCompany(e) {
    e.preventDefault();
    const name = document.getElementById('settings-company-name').value.trim();
    const description = document.getElementById('settings-company-desc').value.trim();

    const res = await apiCall('/companies/me', 'PUT', { name, description });
    if (res) {
        showToast('Informations de l\'entreprise mises à jour !', 'success');
        state.company = res;
        document.getElementById('current-company-name').textContent = res.name;
    }
}

async function handleDeleteCompany() {
    const confirmation = prompt(`ATTENTION : tapez le nom exact de votre entreprise ("${state.company.name}") pour confirmer la suppression définitive :`);
    if (confirmation !== state.company.name) {
        showToast('Nom incorrect, suppression annulée.', 'info');
        return;
    }

    const res = await apiCall('/companies/me', 'DELETE');
    if (res) {
        showToast('Entreprise supprimée définitivement.', 'info');
        handleLogout();
    }
}

// =========================================================================
// UTILITAIRES MODALS, TOASTS & FORMATAGE
// =========================================================================
function openModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove('hidden');
}

function closeModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.add('hidden');
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');

    let bg = 'bg-slate-900 text-white border border-slate-700';
    let icon = '<i class="fa-solid fa-circle-info text-sky-400"></i>';

    if (type === 'success') {
        bg = 'bg-emerald-950 text-emerald-100 border border-emerald-800';
        icon = '<i class="fa-solid fa-circle-check text-emerald-400"></i>';
    } else if (type === 'error') {
        bg = 'bg-rose-950 text-rose-100 border border-rose-800';
        icon = '<i class="fa-solid fa-circle-exclamation text-rose-400"></i>';
    }

    toast.className = `toast pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-xs font-medium max-w-sm ${bg}`;
    toast.innerHTML = `${icon} <span>${escapeHtml(message)}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
