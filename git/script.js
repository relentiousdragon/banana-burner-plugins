// author: @paccman_0 on Discord.
const PLUGIN_ID = 'git';
const SIGNATURE = '# BananaBurner Git Plugin';
const DESCRIPTION = '# This file is managed by the Git plugin. Manual edits may break synchronization.';
const VERSION = '1.3';

let currentServerId = null;
let pluginApi = null;
let isSettingUp = false;

function getIdentifier(api, serverId) {
    const details = api.getDetails(serverId);
    const sid = details?.identifier || details?.attributes?.identifier || serverId;
    return sid;
}

function parseConfigFromScript(content) {
    const repoMatch = content.match(/REPO_NAME="([^"]+)"/);
    const userMatch = content.match(/GITHUB_USER="([^"]+)"/);
    const branchMatch = content.match(/BRANCH="([^"]+)"/);
    const patMatch = content.match(/GITHUB_PAT="([^"]+)"/);

    if (repoMatch && userMatch) {
        return {
            repo: `${userMatch[1]}/${repoMatch[1]}`,
            branch: branchMatch ? branchMatch[1] : 'main',
            pat: patMatch ? patMatch[1] : ''
        };
    }
    return null;
}


async function checkGitSetup(api, serverId) {
    try {
        const sid = getIdentifier(api, serverId);
        const content = await api.getFileContents(sid, '/bb-github.sh');
        if (!content) return false;

        const isValid = content.includes(SIGNATURE) && content.includes(DESCRIPTION);

        if (isValid && !api.storage.get(`setup-${serverId}`)) {
            const recovered = parseConfigFromScript(content);
            if (recovered) {
                api.storage.set(`config-${serverId}`, recovered);
                api.storage.set(`setup-${serverId}`, 'true');
            }
        }

        return isValid;
    } catch (e) {
        if (api.CONFIG.DEBUG) api.log('ERROR', `Git: Setup check failed: ${e.message}`);
        return false;
    }
}

async function checkConsoleSetup(api, serverId) {
    if (api.storage.get(`console-setup-${serverId}`) === 'true') return true;
    try {
        const sid = getIdentifier(api, serverId);
        const content = await api.getFileContents(sid, '/banana-burner.js');
        if (content && content.includes('// GIT COMMAND HANDLER')) {
            api.storage.set(`console-setup-${serverId}`, 'true');
            return true;
        }
    } catch (e) { }
    return false;
}

function renderPanel(api, serverId) {
    currentServerId = serverId;
    return `
        <div id="git-panel-content" style="padding: 1.25rem;">
            <div class="git-status-loading">
                <i class="fas fa-spinner fa-spin"></i> Checking status...
            </div>
        </div>
    `;
}

window.__git_checkSetup = async (serverId) => {
    return await checkGitSetup(pluginApi, serverId);
};

