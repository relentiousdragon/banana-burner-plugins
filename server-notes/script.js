function getNotes() {
    return BananaAPI.storage.getJSON('notes', {});
}

function saveNotes(notes) {
    BananaAPI.storage.set('notes', notes);
}

window.__snAddNote = (serverId, serverName) => {
    const existingNotes = getNotes()[serverId] || [];
    const lastNote = existingNotes.length > 0 ? existingNotes[existingNotes.length - 1].text : '';

    const modal = document.createElement('div');
    modal.className = 'bananaa-modal';
    modal.innerHTML = `
        <div class="modal-overlay" onclick="this.parentElement.remove()"></div>
        <div class="modal-container" style="max-width: 480px;">
            <div class="modal-header">
                <h2 style="display: flex; align-items: center; gap: 0.5rem; margin: 0;">
                    <i class="fas fa-sticky-note" style="color: #fbbf24;"></i> 
                    ${lastNote ? 'Edit' : 'Add'} Note for ${serverName}
                </h2>
                <button class="modal-close" onclick="this.closest('.bananaa-modal').remove()" style="background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: 1.2rem; padding: 4px;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body" style="padding: 1.5rem;">
                <textarea id="sn-note-input" placeholder="Write your note here..." 
                          style="width: 100%; min-height: 120px; padding: 0.75rem; border: 1px solid var(--border-light); border-radius: 8px; background: var(--bg-primary); color: var(--text-primary); font-family: inherit; font-size: 0.9rem; resize: vertical; box-sizing: border-box; outline: none; transition: border-color 0.2s ease;"
                          onfocus="this.style.borderColor='var(--accent-primary)'"
                          onblur="this.style.borderColor='var(--border-light)'"
                          autofocus>${lastNote}</textarea>
                <p style="font-size: 0.75rem; color: var(--text-tertiary); margin-top: 0.5rem;">Tip: Use Ctrl+Enter to save quickly.</p>
            </div>
            <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 0.75rem; padding: 1rem 1.5rem; border-top: 1px solid var(--border-light);">
                <button class="btn btn-outline" onclick="this.closest('.bananaa-modal').remove()" 
                        style="padding: 0.6rem 1.25rem; border-radius: 8px; cursor: pointer;">Cancel</button>
                <button class="btn btn-primary" id="sn-save-btn"
                        style="padding: 0.6rem 1.25rem; border-radius: 8px; cursor: pointer; background: #fbbf24; color: #1a1a2e; border: none; font-weight: 600;"
                        onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
                    <i class="fas fa-save" style="margin-right: 0.3rem;"></i> Save Note
                </button>
            </div>
        </div>`;

    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('visible'), 50);

    const input = modal.querySelector('#sn-note-input');
    const saveBtn = modal.querySelector('#sn-save-btn');

    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    const save = () => {
        const text = input.value.trim();
        const notes = getNotes();
        if (!text) {
            delete notes[serverId];
        } else {
            notes[serverId] = [{ text, created: Date.now() }];
        }
        saveNotes(notes);
        modal.remove();
        BananaAPI.refreshDashboard();
        BananaAPI.showToast('Note updated!', 'success');
    };

    saveBtn.onclick = save;
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save();
    });
};

window.__snDeleteNote = (serverId) => {
    const notes = getNotes();
    if (notes[serverId]) {
        delete notes[serverId];
        saveNotes(notes);
        BananaAPI.refreshDashboard();
        BananaAPI.showToast('Note deleted', 'info');
    }
};

return {
    init(api) {
        api.addServerCardInjection((server) => {
            const serverId = server.serverid;
            const notes = getNotes();
            const serverNotes = notes[serverId];
            if (!serverNotes || serverNotes.length === 0) return '';

            const lastNote = serverNotes[serverNotes.length - 1];
            const maxLength = 60;
            const text = lastNote.text.length > maxLength
                ? lastNote.text.substring(0, maxLength) + '...'
                : lastNote.text;

            return `
                <div class="info-item sn-card-note" style="margin-top: 4px; padding-top: 4px; border-top: 1px dashed var(--border-light); cursor: help;" title="${lastNote.text.replace(/"/g, '&quot;')}">
                    <i class="fas fa-sticky-note" style="color: #fbbf24; font-size: 0.75rem; margin-right: 6px;"></i>
                    <span style="font-size: 0.8rem; font-style: italic; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${text}</span>
                </div>`;
        });

        api.addServerContextMenuItems((serverId) => {
            const servers = api.getServers();
            const server = servers.find(s => (s.attributes?.identifier === serverId || (s.attributes || s).id == serverId));
            const serverName = server ? (server.attributes?.name || server.name) : 'Server';
            const hasNote = !!getNotes()[serverId];

            return [
                {
                    label: hasNote ? 'Edit Note' : 'Add Note',
                    icon: 'fas fa-sticky-note',
                    onClick: () => window.__snAddNote(serverId, serverName.replace(/'/g, "\\'"))
                },
                hasNote ? {
                    label: 'Delete Note',
                    icon: 'fas fa-trash',
                    isDanger: true,
                    onClick: () => BananaAPI.openConfirmModal('Delete Note', 'Clear note for this server?', () => window.__snDeleteNote(serverId), 'Delete', true)
                } : null
            ].filter(Boolean);
        });
    },
    destroy() {
        delete window.__snAddNote;
        delete window.__snDeleteNote;
        BananaAPI.refreshDashboard();
    }
};
