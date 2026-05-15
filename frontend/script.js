const API_BASE_URL =
  window.APP_CONFIG?.API_BASE_URL || "http://127.0.0.1:5000/api";

const authCard = document.getElementById("authCard");
const crmSection = document.getElementById("crmSection");
const loginForm = document.getElementById("loginForm");
const leadForm = document.getElementById("leadForm");
const leadList = document.getElementById("leadList");
const logoutBtn = document.getElementById("logoutBtn");
const searchInput = document.getElementById("searchInput");
const filterStatus = document.getElementById("filterStatus");
const filterSource = document.getElementById("filterSource");
const editModal = document.getElementById("editModal");
const closeEditModalBtn = document.getElementById("closeEditModalBtn");
const editLeadForm = document.getElementById("editLeadForm");
const editLeadId = document.getElementById("editLeadId");
const editLeadName = document.getElementById("editLeadName");
const editLeadEmail = document.getElementById("editLeadEmail");
const editLeadSource = document.getElementById("editLeadSource");
const editLeadStatus = document.getElementById("editLeadStatus");

let token = localStorage.getItem("crm_token") || "";

const api = async (path, options = {}) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }
  return data;
};

const showApp = () => {
  authCard.classList.add("hidden");
  crmSection.classList.remove("hidden");
};

const showLogin = () => {
  crmSection.classList.add("hidden");
  authCard.classList.remove("hidden");
};

const formatDate = (value) => {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
};

const openEditModal = (lead) => {
  editLeadId.value = lead._id;
  editLeadName.value = lead.name;
  editLeadEmail.value = lead.email;
  editLeadSource.value = lead.source;
  editLeadStatus.value = lead.status;
  editModal.classList.remove("hidden");
  editModal.setAttribute("aria-hidden", "false");
};

const closeEditModal = () => {
  editLeadForm.reset();
  editLeadId.value = "";
  editModal.classList.add("hidden");
  editModal.setAttribute("aria-hidden", "true");
};