window.__git_renderStatus = (serverId, isSetup, isConsoleSetup) => {
    const container = document.getElementById('git-panel-content');
    if (!container) return;

    if (!isSetup) {
        if (isSettingUp) {
            container.innerHTML = `
                <div style="text-align: center; padding: 2rem 1rem;">
                    <i class="fas fa-spinner fa-spin" style="font-size: 3rem; color: var(--accent-primary); margin-bottom: 1rem;"></i>
                    <h3 style="margin: 0 0 0.5rem 0;">Setting up Git...</h3>
                    <p style="color: var(--text-secondary); font-size: 0.9rem;">Please wait...</p>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div style="text-align: center; padding: 2rem 1rem;">
                    <i class="fab fa-github" style="font-size: 3rem; color: var(--text-tertiary); margin-bottom: 1rem;"></i>
                    <h3 style="margin: 0 0 0.5rem 0;">GitHub Not Connected</h3>
                    <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1.5rem;">Connect this server to a GitHub repository to enable auto-sync and console commands.</p>
                    <button class="btn btn-primary" onclick="window.__git_openSetupModal('${serverId}')" style="padding: 0.6rem 2rem;">Setup Repository</button>
                </div>
            `;
        }
    } else {
        const config = BananaAPI.storage.getJSON(`config-${serverId}`, {});
        container.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 1rem;">
                <div style="background: var(--bg-tertiary); padding: 1rem; border-radius: 8px; border: 1px solid var(--border-light);">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
                        <span style="font-weight: 600; font-size: 0.9rem;">Repository</span>
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="btn btn-secondary" onclick="window.__git_openSetupModal('${serverId}')" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;">Edit</button>
                            <button class="btn btn-danger" onclick="window.__git_disconnect('${serverId}')" style="padding: 0.3rem 0.6rem; font-size: 0.75rem; background: var(--accent-error); color: white;">Disconnect</button>
                        </div>
                    </div>
                    <div class="notranslate" style="color: var(--text-secondary); font-size: 0.85rem; word-break: break-all;">
                        <i class="fas fa-code-branch" style="margin-right: 0.5rem;"></i> ${config.repo} (${config.branch})
                    </div>
                </div>

                <div style="background: var(--bg-tertiary); padding: 1rem; border-radius: 8px; border: 1px solid var(--border-light);">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
                        <span style="font-weight: 600; font-size: 0.9rem;">Console Commands</span>
                    </div>
                    <p style="color: var(--text-secondary); font-size: 0.8rem; margin-bottom: 1rem;">Inject git command handling into the Banana Agent to run git commands from the console.</p>
                    ${!BananaAPI.isNodeServer(BananaAPI.getDetails(serverId)) ? `
                        <div style="position: relative;">
                            <button class="btn btn-primary disabled" style="width: 100%; padding: 0.6rem; font-size: 0.85rem; opacity: 0.5; cursor: not-allowed;">Setup Console Commands</button>
                            <div class="banana-tooltip" style="opacity: 1; visibility: visible; transform: translateX(-50%) translateY(0); bottom: calc(100% + 10px);">Node.js Only</div>
                        </div>
                    ` : isConsoleSetup ? `
                        <button class="btn btn-secondary disabled" style="width: 100%; padding: 0.6rem; font-size: 0.85rem; opacity: 0.7; cursor: default;">
                            <i class="fas fa-check" style="margin-right: 0.5rem;"></i> Console Commands Ready
                        </button>
                    ` : `
                        <button id="banana-git-setup-btn" class="btn btn-primary" onclick="window.__git_setupConsoleCommands('${serverId}')" style="width: 100%; padding: 0.6rem; font-size: 0.85rem;">Setup Console Commands</button>
                    `}
                </div>
            </div>
        `;
    }
};

window.__git_openSetupModal = (serverId) => {
    if (isSettingUp) {
        BananaAPI.showToast('Setup is already in progress', 'warning');
        return;
    }
    const config = BananaAPI.storage.getJSON(`config-${serverId}`, { repo: '', branch: 'main', pat: '' });

    BananaAPI.openConfirmModal(
        'Setup GitHub Repository',
        `
        <div style="text-align: left; display: flex; flex-direction: column; gap: 1rem;">
            <div>
                <label style="display: block; font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.4rem;">Repository (e.g. username/repo)</label>
                <input type="text" id="git-repo" class="modern-input notranslate" style="width: 100%;" value="${config.repo}" placeholder="DevSeige-Studios/WaterfallBot">
            </div>
            <div>
                <label style="display: block; font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.4rem;">Branch</label>
                <input type="text" id="git-branch" class="modern-input notranslate" style="width: 100%;" value="${config.branch}" placeholder="main">
            </div>
            <div>
                <label style="display: block; font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.4rem;">Personal Access Token (Optional)</label>
                <input type="password" id="git-pat" class="modern-input" style="width: 100%;" value="${config.pat}" placeholder="ghp_...">
            </div>
        </div>
        `,
        async () => {
            const repo = document.getElementById('git-repo').value.trim();
            const branch = document.getElementById('git-branch').value.trim() || 'main';
            const pat = document.getElementById('git-pat').value.trim();

            if (!repo) {
                BananaAPI.showToast('Repository name is required', 'error');
                return;
            }

            const modal = document.querySelector('.bananaa-modal.visible');
            const confirmBtn = modal?.querySelector('.btn-confirm');
            if (confirmBtn) {
                confirmBtn.disabled = true;
                confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            }

            isSettingUp = true;
            window.__git_renderStatus(serverId, false, false);
            BananaAPI.showToast('Setting up git...', 'info');

            try {
                const success = await window.__git_saveConfig(serverId, { repo, branch, pat });
                if (success) {
                    BananaAPI.storage.set(`config-${serverId}`, { repo, branch, pat });
                    BananaAPI.storage.set(`setup-${serverId}`, 'true');

                    const isConsoleSetup = await checkConsoleSetup(BananaAPI, serverId);
                    window.__git_renderStatus(serverId, true, isConsoleSetup);

                    BananaAPI.refreshDashboard();
                    BananaAPI.showToast('Git setup complete!', 'success');
                } else {
                    window.__git_renderStatus(serverId, false, false);
                }
            } catch (e) {
                console.error('Git setup error:', e);
                window.__git_renderStatus(serverId, false, false);
            } finally {
                isSettingUp = false;
            }
        },
        'Save Settings'
    );
};

window.__git_saveConfig = async (serverId, config) => {
    const user = config.repo.split('/')[0];
    const repoName = config.repo.split('/')[1];

    const sid = getIdentifier(BananaAPI, serverId);
    let entryPoint = 'index.js';
    let runtime = 'node';

    try {
        const startupRes = await BananaAPI.proxyFetch(`https://control.bot-hosting.net/api/client/servers/${sid}/startup`, {
            method: 'GET',
            headers: BananaAPI.getControlPanelHeaders()
        });

        if (startupRes && startupRes.data) {
            const vars = startupRes.data.data || [];
            const details = BananaAPI.getDetails(serverId);
            if (BananaAPI.isPythonServer(details)) {
                const pyVar = vars.find(v => ['BOT_PY_FILE', 'START_PY_FILE'].includes(v.attributes?.env_variable));
                entryPoint = pyVar?.attributes?.server_value || pyVar?.attributes?.default_value || 'main.py';
                runtime = 'python3';
            } else {
                const jsVar = vars.find(v => ['BOT_JS_FILE', 'START_JS_FILE', 'MAIN_FILE'].includes(v.attributes?.env_variable));
                entryPoint = jsVar?.attributes?.server_value || jsVar?.attributes?.default_value || 'index.js';
                runtime = 'node';
            }
        }
    } catch (e) {
        console.warn('Git: Failed to fetch startup variables, using fallback detection', e);
        const details = BananaAPI.getDetails(serverId);
        const attrs = details?.attributes || details || {};
        if (BananaAPI.isPythonServer(details)) {
            entryPoint = attrs.startup?.BOT_PY_FILE || attrs.BOT_PY_FILE || attrs.startup?.START_PY_FILE || attrs.START_PY_FILE || 'main.py';
            runtime = 'python3';
        } else {
            entryPoint = attrs.startup?.BOT_JS_FILE || attrs.BOT_JS_FILE || attrs.startup?.START_JS_FILE || attrs.START_JS_FILE || attrs.startup_command?.match(/node\s+([^\s]+)/)?.[1] || 'index.js';
            runtime = 'node';
        }
    }

    const shellScript = `#!/bin/bash
${SIGNATURE}
${DESCRIPTION}
# v${VERSION}

export GIT_TERMINAL_PROMPT=0
git config --global init.defaultBranch main
GITHUB_USER="${user}"
GITHUB_PAT="${config.pat}"
REPO_NAME="${repoName}"
BRANCH="${config.branch}" 
ENTRY_POINT="${entryPoint}"

cd "$(dirname "$0")" || exit

if [ -n "$GITHUB_PAT" ]; then
    REMOTE_URL="https://\${GITHUB_USER}:\${GITHUB_PAT}@github.com/\${GITHUB_USER}/\${REPO_NAME}.git"
else
    REMOTE_URL="https://github.com/\${GITHUB_USER}/\${REPO_NAME}.git"
fi

echo "Branch: $BRANCH"
echo "Repository: $GITHUB_USER/$REPO_NAME"

if [ ! -d ".git" ]; then
    echo "No .git folder found, initializing..."
    git init
    git remote add origin "\$REMOTE_URL"
    echo "Fetching origin $BRANCH..."
    if ! git fetch origin "$BRANCH" --depth=1; then
        echo "ERROR: Failed to fetch from remote. Check your PAT, repository name ($GITHUB_USER/$REPO_NAME), and branch ($BRANCH)."
        exit 1
    fi
    git checkout -f -B "$BRANCH" origin/"$BRANCH"
else
    echo "Syncing with remote..."
    git remote set-url origin "\$REMOTE_URL"
    if ! git fetch origin "$BRANCH"; then
        echo "ERROR: Fetch failed. Check your internet connection and repository settings."
        exit 1
    fi
    git reset --hard origin/"$BRANCH" || git reset --hard "origin/$BRANCH"
fi

echo "Starting $ENTRY_POINT..."
${runtime} "$ENTRY_POINT"
`;

    try {
        const sid = getIdentifier(BananaAPI, serverId);
        const uploadUrlRes = await BananaAPI.proxyFetch(`https://control.bot-hosting.net/api/client/servers/${sid}/files/upload`, {
            headers: BananaAPI.getControlPanelHeaders()
        });

        if (!uploadUrlRes || !uploadUrlRes.data || !uploadUrlRes.data.attributes) {
            console.warn('Git: Failed to get upload URL. Response:', uploadUrlRes);
            throw new Error('Failed to get upload URL');
        }

        const uploadUrl = uploadUrlRes.data.attributes.url;
        const formData = new FormData();
        formData.append('files', new Blob([shellScript], { type: 'text/x-shellscript' }), 'bb-github.sh');

        const uploadRes = await fetch(`${uploadUrl}&directory=/`, {
            method: 'POST',
            body: formData
        });

        if (!uploadRes.ok) throw new Error('Failed to upload bb-github.sh');

        await BananaAPI.proxyFetch(`https://control.bot-hosting.net/api/client/servers/${sid}/startup/variable`, {
            method: 'PUT',
            headers: { ...BananaAPI.getControlPanelHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: 'START_BASH_FILE', value: 'bb-github.sh' })
        });

        BananaAPI.vfsInvalidate(sid, '/');
        return true;
    } catch (e) {
        console.error('Git setup error:', e);
        BananaAPI.showToast('Failed to setup git: ' + e.message, 'error');
        return false;
    }
};

