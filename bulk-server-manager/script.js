let selectedServers = new Set();
let isExecuting = false;
let executionProgress = 0;
let executionTotal = 0;
let currentExecutionAction = '';

function getStatusColor(status) {
    switch (status) {
        case 'running': return 'var(--accent-success)';
        case 'starting': return '#f59e0b';
        case 'stopping': return '#f59e0b';
        case 'offline': return 'var(--accent-error)';
        default: return 'var(--text-tertiary)';
    }
}

window.__bsmToggleSelection = (serverId) => {
    if (isExecuting) return;
    if (selectedServers.has(serverId)) {
        selectedServers.delete(serverId);
    } else {
        selectedServers.add(serverId);
    }
    BananaAPI.refreshDashboard();
};

window.__bsmClearSelection = () => {
    if (isExecuting) return;
    selectedServers.clear();
    BananaAPI.refreshDashboard();
};

window.__bsmExecuteBulkAction = async (action) => {
    if (isExecuting || selectedServers.size === 0) return;

    const actionLabels = { start: 'Start', stop: 'Stop', restart: 'Restart' };
    const label = actionLabels[action] || action;

    BananaAPI.openConfirmModal(
        `${label} ${selectedServers.size} Servers`,
        `Are you sure you want to <b>${label.toLowerCase()}</b> ${selectedServers.size} selected servers?<br><br><small style="color:var(--text-tertiary)">Actions will be staggered with a 5s delay between servers.</small>`,
        async () => {
            isExecuting = true;
            executionProgress = 0;
            executionTotal = selectedServers.size;
            currentExecutionAction = label;
            BananaAPI.refreshDashboard();

            let success = 0;
            let failed = 0;
            let list = Array.from(selectedServers);

            for (let i = 0; i < list.length; i++) {
                const serverId = list[i];
                executionProgress = i;
                BananaAPI.refreshDashboard();

                try {
                    const state = BananaAPI.getState();
                    let identifier = state.serverDetailsCache?.[serverId]?.data?.identifier;

                    if (!identifier) {
                        const controlServer = BananaAPI.getServers().find(s => s.attributes?.id == serverId || s.attributes?.identifier === serverId);
                        identifier = controlServer?.attributes?.identifier;
                    }

                    if (!identifier) {
                        BananaAPI.log('ERROR', `[BSM] Could not resolve identifier for server ID: ${serverId}`);
                        failed++;
                    } else {
                        const token = localStorage.getItem('token');
                        const response = await BananaAPI.proxyFetch(`https://control.bot-hosting.net/api/client/servers/${identifier}/power`, {
                            method: 'POST',
                            body: JSON.stringify({ signal: action }),
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            }
                        });

                        if (response && response.ok) {
                            success++;
                        } else {
                            BananaAPI.log('ERROR', `[BSM] Failed action for ${serverId}:`, response?.data || response?.statusText || 'Unknown error');
                            failed++;
                        }
                    }
                } catch (e) {
                    BananaAPI.log('ERROR', `[BSM] Exception during action for ${serverId}:`, e);
                    failed++;
                }

                if (i < list.length - 1) {
                    await new Promise(r => setTimeout(r, 5000));
                }
            }

            isExecuting = false;
            selectedServers.clear();
            BananaAPI.refreshDashboard();

            if (failed > 0) {
                if (success === 0) {
                    BananaAPI.showToast(`Bulk ${label} failed for all ${failed} servers. Check console.`, 'error');
                } else {
                    BananaAPI.showToast(`Bulk ${label}: ${success} success, ${failed} failed.`, 'error');
                }
            } else {
                BananaAPI.showToast(`Bulk ${label} completed for ${success} servers!`, 'success');
            }
        },
        label, action === 'stop'
    );
};

function handleGlobalClick(e) {
    if (BananaAPI.getState().currentView !== 'manage') return;

    const card = e.target.closest('.server-card');
    if (card && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        e.stopPropagation();
        const serverId = card.getAttribute('data-server-id');
        if (serverId) {
            window.__bsmToggleSelection(serverId);
        }
    }
}

