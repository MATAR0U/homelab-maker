/* -------------------------------------------------
   static/app.js
   ------------------------------------------------- */

// Nom de la clé où le token est stocké (doit être identique à celui du login.html)
const STORAGE_KEY = "homelab_jwt";

// Au chargement de la page, on récupère le token s’il existe
let JWT_TOKEN = localStorage.getItem(STORAGE_KEY) || "";

/* -------------------------------------------------
   Fonction utilitaire qui construit les en‑têtes
   ------------------------------------------------- */
function apiHeaders(extra = {}) {
    const hdr = {
        "Content-Type": "application/json",
        ...extra
    };
    if (JWT_TOKEN) {
        hdr["Authorization"] = `Bearer ${JWT_TOKEN}`;
    }
    return hdr;
}

/* -------------------------------------------------
   Fonction de connexion (appelée depuis le formulaire)
   ------------------------------------------------- */
async function login(username, password) {
    // Le formulaire de login envoie les données en x‑www‑form‑urlencoded
    const form = new URLSearchParams();
    form.append("username", username);
    form.append("password", password);

    const resp = await fetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form
    });

    if (!resp.ok) {
        const err = await resp.text();
        alert("Échec de la connexion : " + err);
        return false;
    }

    const data = await resp.json();               // {access_token, token_type}
    JWT_TOKEN = data.access_token;                // mémorise le token en mémoire
    localStorage.setItem(STORAGE_KEY, JWT_TOKEN); // persiste le token

    // Redirection vers la page d’accueil (le tableau)
    window.location.href = "/";
    return true;
}

/* -------------------------------------------------
   Gestion du formulaire de login (si vous avez
   un formulaire HTML natif dans /login)
   ------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.querySelector("form[action='/login']");
    if (loginForm) {
        loginForm.addEventListener("submit", async ev => {
            ev.preventDefault();
            const username = ev.target.username.value;
            const password = ev.target.password.value;
            await login(username, password);
        });
    }
});

/* -------------------------------------------------
   Reste du code (affichage du tableau, actions,
   rafraîchissement automatique)
   ------------------------------------------------- */
const REFRESH_INTERVAL_MS = 1000;   // 1 s

function renderContainers(list) {
    const tbody = document.querySelector('#containers tbody');
    tbody.innerHTML = '';

    list.forEach(c => {
        const tr = document.createElement('tr');

        // ID, Nom, Status
        tr.innerHTML = `
            <td>${c.id}</td>
            <td>${c.name}</td>
            <td>${c.status}</td>
        `;

        // ---------- MENU DÉROULANT ----------
        const select = document.createElement('select');
        select.innerHTML = `
            <option value="">— Action —</option>
            <option value="start">Démarrer</option>
            <option value="stop">Arrêter</option>
            <option value="restart">Redémarrer</option>
            <option value="remove">Supprimer</option>
        `;

        // Désactiver les actions impossibles selon le statut
        if (c.status === "running") {
            select.querySelector('option[value="start"]').disabled = true;
        } else {
            select.querySelector('option[value="stop"]').disabled = true;
            select.querySelector('option[value="restart"]').disabled = true;
        }

        // Gestion du choix
        select.addEventListener('change', async ev => {
            const action = ev.target.value;
            if (!action) return;   // placeholder
            const confirmed = confirm(`Voulez‑vous vraiment ${action} le conteneur ${c.name} (${c.id}) ?`);
            if (!confirmed) {
                ev.target.value = "";
                return;
            }
            await performAction(c.id, action);
            ev.target.value = "";
        });

        const tdAction = document.createElement('td');
        tdAction.appendChild(select);
        tr.appendChild(tdAction);

        tbody.appendChild(tr);
    });
}

// ---------- Appel API pour la liste ----------
async function fetchContainers() {
    try {
        const resp = await fetch('/containers', { headers: apiHeaders() });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        renderContainers(data);
    } catch (e) {
        console.error('Erreur API :', e);
    }
}

// ---------- POST action ----------
async function performAction(containerId, action) {
    try {
        const resp = await fetch(`/containers/${containerId}/action`, {
            method: 'POST',
            headers: apiHeaders(),
            body: JSON.stringify({ action })
        });
        if (!resp.ok) {
            const err = await resp.json();
            alert(`Erreur : ${err.detail || resp.statusText}`);
            return;
        }
        await fetchContainers();   // rafraîchir la liste
    } catch (e) {
        console.error('Erreur action :', e);
        alert('Impossible d’effectuer l’action : ' + e);
    }
}

// ---------- Bind du bouton ----------
document.getElementById('refresh').addEventListener('click', fetchContainers);

// ---------- Chargement initial ----------
fetchContainers();

// ---------- Rafraîchissement automatique ----------
setInterval(fetchContainers, REFRESH_INTERVAL_MS);