window.__git_setupConsoleCommands = async (serverId) => {
    const btn = document.getElementById('banana-git-setup-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Setting up...';
    }

    try {
        const sid = getIdentifier(BananaAPI, serverId);
        const agentContent = await BananaAPI.getFileContents(sid, '/banana-burner.js');
        if (!agentContent || !agentContent.includes('// BANANA AGENT')) {
            BananaAPI.showToast('Banana Agent not found. Please install it first from the Startup tab.', 'error');
            return;
        }

        if (agentContent.includes('// GIT COMMAND HANDLER')) {
            BananaAPI.showToast('Git command handler already installed.', 'info');
            return;
        }

        const injection = `
// GIT COMMAND HANDLER
function gitConsole() {
    const readline = require('readline');
    const { spawn } = require('child_process');
    const rl = readline.createInterface({
        input: process.stdin,
        terminal: false
    });

    rl.on('line', (line) => {
        const cmd = line.trim();
        if (cmd.startsWith('git ')) {
            //BA.log(\`Executing git command: \${cmd}\`);
            const args = cmd.split(' ');
            const git = spawn('git', args.slice(1), { stdio: ['inherit', 'pipe', 'pipe'] });
            
            git.stdout.on('data', (data) => process.stdout.write(data));
            git.stderr.on('data', (data) => process.stderr.write(data));
            
            git.on('close', (code) => {
                //BA.log(\`Git command finished (code \${code})\`);
            });
        }
    });
    process.stdin.resume();
    BA.log('Git Console Command Handler initialized. Type "git status", "git pull", etc.');
}
    gitConsole();
// END GIT COMMAND HANDLER
`;

        const newContent = agentContent.replace('// END BANANA AGENT', injection + '\n// END BANANA AGENT');

        const uploadUrlRes = await BananaAPI.proxyFetch(`https://control.bot-hosting.net/api/client/servers/${sid}/files/upload`, {
            headers: BananaAPI.getControlPanelHeaders()
        });
        const uploadUrl = uploadUrlRes.data.attributes.url;
        const formData = new FormData();
        formData.append('files', new Blob([newContent], { type: 'text/javascript' }), 'banana-burner.js');

        await fetch(`${uploadUrl}&directory=/`, {
            method: 'POST',
            body: formData
        });

        BananaAPI.storage.set(`console-setup-${serverId}`, 'true');
        BananaAPI.vfsInvalidate(sid, '/');
        window.__git_renderStatus(serverId, true, true);
        BananaAPI.showToast('Git console commands ready! Please restart your server.', 'success');
    } catch (e) {
        console.error('Git console setup error:', e);
        BananaAPI.showToast('Failed to setup console commands.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = 'Setup Console Commands';
        }
    }
};