return {
    init(api) {
        document.addEventListener('click', handleGlobalClick, true);

        api.addModuleHeaderInjection('manage', () => {
            if (selectedServers.size === 0 && !isExecuting) return '';

            if (isExecuting) {
                const percent = Math.round((executionProgress / executionTotal) * 100);
                return `
                    <div class="bsm-action-bar" style="background: var(--bg-tertiary); padding: 1rem; border-bottom: 1px solid var(--border-light); display: flex; align-items: center; gap: 1rem; animation: slideDown 0.3s ease;">
                        <div style="position: relative; width: 40px; height: 40px; flex-shrink: 0;">
                            <svg viewBox="0 0 36 36" style="width: 100%; height: 100%; transform: rotate(-90deg);">
                                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="var(--border-light)" stroke-width="3" />
                                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="var(--accent-primary)" stroke-width="3" stroke-dasharray="${percent}, 100" style="transition: stroke-dasharray 0.3s ease;" />
                            </svg>
                            <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: bold;">${percent}%</div>
                        </div>
                        <div style="flex: 1;">
                            <div style="font-weight: bold; font-size: 0.9rem;">Executing Bulk ${currentExecutionAction}...</div>
                            <div style="font-size: 0.75rem; color: var(--text-tertiary);">Processing server ${executionProgress + 1} of ${executionTotal}</div>
                        </div>
                    </div>`;
            }

            return `
                <div class="bsm-action-bar" style="background: var(--bg-tertiary); padding: 1rem 1.5rem; border-bottom: 1px solid var(--border-light); display: flex; align-items: center; justify-content: space-between; animation: slideDown 0.3s ease; gap: 1rem;">
                    <div style="display: flex; align-items: center; gap: 1rem; min-width: 0;">
                        <span style="font-weight: 700; color: var(--accent-primary); font-size: 0.9rem; white-space: nowrap;">
                            <i class="fas fa-check-square"></i> ${selectedServers.size} Selected
                        </span>
                        <div style="width: 1px; height: 16px; background: var(--border-light);"></div>
                        <button class="btn btn-sm btn-outline" onclick="window.__bsmClearSelection()" 
                                style="padding: 4px 12px; font-size: 0.75rem; height: 28px; line-height: 1; border-radius: 6px; display: flex; align-items: center; gap: 0.4rem; white-space: nowrap;">
                            <i class="fas fa-times-circle" style="font-size: 0.8rem; opacity: 0.7;"></i> Deselect All
                        </button>
                    </div>
                    <div style="display: flex; gap: 0.5rem; flex-shrink: 0;">
                        <button class="btn btn-sm" onclick="window.__bsmExecuteBulkAction('start')" style="background: var(--accent-success); color: white; border: none; padding: 0 15px; height: 32px; border-radius: 6px; font-weight: 600; font-size: 0.8rem; cursor: pointer; display: flex; align-items: center; gap: 0.4rem; transition: filter 0.2s;" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
                            <i class="fas fa-play" style="font-size: 0.7rem;"></i> Start
                        </button>
                        <button class="btn btn-sm" onclick="window.__bsmExecuteBulkAction('restart')" style="background: var(--accent-primary); color: white; border: none; padding: 0 15px; height: 32px; border-radius: 6px; font-weight: 600; font-size: 0.8rem; cursor: pointer; display: flex; align-items: center; gap: 0.4rem; transition: filter 0.2s;" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
                            <i class="fas fa-redo" style="font-size: 0.7rem;"></i> Restart
                        </button>
                        <button class="btn btn-sm" onclick="window.__bsmExecuteBulkAction('stop')" style="background: var(--accent-error); color: white; border: none; padding: 0 15px; height: 32px; border-radius: 6px; font-weight: 600; font-size: 0.8rem; cursor: pointer; display: flex; align-items: center; gap: 0.4rem; transition: filter 0.2s;" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
                            <i class="fas fa-stop" style="font-size: 0.7rem;"></i> Stop
                        </button>
                    </div>
                </div>`;
        });

        api.addServerCardInjection((server) => {
            const serverId = server.serverid;
            const isSelected = selectedServers.has(serverId);
            if (!isSelected && !isExecuting) return '';

            return `
                ${isSelected ? `
                <div class="bsm-selection-overlay" style="position: absolute; inset: 0; border: 2px solid var(--accent-primary); pointer-events: none; border-radius: var(--border-radius, 12px); z-index: 5;">
                    <div style="position: absolute; inset: 0; background: var(--accent-primary); opacity: 0.1; border-radius: inherit;"></div>
                </div>` : ''}
                ${isExecuting ? '<div class="bsm-executing-overlay" style="position: absolute; inset: 0; background: rgba(0,0,0,0.1); cursor: wait; z-index: 20; border-radius: var(--border-radius, 12px);"></div>' : ''}
            `;
        });

        api.addServerContextMenuItems((serverId) => {
            const isSelected = selectedServers.has(serverId);
            return [{
                label: isSelected ? 'Deselect Server' : 'Select Server',
                icon: isSelected ? 'fas fa-minus-square' : 'fas fa-check-square',
                onClick: () => window.__bsmToggleSelection(serverId)
            }];
        });

        const style = document.createElement('style');
        style.id = 'bsm-interaction-lock';
        style.innerHTML = `
            .server-card .server-actions button { transition: opacity 0.3s ease; }
            ${isExecuting ? '.server-card .server-actions button { opacity: 0.5; pointer-events: none; filter: grayscale(1); }' : ''}
        `;
        document.head.appendChild(style);

        api.on('dashboardRendered', () => {
            const style = document.getElementById('bsm-interaction-lock');
            if (style) {
                style.innerHTML = `
                    .server-card .server-actions button { transition: opacity 0.3s ease; }
                    ${isExecuting ? '.server-card .server-actions button { opacity: 0.5; pointer-events: none; filter: grayscale(1); }' : ''}
                `;
            }
        });
    },
    destroy() {
        document.removeEventListener('click', handleGlobalClick, true);
        const style = document.getElementById('bsm-interaction-lock');
        if (style) style.remove();
        delete window.__bsmToggleSelection;
        delete window.__bsmClearSelection;
        delete window.__bsmExecuteBulkAction;
        selectedServers.clear();
        BananaAPI.refreshDashboard();
    }
};
