/**
 * FlowSaaS — Frontend Single Page Application v2.0
 * Plateforme SaaS de gestion de projet collaborative en mode Multi-Tenant avec MongoDB.
 */

const API_BASE = '/api/v1';

// État global réactif de l'application
const state = {
    token: localStorage.getItem('saas_token') || null,
    user: null,
    company: null,
    projects: [],
    currentProject: null,
    currentProjectTasks: { TODO: [], IN_PROGRESS: [], REVIEW: [], DONE: [] },
    companyUsers: [],
    draggedTaskId: null,
    darkMode: localStorage.getItem('saas_dark_mode') === 'true',
    searchQuery: '',
    allTasks: []
};

// =========================================================================
// 1. CYCLE DE VIE ET INITIALISATION
// =========================================================================
document.addEventListener('DOMContentLoaded', async () => {
    // Appliquer le thème sombre si mémorisé
    applyDarkMode(state.darkMode);

    // Initialiser les raccourcis clavier globaux
    initKeyboardShortcuts();

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
        tabLogin.className = "flex-1 py-2.5 text-center font-semibold text-sm border-b-2 border-violet-400 text-white transition flex items-center justify-center gap-2";
        tabRegister.className = "flex-1 py-2.5 text-center font-medium text-sm text-slate-400 border-b-2 border-transparent hover:text-white transition flex items-center justify-center gap-2";
        formLogin.classList.remove('hidden');
        formRegister.classList.add('hidden');
    } else {
        tabRegister.className = "flex-1 py-2.5 text-center font-semibold text-sm border-b-2 border-violet-400 text-white transition flex items-center justify-center gap-2";
        tabLogin.className = "flex-1 py-2.5 text-center font-medium text-sm text-slate-400 border-b-2 border-transparent hover:text-white transition flex items-center justify-center gap-2";
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
// 2. COUCHE CLIENT API (FETCH ASYNCHRONE AVEC JWT & NOTIFICATIONS)
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
            let errorMsg = 'Une erreur est survenue';
            if (typeof data.detail === 'string') {
                errorMsg = data.detail;
            } else if (Array.isArray(data.detail)) {
                errorMsg = data.detail.map(err => {
                    const field = err.loc ? err.loc[err.loc.length - 1] : '';
                    return field ? `${field} : ${err.msg}` : err.msg;
                }).join(' | ');
            } else if (data.detail) {
                errorMsg = JSON.stringify(data.detail);
            }
            showToast(errorMsg, 'error');
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
// 3. AUTHENTIFICATION & UTILISATEUR COURANT
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
    state.projects = [];
    state.currentProject = null;
    state.allTasks = [];
    localStorage.removeItem('saas_token');
    showScreen('auth');
    showToast('Vous êtes déconnecté.', 'info');
}

// =========================================================================
// 4. INITIALISATION DE L'ESPACE DE TRAVAIL
// =========================================================================
async function initApp() {
    showScreen('app');

    // Mise à jour de la top bar utilisateur
    document.getElementById('user-name').textContent = state.user.full_name;
    document.getElementById('user-email').textContent = state.user.email;
    document.getElementById('user-avatar').textContent = state.user.full_name.charAt(0).toUpperCase();

    const roleBadge = document.getElementById('user-role-badge');
    roleBadge.textContent = state.user.role.toUpperCase();
    if (state.user.role === 'admin') {
        roleBadge.className = "text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800";
    } else {
        roleBadge.className = "text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 border border-violet-200 dark:border-violet-800";
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

    // Droits administrateur
    const isAdmin = state.user.role === 'admin';
    const btnInvite = document.getElementById('btn-invite-user');
    if (btnInvite) btnInvite.style.display = isAdmin ? 'inline-flex' : 'none';

    const btnSaveCompany = document.getElementById('btn-save-company');
    if (btnSaveCompany) btnSaveCompany.style.display = isAdmin ? 'inline-block' : 'none';

    // Charger les utilisateurs de l'entreprise
    await loadCompanyUsers();

    // Charger et afficher tous les projets
    await loadProjects(true);

    // Naviguer par défaut vers la vue Projets pour un accès direct
    await navigateView('projects');
}

// =========================================================================
// 5. NAVIGATION ENTRE LES VUES
// =========================================================================
async function navigateView(viewName) {
    const views = ['dashboard', 'projects', 'kanban', 'team', 'settings'];
    
    views.forEach(v => {
        const el = document.getElementById(`view-${v}`);
        if (el) el.classList.add('hidden');

        const navBtn = document.getElementById(`nav-${v}`);
        if (navBtn) {
            navBtn.className = "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition text-slate-400 hover:text-white hover:bg-slate-800/80 btn-press";
        }
    });

    const activeView = document.getElementById(`view-${viewName}`);
    if (activeView) {
        activeView.classList.remove('hidden');
    }

    const activeNav = document.getElementById(`nav-${viewName}`);
    if (activeNav) {
        activeNav.className = "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-semibold text-sm transition nav-active btn-press";
    }

    if (viewName === 'dashboard') {
        await renderDashboard();
    } else if (viewName === 'projects') {
        await loadProjects();
    } else if (viewName === 'team') {
        await loadCompanyUsers();
        renderTeamTable();
    }
}

// =========================================================================
// 6. MODULE TABLEAU DE BORD (DASHBOARD)
// =========================================================================
async function renderDashboard() {
    // 1. Message de bienvenue et date
    const welcomeEl = document.getElementById('dashboard-welcome');
    if (welcomeEl && state.user) {
        welcomeEl.textContent = `Bonjour, ${state.user.full_name} 👋`;
    }

    const dateEl = document.getElementById('dashboard-date');
    if (dateEl) {
        const today = new Date().toLocaleDateString('fr-FR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
        dateEl.innerHTML = `<i class="fa-regular fa-calendar mr-1.5"></i> ${today.charAt(0).toUpperCase() + today.slice(1)}`;
    }

    // 2. Charger les tâches globales pour les statistiques
    const tasks = await apiCall('/tasks/?limit=1000', 'GET');
    state.allTasks = tasks || [];

    // 3. Calculer les métriques
    const totalProjects = state.projects ? state.projects.length : 0;
    const totalTasks = state.allTasks.length;
    const doneTasks = state.allTasks.filter(t => t.status === 'DONE').length;
    const donePct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
    const totalMembers = state.companyUsers ? state.companyUsers.length : 0;

    // 4. Mettre à jour les compteurs animés
    animateCount('stat-projects', totalProjects);
    animateCount('stat-tasks-total', totalTasks);
    animateCount('stat-tasks-done', doneTasks);
    animateCount('stat-members', totalMembers);

    const donePctEl = document.getElementById('stat-tasks-done-pct');
    if (donePctEl) donePctEl.textContent = `${donePct}% achevé`;

    // 5. Rendre les tâches récentes (5 dernières)
    const recentTasksContainer = document.getElementById('dashboard-recent-tasks');
    if (!recentTasksContainer) return;

    if (state.allTasks.length === 0) {
        recentTasksContainer.innerHTML = `
            <div class="py-8 text-center text-slate-400 text-xs">
                <i class="fa-solid fa-list-check text-2xl mb-2 text-slate-300 dark:text-slate-600 block"></i>
                Aucune tâche enregistrée. Créez un projet et ajoutez vos premières tâches Kanban !
            </div>
        `;
        return;
    }

    const recentSorted = [...state.allTasks].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);

    recentTasksContainer.innerHTML = recentSorted.map(task => {
        const project = state.projects.find(p => p.id === task.project_id);
        const projectName = project ? project.name : 'Projet';
        const assignedUser = state.companyUsers.find(u => u.id === task.assigned_user_id);
        const assignedName = assignedUser ? assignedUser.full_name : 'Non assigné';
        const priorityBadge = getPriorityBadge(task.priority);

        const statusIcons = {
            TODO: '<span class="text-slate-400"><i class="fa-regular fa-circle mr-1"></i> À faire</span>',
            IN_PROGRESS: '<span class="text-amber-500 font-semibold"><i class="fa-solid fa-spinner fa-spin mr-1"></i> En cours</span>',
            REVIEW: '<span class="text-purple-500 font-semibold"><i class="fa-solid fa-eye mr-1"></i> En revue</span>',
            DONE: '<span class="text-emerald-500 font-semibold"><i class="fa-solid fa-circle-check mr-1"></i> Terminé</span>'
        };

        return `
            <div class="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 transition border border-slate-200/60 dark:border-slate-800 cursor-pointer group"
                 onclick="openKanban('${task.project_id}')">
                <div class="flex items-center space-x-3 min-w-0">
                    <span class="w-2.5 h-2.5 rounded-full ${task.priority === 'URGENT' ? 'bg-rose-500 animate-pulse' : (task.priority === 'HIGH' ? 'bg-amber-500' : 'bg-violet-500')}"></span>
                    <div class="truncate">
                        <div class="font-bold text-sm text-slate-800 dark:text-slate-200 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition truncate">${escapeHtml(task.title)}</div>
                        <div class="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                            <span class="font-medium text-slate-500 dark:text-slate-400"><i class="fa-solid fa-folder text-[10px] mr-1"></i>${escapeHtml(projectName)}</span>
                            <span>•</span>
                            <span><i class="fa-solid fa-user text-[10px] mr-1"></i>${escapeHtml(assignedName)}</span>
                        </div>
                    </div>
                </div>
                <div class="flex items-center space-x-3 text-xs flex-shrink-0">
                    <div class="hidden sm:block text-slate-500">${statusIcons[task.status] || task.status}</div>
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${priorityBadge.class}">
                        ${priorityBadge.label}
                    </span>
                    <i class="fa-solid fa-chevron-right text-slate-300 dark:text-slate-600 group-hover:text-violet-500 group-hover:translate-x-0.5 transition text-xs"></i>
                </div>
            </div>
        `;
    }).join('');
}

// =========================================================================
// 7. MODULE PROJETS & RECHERCHE GLOBALE
// =========================================================================
async function loadAllTasks() {
    const tasks = await apiCall('/tasks/?limit=1000', 'GET');
    if (tasks !== null) {
        state.allTasks = tasks;
    }
    return state.allTasks;
}

async function loadProjects(render = true) {
    const container = document.getElementById('projects-grid');
    if (render && container && (!state.projects || state.projects.length === 0)) {
        showLoadingState('projects-grid', 3);
    }

    const data = await apiCall('/projects/', 'GET');
    if (data !== null) {
        state.projects = data;
    }

    // Assurer que les tâches globales sont également synchronisées
    if (!state.allTasks || state.allTasks.length === 0) {
        await loadAllTasks();
    }

    if (render) {
        renderProjectsGrid();
    }
}

function renderProjectsGrid(customProjects = null, customTasks = null) {
    const container = document.getElementById('projects-grid');
    if (!container) return;

    const totalCount = state.projects ? state.projects.length : 0;
    const isSearching = state.searchQuery && state.searchQuery.trim().length > 0;

    let filteredProjects = customProjects !== null ? customProjects : (state.projects || []);
    let filteredTasks = customTasks !== null ? customTasks : [];

    if (isSearching && customProjects === null && customTasks === null) {
        const q = state.searchQuery.toLowerCase().trim();

        // 1. Filtrer les projets
        filteredProjects = (state.projects || []).filter(p => {
            const nameMatch = p.name && p.name.toLowerCase().includes(q);
            const descMatch = p.description && p.description.toLowerCase().includes(q);
            return Boolean(nameMatch || descMatch);
        });

        // 2. Filtrer les tâches sur l'ensemble des projets
        filteredTasks = (state.allTasks || []).filter(t => {
            const titleMatch = t.title && t.title.toLowerCase().includes(q);
            const descMatch = t.description && t.description.toLowerCase().includes(q);
            const statusMatch = t.status && t.status.toLowerCase().includes(q);
            const priorityMatch = t.priority && t.priority.toLowerCase().includes(q);

            const project = (state.projects || []).find(p => (p.id || p._id) === t.project_id);
            const projectMatch = project && project.name && project.name.toLowerCase().includes(q);

            const assigned = (state.companyUsers || []).find(u => (u.id || u._id) === t.assigned_user_id);
            const userMatch = assigned && assigned.full_name && assigned.full_name.toLowerCase().includes(q);

            return Boolean(titleMatch || descMatch || statusMatch || priorityMatch || projectMatch || userMatch);
        });
    }

    // Cas 1 : Aucun projet dans l'organisation (hors recherche)
    if (totalCount === 0 && !isSearching) {
        container.innerHTML = `
            <div class="col-span-full py-16 text-center bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800 p-8">
                <div class="w-16 h-16 mx-auto rounded-2xl bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 flex items-center justify-center text-2xl mb-4 shadow-sm">
                    <i class="fa-solid fa-folder-open"></i>
                </div>
                <h3 class="font-extrabold text-slate-800 dark:text-white text-lg">Aucun projet pour le moment</h3>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">Créez votre premier projet collaboratif pour démarrer la planification de vos tâches Kanban.</p>
                <button onclick="openCreateProjectModal()" class="mt-5 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold text-xs rounded-xl transition shadow-sm btn-press">
                    <i class="fa-solid fa-plus mr-1.5"></i> Créer un projet
                </button>
            </div>
        `;
        return;
    }

    // Cas 2 : Recherche active mais 0 projet ET 0 tâche correspondante
    if (isSearching && filteredProjects.length === 0 && filteredTasks.length === 0) {
        container.innerHTML = `
            <div class="col-span-full py-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
                <div class="w-14 h-14 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-500 flex items-center justify-center text-xl mb-3 shadow-sm">
                    <i class="fa-solid fa-magnifying-glass"></i>
                </div>
                <h3 class="font-extrabold text-slate-800 dark:text-white text-base">Aucun résultat pour "${escapeHtml(state.searchQuery)}"</h3>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">Aucun projet ni tâche Kanban ne correspond à ce filtre dans votre espace.</p>
                <div class="mt-4 flex items-center justify-center gap-2">
                    <button onclick="clearSearch()" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-xl transition shadow-sm btn-press">
                        <i class="fa-solid fa-xmark mr-1.5"></i> Effacer le filtre (${totalCount} projet${totalCount > 1 ? 's' : ''})
                    </button>
                </div>
            </div>
        `;
        return;
    }

    // Cas 3 : Recherche active avec résultats (Projets et/ou Tâches sur tous les projets)
    if (isSearching) {
        let html = `
            <div class="col-span-full pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 mb-2">
                <div>
                    <h3 class="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                        <i class="fa-solid fa-magnifying-glass text-violet-500"></i>
                        <span>Résultats de recherche pour "${escapeHtml(state.searchQuery)}"</span>
                    </h3>
                    <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Trouvé : <span class="font-bold text-violet-600 dark:text-violet-400">${filteredProjects.length}</span> projet(s) et <span class="font-bold text-cyan-600 dark:text-cyan-400">${filteredTasks.length}</span> tâche(s) sur l'ensemble de votre organisation.
                    </p>
                </div>
                <button onclick="clearSearch()" class="px-3.5 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs transition flex items-center gap-1.5 self-start sm:self-auto btn-press">
                    <i class="fa-solid fa-xmark"></i> Effacer la recherche
                </button>
            </div>
        `;

        // Section Projets correspondants
        if (filteredProjects.length > 0) {
            html += `
                <div class="col-span-full pt-1 pb-1">
                    <h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <i class="fa-solid fa-folder text-violet-500"></i>
                        <span>Projets correspondants (${filteredProjects.length})</span>
                    </h4>
                </div>
            `;
            const borderColors = ['border-l-violet-500', 'border-l-cyan-500', 'border-l-emerald-500', 'border-l-amber-500'];
            html += filteredProjects.map((p, index) => renderProjectCardHtml(p, index, borderColors)).join('');
        }

        // Section Tâches correspondantes (sur TOUS les projets)
        if (filteredTasks.length > 0) {
            html += `
                <div class="col-span-full pt-6 pb-2 border-t border-slate-200 dark:border-slate-800 mt-4">
                    <h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <i class="fa-solid fa-list-check text-cyan-500"></i>
                        <span>Tâches Kanban trouvées (${filteredTasks.length}) — Tous projets confondus</span>
                    </h4>
                    <p class="text-[11px] text-slate-400 mt-0.5">Cliquez sur une tâche pour ouvrir immédiatement le tableau Kanban du projet associé.</p>
                </div>
            `;
            html += filteredTasks.map(t => renderTaskSearchCardHtml(t)).join('');
        }

        container.innerHTML = html;
        return;
    }

    // Cas 4 : Affichage standard de tous les projets
    const borderColors = ['border-l-violet-500', 'border-l-cyan-500', 'border-l-emerald-500', 'border-l-amber-500'];
    container.innerHTML = filteredProjects.map((p, index) => renderProjectCardHtml(p, index, borderColors)).join('');
}

function renderProjectCardHtml(p, index, borderColors) {
    const pId = p.id || p._id;
    const membersCount = p.member_ids ? p.member_ids.length : 0;
    const isAdmin = state.user && state.user.role === 'admin';
    const accentBorder = borderColors[index % borderColors.length];

    return `
        <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 border-l-4 ${accentBorder} p-6 shadow-sm card-lift flex flex-col justify-between group">
            <div>
                <div class="flex items-start justify-between gap-3 mb-3">
                    <div class="w-11 h-11 rounded-xl bg-violet-50 dark:bg-violet-950/60 border border-violet-100 dark:border-violet-900/60 text-violet-600 dark:text-violet-400 flex items-center justify-center font-bold text-lg flex-shrink-0">
                        <i class="fa-solid fa-diagram-project"></i>
                    </div>
                    ${isAdmin ? `
                        <button onclick="handleDeleteProject('${pId}')" title="Supprimer le projet" class="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-xl transition">
                            <i class="fa-solid fa-trash text-xs"></i>
                        </button>
                    ` : ''}
                </div>
                <h3 class="font-extrabold text-slate-900 dark:text-white text-lg mb-1.5 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition cursor-pointer" onclick="openKanban('${pId}')">
                    ${escapeHtml(p.name)}
                </h3>
                <p class="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-4 leading-relaxed">
                    ${escapeHtml(p.description || 'Aucune description renseignée.')}
                </p>
            </div>

            <div class="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span class="flex items-center gap-1.5 font-medium">
                    <i class="fa-solid fa-users text-slate-400"></i> ${membersCount} membre(s)
                </span>
                <button onclick="openKanban('${pId}')" class="font-bold text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-300 flex items-center gap-1.5 transition">
                    <span>Ouvrir Kanban</span>
                    <i class="fa-solid fa-arrow-right text-[11px] group-hover:translate-x-1 transition-transform"></i>
                </button>
            </div>
        </div>
    `;
}

function renderTaskSearchCardHtml(task) {
    const project = (state.projects || []).find(p => (p.id || p._id) === task.project_id);
    const projectName = project ? project.name : 'Projet';
    const assignedUser = (state.companyUsers || []).find(u => (u.id || u._id) === task.assigned_user_id);
    const assignedName = assignedUser ? assignedUser.full_name : 'Non assigné';
    const priorityBadge = getPriorityBadge(task.priority);

    const statusLabels = {
        TODO: 'À faire',
        IN_PROGRESS: 'En cours',
        REVIEW: 'En revue',
        DONE: 'Terminé'
    };
    const statusClasses = {
        TODO: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
        IN_PROGRESS: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
        REVIEW: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
        DONE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
    };

    return `
        <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm hover:shadow-md transition card-lift flex flex-col justify-between cursor-pointer group border-l-4 kanban-card-priority-${task.priority}"
             onclick="openKanban('${task.project_id}')" title="Ouvrir le tableau Kanban du projet ${escapeHtml(projectName)}">
            <div>
                <div class="flex items-center justify-between gap-2 mb-2.5">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${priorityBadge.class}">
                        ${priorityBadge.label}
                    </span>
                    <span class="px-2 py-0.5 rounded text-[10px] font-semibold ${statusClasses[task.status] || 'bg-slate-100 text-slate-700'}">
                        ${statusLabels[task.status] || task.status}
                    </span>
                </div>
                <h4 class="font-bold text-slate-900 dark:text-white text-sm mb-1.5 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition leading-snug">
                    ${escapeHtml(task.title)}
                </h4>
                ${task.description ? `<p class="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-3 leading-relaxed">${escapeHtml(task.description)}</p>` : ''}
            </div>

            <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <span class="inline-flex items-center gap-1.5 font-bold text-violet-600 dark:text-violet-400 truncate max-w-[140px]">
                    <i class="fa-solid fa-folder text-[10px]"></i> ${escapeHtml(projectName)}
                </span>
                <span class="text-slate-500 dark:text-slate-400 truncate max-w-[120px] flex items-center gap-1">
                    <i class="fa-solid fa-user text-[10px]"></i> ${escapeHtml(assignedName)}
                </span>
            </div>
        </div>
    `;
}

function openCreateProjectModal() {
    document.getElementById('proj-name').value = '';
    document.getElementById('proj-desc').value = '';

    // Liste des membres sélectionnables
    const container = document.getElementById('proj-members-select');
    const users = state.companyUsers || [];
    if (users.length === 0) {
        container.innerHTML = `<span class="text-slate-400 text-xs italic">Aucun autre collaborateur. Vous serez automatiquement assigné.</span>`;
    } else {
        container.innerHTML = users.map(u => `
            <label class="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-700/60 cursor-pointer transition">
                <input type="checkbox" value="${u.id || u._id}" class="proj-member-cb rounded text-violet-600 focus:ring-violet-500" ${(u.id || u._id) === state.user.id ? 'checked' : ''}>
                <span class="font-semibold text-slate-800 dark:text-slate-200">${escapeHtml(u.full_name)}</span>
                <span class="text-slate-400 text-[10px]">(${u.role})</span>
            </label>
        `).join('');
    }

    openModal('modal-project');
}

async function handleCreateProject(e) {
    e.preventDefault();
    const nameInput = document.getElementById('proj-name');
    const descInput = document.getElementById('proj-desc');
    const name = nameInput.value.trim();
    const description = descInput.value.trim();

    const selectedMembers = Array.from(document.querySelectorAll('.proj-member-cb:checked')).map(cb => cb.value);

    const res = await apiCall('/projects/', 'POST', {
        name,
        description: description || null,
        member_ids: selectedMembers
    });

    if (res) {
        showToast(`Projet "${name}" créé avec succès !`, 'success');
        closeModal('modal-project');
        clearSearch(); // Réinitialise tout filtre de recherche pour afficher immédiatement le projet créé
        await loadProjects(true); // Recharger la liste depuis la BDD
        await navigateView('projects'); // Basculer sur la vue Projets
    }
}

async function handleDeleteProject(projectId, projectName = null) {
    const project = state.projects.find(p => (p.id || p._id) === projectId);
    const name = projectName || (project ? project.name : 'ce projet');
    if (!confirm(`Confirmez-vous la suppression du projet "${name}" et de toutes ses tâches Kanban associées ?`)) {
        return;
    }

    const res = await apiCall(`/projects/${projectId}`, 'DELETE');
    if (res) {
        showToast('Projet supprimé.', 'info');
        await loadProjects(true);
    }
}

// =========================================================================
// 8. MODULE TABLEAU KANBAN (DRAG & DROP HTML5)
// =========================================================================
async function openKanban(projectId) {
    const project = state.projects.find(p => (p.id || p._id) === projectId);
    if (!project) return;

    state.currentProject = project;
    document.getElementById('kanban-project-title').textContent = project.name;
    document.getElementById('kanban-project-desc').textContent = project.description || 'Espace de travail collaboratif';

    await loadKanbanBoard(projectId);

    // Basculer sur la vue Kanban
    const views = ['dashboard', 'projects', 'kanban', 'team', 'settings'];
    views.forEach(v => {
        const el = document.getElementById(`view-${v}`);
        if (el) el.classList.add('hidden');
    });
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
                <div class="h-32 flex flex-col items-center justify-center border-2 border-dashed border-slate-300/80 dark:border-slate-700/80 rounded-2xl text-slate-400 dark:text-slate-500 text-xs font-semibold gap-1">
                    <i class="fa-regular fa-square-plus text-base opacity-40"></i>
                    <span>Déposer une tâche ici</span>
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
                <div id="task-${task.id}" class="kanban-card kanban-card-priority-${task.priority} bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-sm hover:shadow-md relative group"
                     draggable="true"
                     ondragstart="handleDragStart(event, '${task.id}')"
                     ondragend="handleDragEnd(event)">
                    
                    <div class="flex items-start justify-between gap-2 mb-2">
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${priorityBadge.class}">
                            ${priorityBadge.label}
                        </span>
                        <button onclick="handleDeleteTask('${task.id}')" title="Supprimer la tâche" class="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 rounded-lg transition">
                            <i class="fa-solid fa-xmark text-xs"></i>
                        </button>
                    </div>

                    <h4 class="font-bold text-slate-900 dark:text-white text-sm mb-1 leading-snug">${escapeHtml(task.title)}</h4>
                    ${task.description ? `<p class="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-3 leading-relaxed">${escapeHtml(task.description)}</p>` : ''}

                    <div class="pt-2.5 mt-2 border-t border-slate-100 dark:border-slate-700/80 flex items-center justify-between text-xs text-slate-400">
                        <div class="flex items-center gap-1.5" title="Assigné à : ${escapeHtml(assignedName)}">
                            <span class="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 text-[10px] font-bold flex items-center justify-center border border-violet-200 dark:border-violet-800">
                                ${assignedInitial}
                            </span>
                            <span class="text-[11px] text-slate-600 dark:text-slate-300 truncate max-w-[110px]">${escapeHtml(assignedName)}</span>
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
            return { label: '🔥 Urgente', class: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-800' };
        case 'HIGH':
            return { label: 'Haute', class: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800' };
        case 'MEDIUM':
            return { label: 'Moyenne', class: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800' };
        case 'LOW':
        default:
            return { label: 'Basse', class: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700' };
    }
}

// GESTION DU DRAG & DROP HTML5 NATIF
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

    // Optimistic UI Update instantanée
    state.currentProjectTasks[oldStatus] = state.currentProjectTasks[oldStatus].filter(t => t.id !== taskId);
    currentTask.status = targetStatus;
    state.currentProjectTasks[targetStatus].push(currentTask);
    renderKanbanColumns();

    // Persistance dans MongoDB via l'API
    const res = await apiCall(`/tasks/${taskId}`, 'PUT', { status: targetStatus });
    if (!res) {
        // En cas d'échec réseau, restaurer l'état serveur
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
        await loadAllTasks(); // Actualise l'index de recherche global
    }
}

async function handleDeleteTask(taskId) {
    if (!confirm('Supprimer cette tâche du tableau Kanban ?')) return;

    const res = await apiCall(`/tasks/${taskId}`, 'DELETE');
    if (res) {
        showToast('Tâche supprimée.', 'info');
        await loadKanbanBoard(state.currentProject.id);
        await loadAllTasks(); // Actualise l'index de recherche global
    }
}

// =========================================================================
// 9. MODULE ÉQUIPE & UTILISATEURS
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
            ? `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800"><i class="fa-solid fa-crown mr-1 text-[9px]"></i> Administrateur</span>`
            : `<span class="px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">Membre</span>`;

        const statusBadge = u.is_active
            ? `<span class="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-semibold text-xs"><span class="w-2 h-2 rounded-full bg-emerald-500"></span> Actif</span>`
            : `<span class="inline-flex items-center gap-1.5 text-slate-400 font-medium text-xs"><span class="w-2 h-2 rounded-full bg-slate-400"></span> Inactif</span>`;

        return `
            <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center space-x-3">
                        <div class="w-9 h-9 rounded-full bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 flex items-center justify-center font-bold text-xs border border-violet-200 dark:border-violet-800">
                            ${u.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div class="font-bold text-slate-800 dark:text-slate-200">${escapeHtml(u.full_name)} ${isSelf ? '<span class="text-xs text-violet-500 font-normal ml-1">(Vous)</span>' : ''}</div>
                            <div class="text-xs text-slate-400">${escapeHtml(u.email)}</div>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">${roleBadge}</td>
                <td class="px-6 py-4 whitespace-nowrap">${statusBadge}</td>
                <td class="px-6 py-4 whitespace-nowrap text-xs text-slate-400">${formatDate(u.created_at)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-right">
                    ${isAdmin && !isSelf ? `
                        <button onclick="handleDeleteUser('${u.id}', '${escapeHtml(u.full_name)}')" class="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-xl transition" title="Supprimer le collaborateur">
                            <i class="fa-solid fa-trash text-xs"></i>
                        </button>
                    ` : '<span class="text-xs text-slate-300 dark:text-slate-600">—</span>'}
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
// 10. MODULE PARAMÈTRES DE L'ENTREPRISE
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
// 11. RECHERCHE GLOBALE MULTI-PROJETS & TÂCHES + DARK MODE
// =========================================================================
let searchDebounceTimeout = null;

async function handleGlobalSearch(query) {
    state.searchQuery = query || '';

    // Afficher ou masquer le bouton 'X'
    const clearBtn = document.getElementById('search-clear-btn');
    if (clearBtn) {
        if (state.searchQuery.trim().length > 0) {
            clearBtn.classList.remove('hidden');
        } else {
            clearBtn.classList.add('hidden');
        }
    }

    if (state.searchQuery.trim().length === 0) {
        closeSearchDropdown();
        const projectsView = document.getElementById('view-projects');
        if (projectsView && !projectsView.classList.contains('hidden')) {
            renderProjectsGrid();
        }
        return;
    }

    // S'assurer que les tâches globales sont chargées
    if (!state.allTasks || state.allTasks.length === 0) {
        await loadAllTasks();
    }

    clearTimeout(searchDebounceTimeout);
    searchDebounceTimeout = setTimeout(() => {
        const q = state.searchQuery.toLowerCase().trim();

        // 1. Filtrer les projets par nom ou description
        const matchingProjects = (state.projects || []).filter(p => {
            const nameMatch = p.name && p.name.toLowerCase().includes(q);
            const descMatch = p.description && p.description.toLowerCase().includes(q);
            return Boolean(nameMatch || descMatch);
        });

        // 2. Filtrer les tâches sur l'ENSEMBLE de tous les projets
        const matchingTasks = (state.allTasks || []).filter(t => {
            const titleMatch = t.title && t.title.toLowerCase().includes(q);
            const descMatch = t.description && t.description.toLowerCase().includes(q);
            const statusMatch = t.status && t.status.toLowerCase().includes(q);
            const priorityMatch = t.priority && t.priority.toLowerCase().includes(q);

            const project = (state.projects || []).find(p => (p.id || p._id) === t.project_id);
            const projectMatch = project && project.name && project.name.toLowerCase().includes(q);

            const assigned = (state.companyUsers || []).find(u => (u.id || u._id) === t.assigned_user_id);
            const userMatch = assigned && assigned.full_name && assigned.full_name.toLowerCase().includes(q);

            return Boolean(titleMatch || descMatch || statusMatch || priorityMatch || projectMatch || userMatch);
        });

        // Afficher le menu déroulant dynamique instantané sous la barre
        renderSearchDropdown(matchingProjects, matchingTasks);

        // Si l'utilisateur est sur la vue Projets, mettre à jour aussi la vue principale
        const projectsView = document.getElementById('view-projects');
        if (projectsView && !projectsView.classList.contains('hidden')) {
            renderProjectsGrid(matchingProjects, matchingTasks);
        }
    }, 120);
}

function renderSearchDropdown(matchingProjects, matchingTasks) {
    const dropdown = document.getElementById('search-dropdown');
    if (!dropdown) return;

    if (!state.searchQuery || state.searchQuery.trim().length === 0) {
        dropdown.classList.add('hidden');
        return;
    }

    if (matchingProjects.length === 0 && matchingTasks.length === 0) {
        dropdown.innerHTML = `
            <div class="p-6 text-center text-xs text-slate-400">
                <i class="fa-solid fa-magnifying-glass text-slate-300 dark:text-slate-600 text-xl mb-2 block"></i>
                Aucun projet ni tâche ne correspond à "<b>${escapeHtml(state.searchQuery)}</b>"
            </div>
        `;
        dropdown.classList.remove('hidden');
        return;
    }

    let html = '';

    // 1. Projets correspondants (max 4)
    if (matchingProjects.length > 0) {
        html += `
            <div class="p-2 border-b border-slate-100 dark:border-slate-800">
                <div class="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                    <span class="flex items-center gap-1.5"><i class="fa-solid fa-folder text-violet-500"></i> Projets</span>
                    <span class="bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-400 px-1.5 py-0.2 rounded font-bold">${matchingProjects.length}</span>
                </div>
                ${matchingProjects.slice(0, 4).map(p => {
                    const pId = p.id || p._id;
                    return `
                        <div class="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition"
                             onclick="openKanban('${pId}'); closeSearchDropdown();">
                            <div class="flex items-center gap-2.5 min-w-0">
                                <div class="w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-400 flex items-center justify-center text-xs font-bold flex-shrink-0">
                                    <i class="fa-solid fa-folder"></i>
                                </div>
                                <div class="truncate">
                                    <div class="text-xs font-bold text-slate-800 dark:text-white truncate">${escapeHtml(p.name)}</div>
                                    <div class="text-[10px] text-slate-400">${(p.member_ids || []).length} membre(s)</div>
                                </div>
                            </div>
                            <i class="fa-solid fa-chevron-right text-slate-400 text-[10px]"></i>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    // 2. Tâches correspondantes sur TOUS les projets (max 6)
    if (matchingTasks.length > 0) {
        html += `
            <div class="p-2">
                <div class="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                    <span class="flex items-center gap-1.5"><i class="fa-solid fa-list-check text-cyan-500"></i> Tâches Kanban (tous projets)</span>
                    <span class="bg-cyan-100 dark:bg-cyan-950 text-cyan-600 dark:text-cyan-400 px-1.5 py-0.2 rounded font-bold">${matchingTasks.length}</span>
                </div>
                ${matchingTasks.slice(0, 6).map(t => {
                    const project = (state.projects || []).find(p => (p.id || p._id) === t.project_id);
                    const projectName = project ? project.name : 'Projet';
                    const priorityBadge = getPriorityBadge(t.priority);
                    return `
                        <div class="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition"
                             onclick="openKanban('${t.project_id}'); closeSearchDropdown();" title="Ouvrir dans le projet ${escapeHtml(projectName)}">
                            <div class="min-w-0 flex-1 pr-2">
                                <div class="flex items-center gap-1.5">
                                    <span class="text-[9px] font-bold px-1.5 py-0.2 rounded ${priorityBadge.class}">${priorityBadge.label}</span>
                                    <div class="text-xs font-bold text-slate-800 dark:text-white truncate">${escapeHtml(t.title)}</div>
                                </div>
                                <div class="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                                    <span class="font-semibold text-violet-600 dark:text-violet-400"><i class="fa-solid fa-folder text-[9px] mr-1"></i>${escapeHtml(projectName)}</span>
                                    <span>•</span>
                                    <span>Statut : ${t.status}</span>
                                </div>
                            </div>
                            <i class="fa-solid fa-chevron-right text-slate-400 text-[10px]"></i>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    // Pied de page : Bouton pour ouvrir la vue complète dans la page
    html += `
        <div class="p-2.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
            <span class="text-slate-400">${matchingProjects.length} projet(s) • ${matchingTasks.length} tâche(s)</span>
            <button onclick="navigateView('projects'); closeSearchDropdown();" class="font-bold text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1">
                <span>Voir la vue complète</span>
                <i class="fa-solid fa-arrow-right text-[10px]"></i>
            </button>
        </div>
    `;

    dropdown.innerHTML = html;
    dropdown.classList.remove('hidden');
}

function closeSearchDropdown() {
    const dropdown = document.getElementById('search-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
}

function clearSearch() {
    state.searchQuery = '';
    const input = document.getElementById('global-search');
    if (input) input.value = '';
    const clearBtn = document.getElementById('search-clear-btn');
    if (clearBtn) clearBtn.classList.add('hidden');
    closeSearchDropdown();
    renderProjectsGrid();
}

function toggleDarkMode() {
    state.darkMode = !state.darkMode;
    localStorage.setItem('saas_dark_mode', state.darkMode);
    applyDarkMode(state.darkMode);
    showToast(state.darkMode ? 'Mode sombre activé 🌙' : 'Mode clair activé ☀️', 'info');
}

function applyDarkMode(isDark) {
    const html = document.documentElement;
    const icon = document.getElementById('dark-mode-icon');
    if (isDark) {
        html.classList.add('dark');
        if (icon) {
            icon.className = 'fa-solid fa-sun text-amber-400 text-sm';
        }
    } else {
        html.classList.remove('dark');
        if (icon) {
            icon.className = 'fa-solid fa-moon text-slate-500 text-sm';
        }
    }
}

// =========================================================================
// 12. RACCOURCIS CLAVIER GLOBAUX & FERMETURE CLIC EXTÉRIEUR
// =========================================================================
function initKeyboardShortcuts() {
    // Fermer le dropdown de recherche si on clique en dehors
    document.addEventListener('click', (e) => {
        const searchInput = document.getElementById('global-search');
        const dropdown = document.getElementById('search-dropdown');
        if (dropdown && !dropdown.classList.contains('hidden')) {
            if (searchInput && !searchInput.contains(e.target) && !dropdown.contains(e.target)) {
                closeSearchDropdown();
            }
        }
    });

    document.addEventListener('keydown', async (e) => {
        // Dans un champ de texte
        const tag = e.target.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') {
            if (e.key === 'Escape') {
                closeSearchDropdown();
                e.target.blur();
            }
            if (e.target.id === 'global-search' && e.key === 'Enter') {
                closeSearchDropdown();
                await navigateView('projects');
            }
            return;
        }

        // ⌘K ou Ctrl+K : focus recherche
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            const searchInput = document.getElementById('global-search');
            if (searchInput) {
                searchInput.focus();
                if (searchInput.value.trim().length > 0) {
                    handleGlobalSearch(searchInput.value);
                }
            }
        }

        // Touche 'Escape' pour fermer les modals et le dropdown
        if (e.key === 'Escape') {
            closeSearchDropdown();
            ['modal-project', 'modal-task', 'modal-user'].forEach(id => closeModal(id));
        }

        // Navigation rapide
        if (e.key === 'd' || e.key === 'D') navigateView('dashboard');
        if (e.key === 'p' || e.key === 'P') navigateView('projects');
        if (e.key === 'm' || e.key === 'M') navigateView('team');
    });
}

// =========================================================================
// 13. ÉTATS DE CHARGEMENT & ANIMATIONS
// =========================================================================
function showLoadingState(containerId, count = 3) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = Array.from({ length: count }).map(() => `
        <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
            <div class="flex items-center justify-between">
                <div class="w-10 h-10 skeleton rounded-xl"></div>
                <div class="w-16 h-4 skeleton rounded-lg"></div>
            </div>
            <div class="w-3/4 h-5 skeleton rounded-lg"></div>
            <div class="w-full h-12 skeleton rounded-xl"></div>
            <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between">
                <div class="w-20 h-4 skeleton rounded-lg"></div>
                <div class="w-24 h-4 skeleton rounded-lg"></div>
            </div>
        </div>
    `).join('');
}

function animateCount(elementId, targetValue, duration = 800) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const start = parseInt(el.textContent, 10) || 0;
    const diff = targetValue - start;
    if (diff === 0) {
        el.textContent = targetValue;
        return;
    }

    const startTime = performance.now();
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 3); // Ease-out cubic
        el.textContent = Math.round(start + diff * easeProgress);

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            el.textContent = targetValue;
        }
    }
    requestAnimationFrame(update);
}

// =========================================================================
// 14. UTILITAIRES MODALS, TOASTS & FORMATAGE
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
    if (!container) return;

    const toast = document.createElement('div');

    let bg = 'bg-slate-900 text-white border border-slate-700';
    let icon = '<i class="fa-solid fa-circle-info text-cyan-400"></i>';

    if (type === 'success') {
        bg = 'bg-emerald-950 text-emerald-100 border border-emerald-800';
        icon = '<i class="fa-solid fa-circle-check text-emerald-400"></i>';
    } else if (type === 'error') {
        bg = 'bg-rose-950 text-rose-100 border border-rose-800';
        icon = '<i class="fa-solid fa-circle-exclamation text-rose-400"></i>';
    }

    toast.className = `toast pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-xs font-semibold max-w-sm ${bg}`;
    toast.innerHTML = `
        <span class="text-sm">${icon}</span>
        <span class="flex-1">${escapeHtml(message)}</span>
        <button onclick="this.parentElement.remove()" class="text-slate-400 hover:text-white transition ml-2"><i class="fa-solid fa-xmark text-xs"></i></button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
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