window.__git_disconnect = (serverId) => {
    BananaAPI.openConfirmModal(
        'Disconnect Git',
        'Are you sure you want to disconnect Git? This will reset your startup script and remove repo settings from this plugin. Your repository files on the server will NOT be deleted.',
        async () => {
            BananaAPI.showToast('Disconnecting...', 'info');
            try {
                const sid = getIdentifier(BananaAPI, serverId);

                await BananaAPI.proxyFetch(`https://control.bot-hosting.net/api/client/servers/${sid}/startup/variable`, {
                    method: 'PUT',
                    headers: { ...BananaAPI.getControlPanelHeaders(), 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: 'START_BASH_FILE', value: '' })
                });

                try {
                    await BananaAPI.deleteFiles(sid, ['.git', 'bb-github.sh', '.gitconfig']);
                } catch (e) {
                    console.warn('File cleanup failed during disconnect (might already be gone):', e);
                }

                BananaAPI.storage.remove(`setup-${serverId}`);
                BananaAPI.storage.remove(`config-${serverId}`);
                BananaAPI.storage.remove(`console-setup-${serverId}`);

                window.__git_renderStatus(serverId, false, false);
                BananaAPI.refreshDashboard();
                BananaAPI.showToast('Disconnected and cleaned up successfully', 'success');
            } catch (e) {
                console.error('Disconnect error:', e);
                BananaAPI.showToast('Failed to disconnect cleanly', 'error');
            }
        },
        'Disconnect'
    );
};