const renderLeads = (leads) => {
  if (!leads.length) {
    leadList.innerHTML = "<p class='small'>No leads yet. Add your first lead.</p>";
    return;
  }

  leadList.innerHTML = leads
    .map((lead) => {
      const notesHtml = lead.notes.length
        ? lead.notes
            .map(
              (note) => `
                <div class="note-item">
                  <div>${note.content}</div>
                  <div class="note-date">Follow-up: ${formatDate(
                    note.followUpDate
                  )} | Added: ${formatDate(note.createdAt)}</div>
                </div>
              `
            )
            .join("")
        : "<p class='small'>No notes added.</p>";

      return `
        <article class="lead-item">
          <div class="lead-top">
            <strong>${lead.name}</strong>
            <span class="status-badge status-${lead.status}">${lead.status}</span>
          </div>
          <div class="lead-meta">
            ${lead.email} | Source: ${lead.source}
          </div>
          <div class="form-grid">
            <select data-status-id="${lead._id}">
              <option value="new" ${lead.status === "new" ? "selected" : ""}>New</option>
              <option value="contacted" ${lead.status === "contacted" ? "selected" : ""}>Contacted</option>
              <option value="converted" ${lead.status === "converted" ? "selected" : ""}>Converted</option>
            </select>
          </div>
          <div class="actions">
            <button data-edit-btn="${lead._id}" type="button" class="secondary">Edit Lead</button>
            <button data-delete-btn="${lead._id}" type="button" class="danger">Delete Lead</button>
          </div>
          <div class="note-form">
            <textarea data-note-content="${lead._id}" rows="2" placeholder="Add note / follow-up details"></textarea>
            <input data-note-date="${lead._id}" type="date" />
            <button data-note-btn="${lead._id}" type="button">Add Note</button>
          </div>
          <div style="margin-top: 10px;">
            <strong>Notes:</strong>
            ${notesHtml}
          </div>
        </article>
      `;
    })
    .join("");

  document.querySelectorAll("[data-status-id]").forEach((select) => {
    select.addEventListener("change", async (event) => {
      const leadId = event.target.getAttribute("data-status-id");
      const status = event.target.value;
      try {
        await api(`/leads/${leadId}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        });
        await loadLeads();
      } catch (error) {
        alert(error.message);
      }
    });
  });

  document.querySelectorAll("[data-note-btn]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      const leadId = event.target.getAttribute("data-note-btn");
      const noteContent = document.querySelector(`[data-note-content="${leadId}"]`).value;
      const followUpDate = document.querySelector(`[data-note-date="${leadId}"]`).value;

      if (!noteContent.trim()) {
        alert("Please enter note content.");
        return;
      }

      try {
        await api(`/leads/${leadId}/notes`, {
          method: "POST",
          body: JSON.stringify({
            content: noteContent.trim(),
            followUpDate: followUpDate || null,
          }),
        });
        await loadLeads();
      } catch (error) {
        alert(error.message);
      }
    });
  });

  document.querySelectorAll("[data-edit-btn]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const leadId = event.target.getAttribute("data-edit-btn");
      const lead = leads.find((item) => item._id === leadId);
      if (!lead) return;
      openEditModal(lead);
    });
  });

  document.querySelectorAll("[data-delete-btn]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      const leadId = event.target.getAttribute("data-delete-btn");
      const confirmed = confirm("Delete this lead permanently?");
      if (!confirmed) return;

      try {
        await api(`/leads/${leadId}`, { method: "DELETE" });
        await loadLeads();
      } catch (error) {
        alert(error.message);
      }
    });
  });
};

const loadLeads = async () => {
  try {
    const params = new URLSearchParams();
    const searchValue = searchInput.value.trim();
    const statusValue = filterStatus.value;
    const sourceValue = filterSource.value.trim();

    if (searchValue) params.set("search", searchValue);
    if (statusValue) params.set("status", statusValue);
    if (sourceValue) params.set("source", sourceValue);

    const query = params.toString();
    const leads = await api(`/leads${query ? `?${query}` : ""}`);
    renderLeads(leads);
  } catch (error) {
    if (error.message.toLowerCase().includes("unauthorized")) {
      logout();
      return;
    }
    alert(error.message);
  }
};

const logout = () => {
  token = "";
  localStorage.removeItem("crm_token");
  showLogin();
};

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  try {
    const data = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    token = data.token;
    localStorage.setItem("crm_token", token);
    showApp();
    await loadLeads();
  } catch (error) {
    alert(error.message);
  }
});

leadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = document.getElementById("leadName").value.trim();
  const email = document.getElementById("leadEmail").value.trim();
  const source = document.getElementById("leadSource").value.trim();
  const status = document.getElementById("leadStatus").value;

  try {
    await api("/leads", {
      method: "POST",
      body: JSON.stringify({ name, email, source, status }),
    });
    leadForm.reset();
    document.getElementById("leadStatus").value = "new";
    await loadLeads();
  } catch (error) {
    alert(error.message);
  }
});

logoutBtn.addEventListener("click", logout);
searchInput.addEventListener("input", loadLeads);
filterStatus.addEventListener("change", loadLeads);
filterSource.addEventListener("input", loadLeads);
closeEditModalBtn.addEventListener("click", closeEditModal);

editModal.addEventListener("click", (event) => {
  if (event.target === editModal) {
    closeEditModal();
  }
});

editLeadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const leadId = editLeadId.value;

  try {
    await api(`/leads/${leadId}`, {
      method: "PUT",
      body: JSON.stringify({
        name: editLeadName.value.trim(),
        email: editLeadEmail.value.trim(),
        source: editLeadSource.value.trim(),
        status: editLeadStatus.value,
      }),
    });
    closeEditModal();
    await loadLeads();
  } catch (error) {
    alert(error.message);
  }
});

if (token) {
  showApp();
  loadLeads();
} else {
  showLogin();
}
