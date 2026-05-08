let discoveryInterval = null;
let statusInterval = null;
const DISCOVERY_FILES = ['.env', 'config.json', 'bot.js', 'settings.json'];
const TOKEN_REGEX = /(?:["']?[A-Z_]*TOKEN[A-Z_]*["']?|["']?tokenn?["']?|["']?tokenid["']?|["']?bot_token["']?)\s*[:=]\s*["']?([A-Za-z0-9\._\-]{50,})["']?/i;
const CLIENT_REGEX = /(?:["']?[A-Z_]*CLIENT(?:_ID|ID)?["']?|["']?client(?:id|_id)?["']?|["']?id["']?)\s*[:=]\s*["']?(\d{17,20})["']?/i;
const identityCache = new Map();
let requestQueue = [];
let isProcessingQueue = false;
let isDiscoveryRunning = false;
let isDestroyed = false;
const activeKeys = new Set();

async function processRequestQueue() {
    if (isDestroyed || isProcessingQueue || requestQueue.length === 0) return;
    isProcessingQueue = true;
    while (!isDestroyed && requestQueue.length > 0) {
        const { action, resolve, reject, key } = requestQueue.shift();
        if (key) activeKeys.add(key);
        try {
            const result = await action();
            resolve(result);
        } catch (e) {
            reject(e);
            if (e && (String(e).includes('throttled') || String(e).includes('fetch') || String(e).includes('500') || String(e).includes('502'))) {
                await new Promise(r => setTimeout(r, 20000));
            }
        } finally {
            if (key) activeKeys.delete(key);
            if (!isDestroyed) {
                await new Promise(r => setTimeout(r, 5000));
            }
        }
    }
    isProcessingQueue = false;
}

function enqueueRequest(action, key) {
    if (isDestroyed || requestQueue.some(r => r.key === key) || activeKeys.has(key)) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
        requestQueue.push({ action, resolve, reject, key });
        processRequestQueue();
    });
}

async function scanServer(api, server) {
    const identifier = server.identifier || server.attributes?.identifier;
    if (!identifier) return;
    for (const fileName of DISCOVERY_FILES) {
        try {
            const content = await enqueueRequest(async () => {
                if (api.CONFIG.DEBUG) api.log('PLUGIN', `[BotIdentity] Fetching ${fileName} for ${identifier}...`);
                return await api.getFileContents(identifier, fileName);
            }, `file-${identifier}-${fileName}`);

            if (!content) continue;

            const match = content.match(TOKEN_REGEX);
            if (match && match[1]) {
                if (api.CONFIG.DEBUG) api.log('PLUGIN', `[BotIdentity] Found credentials in ${fileName} for ${identifier}`);
                const data = {
                    tokenId: match[1],
                    sourceFile: fileName,
                    lastScanned: Date.now()
                };
                const clientMatch = content.match(CLIENT_REGEX);
                if (clientMatch && clientMatch[1]) data.clientId = clientMatch[1];

                api.storage.set(`bot-info-${identifier}`, data);
                await startStatusFetch(api, identifier, data);
                return;
            }
        } catch (e) {
            //
        }
    }

    if (api.storage.getJSON(`bot-info-${identifier}`)) {
        api.log('PLUGIN', `[BotIdentity] No token found for ${identifier}. Clearing cache.`);
        api.storage.remove(`bot-info-${identifier}`);
        api.storage.remove(`discord-cache-${identifier}`);
        identityCache.delete(identifier);
        api.refreshDashboard();
    }
}

async function startStatusFetch(api, identifier, data) {
    if (!data.tokenId) return;
    await enqueueRequest(() => fetchDiscordIdentity(api, identifier, data));
}

async function fetchDiscordIdentity(api, identifier, data) {
    if (!data.tokenId) return;
    try {
        const response = await api.proxyFetch('https://discord.com/api/v10/users/@me', {
            headers: { 'Authorization': `Bot ${data.tokenId}` }
        });
        if (response && response.ok) {
            const botData = response.data;
            const identity = {
                id: botData.id,
                username: botData.username,
                avatar: botData.avatar ? `https://cdn.discordapp.com/avatars/${botData.id}/${botData.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png',
                timestamp: Date.now()
            };

            const detail = api.getDetails(identifier) || api.getServers().find(s =>
                String(s.serverid) === String(identifier) ||
                String(s.attributes?.identifier) === String(identifier) ||
                String(s.identifier) === String(identifier)
            );

            const serverId = detail?.serverid ? String(detail.serverid) : null;
            const pterodactylId = detail?.identifier || detail?.attributes?.identifier;

            api.storage.set(`discord-cache-${identifier}`, identity);
            identityCache.set(String(identifier), identity);

            if (serverId && serverId !== String(identifier)) {
                api.storage.set(`discord-cache-${serverId}`, identity);
                identityCache.set(serverId, identity);
            }

            if (pterodactylId && pterodactylId !== String(identifier)) {
                api.storage.set(`discord-cache-${pterodactylId}`, identity);
                identityCache.set(String(pterodactylId), identity);
            }

            api.log('PLUGIN', `[BotIdentity] Resolved identity for ${identifier}: ${botData.username}`);
            api.storage.remove(`bot-info-${identifier}`);
            api.refreshDashboard();
        } else if (response && (response.status === 401 || (response.data && response.data.message && response.data.message.includes('401')))) {
            api.log('PLUGIN', `[BotIdentity] 401 Unauthorized for ${identifier}. Clearing token.`);
            api.storage.remove(`bot-info-${identifier}`);
            api.storage.remove(`discord-cache-${identifier}`);
            identityCache.delete(identifier);
            api.refreshDashboard();
        }
    } catch (e) {
        api.log('ERROR', `[BotIdentity] Fetch failed for ${identifier}:`, e);
    }
}

async function runDiscovery(api) {
    if (isDestroyed || isDiscoveryRunning) return;
    const state = api.getState();
    if (!state.mainAppInitialized || (state.controlPanel?.lastFetch === 0 && (state.controlPanel?.servers || []).length === 0)) {
        setTimeout(() => runDiscovery(api), 1000);
        return;
    }

    isDiscoveryRunning = true;
    try {
        const servers = api.getServers();
        if (api.CONFIG.DEBUG) api.log('PLUGIN', `[BotIdentity] Starting discovery for ${servers.length} servers...`);
        for (const s of servers) {
            if (isDestroyed) break;
            const id = s.serverid || s.attributes?.identifier || s.identifier;
            if (!id) continue;

            let detail = api.getDetails(id);
            if (!detail && s.attributes) detail = s.attributes;

            const identifier = detail?.identifier || detail?.attributes?.identifier;
            if (!identifier) continue;

            const cached = identityCache.get(identifier) || api.storage.getJSON(`discord-cache-${identifier}`);
            const staleTime = api.CONFIG.DEBUG ? 3600000 : 604800000;
            const isStale = cached ? (Date.now() - (cached.timestamp || 0) > staleTime) : true;

            if (isStale) {
                if (api.CONFIG.DEBUG) api.log('PLUGIN', `[BotIdentity] Queuing scan for ${identifier}...`);
                await scanServer(api, detail);
            } else {
                api.log('DEBUG', `[BotIdentity] Skipping ${identifier} (cache fresh)`);
            }
        }
    } finally {
        setTimeout(() => { isDiscoveryRunning = false; }, 30000);
    }
}

return {
    init(api) {
        window.__bh_rescanBot = (serverId) => {
            let detail = api.getDetails(serverId);
            if (!detail) {
                const match = (api.getState().controlPanel?.servers || []).find(cps => cps.serverid === serverId || cps.id === serverId);
                detail = match?.attributes || match;
            }
            const id = detail?.identifier || detail?.attributes?.identifier;
            if (id) {
                api.storage.remove(`bot-info-${id}`);
                api.storage.remove(`discord-cache-${id}`);
                identityCache.delete(id);
                scanServer(api, detail);
            }
        };

        api.on('serversUpdated', () => {
            api.getServers().forEach(s => {
                const id = s.serverid || s.attributes?.identifier || s.identifier;
                const altId = s.attributes?.identifier || s.identifier;

                let cached = api.storage.getJSON(`discord-cache-${id}`);
                if (!cached && altId) cached = api.storage.getJSON(`discord-cache-${altId}`);

                if (cached) {
                    if (id) identityCache.set(id, cached);
                    if (altId) identityCache.set(altId, cached);
                }
            });
            runDiscovery(api);
        });

        setTimeout(() => runDiscovery(api), 1500);
        discoveryInterval = setInterval(() => runDiscovery(api), 900000);

        api.addServerCardInjection((server) => {
            const sid = server.serverid ? String(server.serverid) : null;

            let pid = server.attributes?.identifier || server.identifier || server.uuid;
            if (!pid && sid) {
                const details = api.getDetails(sid);
                pid = details?.identifier || details?.attributes?.identifier;
            }

            const uuid = (server.uuid || server.attributes?.uuid);

            const cached = (sid ? identityCache.get(sid) : null) ||
                (pid ? identityCache.get(String(pid)) : null) ||
                (uuid ? identityCache.get(String(uuid)) : null);

            if (!cached) {
                const storageData = (sid ? api.storage.getJSON(`discord-cache-${sid}`) : null) ||
                    (pid ? api.storage.getJSON(`discord-cache-${pid}`) : null) ||
                    (uuid ? api.storage.getJSON(`discord-cache-${uuid}`) : null);
                if (storageData) {
                    if (sid) identityCache.set(sid, storageData);
                    if (pid) identityCache.set(String(pid), storageData);
                    if (uuid) identityCache.set(String(uuid), storageData);
                    return renderIdentity(storageData);
                }
            } else {
                return renderIdentity(cached);
            }

            return '';

            function renderIdentity(cached) {
                const fallbackAvatar = 'https://cdn.discordapp.com/embed/avatars/0.png';
                const avatarSrc = window.__bh_getCachedImageSync ? window.__bh_getCachedImageSync(cached.avatar) : cached.avatar;
                if (window.__bh_cacheImage) window.__bh_cacheImage(cached.avatar);

                return `
                    <div class="info-item discord-identity" style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.05); width: 100%;">
                        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                            <div style="display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1;">
                                <div style="width: 32px; height: 32px; flex-shrink: 0; position: relative;">
                                    <img src="${avatarSrc}" 
                                         onerror="if(!this.src.includes('embed/avatars')) this.src='${fallbackAvatar}';"
                                         style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 1.5px solid rgba(255,255,255,0.1);">
                                </div>
                                <div style="display: flex; flex-direction: column; min-width: 0; flex: 1;">
                                    <div style="display: flex; align-items: center; gap: 4px; min-width: 0;">
                                        <span class="notranslate" style="font-weight: 600; font-size: 0.85rem; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 150px;" title="${cached.username}">${cached.username}</span>
                                    </div>
                                    <span style="font-size: 0.75rem; opacity: 0.6;">Discord</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
        });

        api.addServerContextMenuItems((serverId) => {
            if (!api.CONFIG.DEBUG) return [];
            return [
                {
                    label: 'Wipe Bot ID',
                    icon: 'fas fa-trash-alt',
                    isDanger: true,
                    onClick: () => window.__bh_rescanBot(serverId)
                }
            ];
        });

        api.on('fileSaved', ({ identifier, filePath }) => {
            if (DISCOVERY_FILES.some(f => filePath.endsWith(f))) {
                api.storage.remove(`bot-info-${identifier}`);
                const matched = api.getServers().find(s => {
                    const sid = s.serverid || s.attributes?.identifier || s.identifier;
                    return sid === identifier;
                });
                if (matched) {
                    let detail = api.getDetails(identifier);
                    if (!detail && matched.attributes) detail = matched.attributes;
                    if (detail) scanServer(api, detail);
                }
            }
        });
    },
    destroy() {
        isDestroyed = true;
        if (discoveryInterval) clearInterval(discoveryInterval);
        if (statusInterval) clearInterval(statusInterval);
        requestQueue = [];
        identityCache.clear();
        delete window.__bh_rescanBot;
    }
};