return {
    init(api) {
        pluginApi = api;
        api.addPulloutFlag({
            id: 'git',
            icon: 'fab fa-github',
            title: 'Git & GitHub',
            isVisible: (serverId) => {
                const details = api.getDetails(serverId);
                return api.isNodeServer(details) || api.isPythonServer(details);
            },
            renderPanel: (serverId) => renderPanel(api, serverId),
            onOpen: async (serverId) => {
                const [isSetup, isConsoleSetup] = await Promise.all([
                    checkGitSetup(api, serverId),
                    checkConsoleSetup(api, serverId)
                ]);
                window.__git_renderStatus(serverId, isSetup, isConsoleSetup);
            }
        });

        api.lockStartupVariable('START_BASH_FILE', 'Controlled by Git', (sid, val) => val === 'bb-github.sh');

        api.on('startupSaved', async (data) => {
            const { serverId, variables } = data;
            if (api.CONFIG.DEBUG) api.log('DEBUG', `Received startupSaved for server ${serverId}`);
            const entryPool = ['BOT_JS_FILE', 'START_JS_FILE', 'MAIN_FILE', 'BOT_PY_FILE', 'START_PY_FILE'];
            const entryVar = (variables || []).find(v => entryPool.includes(v.name));

            if (entryVar) {
                let isSetup = api.storage.get(`setup-${serverId}`) === 'true';

                if (!isSetup) {
                    if (api.CONFIG.DEBUG) api.log('DEBUG', 'Storage says not setup, checking filesystem for Git config...');
                    isSetup = await checkGitSetup(api, serverId);
                }

                const config = api.storage.getJSON(`config-${serverId}`);

                if (api.CONFIG.DEBUG) api.log('DEBUG', `Entry point change detected. isSetup: ${isSetup}, config exists: ${!!config}`);

                if (isSetup && config && window.__git_saveConfig) {
                    try {
                        const success = await window.__git_saveConfig(serverId, config);
                        if (success) {
                            api.showToast('Git entry point updated.', 'success');
                            api.log('SUCCESS', 'Git entry point updated automatically');
                        }
                    } catch (e) {
                        api.log('ERROR', `Git Auto-Update: ${e.message}`);
                    }
                }
            }
        });
    },
    checkGitSetup: (api, serverId) => checkGitSetup(api, serverId),
    destroy() {
        delete window.__git_checkSetup;
        delete window.__git_renderStatus;
        delete window.__git_openSetupModal;
        delete window.__git_saveConfig;
        delete window.__git_setupConsoleCommands;
        delete window.__git_disconnect;
    }
};
