let discoveryInterval = null;
let statusInterval = null;
const DISCOVERY_FILES = ['.env', 'config.json', 'bot.js', 'settings.json'];
const TOKEN_REGEX = /(?:tokenn?|tokenid|bot_token)\s*[:=]\s*["']?([A-Za-z0-9\._\-]{50,})["']?/i;
const CLIENT_REGEX = /(?:client(?:id)?|id)\s*[:=]\s*["']?(\d{17,20})["']?/i;
const identityCache = new Map();
let requestQueue = [];
let isProcessingQueue = false;

async function processRequestQueue() {
    if (isProcessingQueue || requestQueue.length === 0) return;
    isProcessingQueue = true;
    while (requestQueue.length > 0) {
        const { action, resolve, reject } = requestQueue.shift();
        try {
            const result = await action();
            resolve(result);
        } catch (e) {
            reject(e);
        }
        if (requestQueue.length > 0) {
            await new Promise(r => setTimeout(r, 5000));
        }
    }
    isProcessingQueue = false;
}

function enqueueRequest(action) {
    return new Promise((resolve, reject) => {
        requestQueue.push({ action, resolve, reject });
        processRequestQueue();
    });
}

async function scanServer(api, server) {
    const identifier = server.identifier || server.attributes?.identifier;
    if (!identifier) return;
    for (const fileName of DISCOVERY_FILES) {
        try {
            const content = await enqueueRequest(() => api.getFileContents(identifier, fileName));
            if (!content) continue;
            const tokenMatch = content.match(TOKEN_REGEX);
            const clientMatch = content.match(CLIENT_REGEX);
            if (tokenMatch || clientMatch) {
                const data = {
                    tokenId: tokenMatch ? tokenMatch[1] : null,
                    clientId: clientMatch ? clientMatch[1] : null,
                    sourceFile: fileName,
                    lastScanned: Date.now()
                };
                api.storage.set(`bot-info-${identifier}`, data);
                await startStatusFetch(api, identifier, data);
                return;
            }
        } catch (e) {
            api.log('ERROR', `[BotIdentity] Scan failed:`, e);
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
            api.storage.set(`discord-cache-${identifier}`, identity);
            identityCache.set(identifier, identity);

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

function runDiscovery(api) {
    const servers = api.getServers();
    servers.forEach(s => {
        const detail = api.getDetails(s.serverid);
        const id = detail?.identifier || detail?.attributes?.identifier;
        if (!id) return;

        const cached = identityCache.get(id) || api.storage.getJSON(`discord-cache-${id}`);
        const isStale = cached ? (Date.now() - (cached.timestamp || 0) > 604800000) : true;

        if (isStale) {
            scanServer(api, detail);
        }
    });
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
                scanServer(api, detail);
            }
        };

        api.getServers().forEach(s => {
            const detail = api.getDetails(s.serverid);
            const id = detail?.identifier || detail?.attributes?.identifier;
            if (id) {
                const cached = api.storage.getJSON(`discord-cache-${id}`);
                if (cached) identityCache.set(id, cached);
            }
        });

        setTimeout(() => runDiscovery(api), 1500);
        discoveryInterval = setInterval(() => runDiscovery(api), 900000);

        api.addServerCardInjection((server) => {
            const detail = api.getDetails(server.serverid);
            const id = detail?.identifier || detail?.attributes?.identifier;
            if (id) {
                const cached = identityCache.get(id);
                if (cached) {
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
                                    <span onclick="window.__bh_rescanBot('${server.serverid}')" style="font-size: 0.65rem; opacity: 0.4; cursor: pointer; text-transform: uppercase; flex-shrink: 0;">(APP)</span>
                                </div>
                                <span style="font-size: 0.75rem; opacity: 0.6;">Discord</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
                }
            }
            return '';
        });

        api.on('fileSaved', ({ identifier, filePath }) => {
            if (DISCOVERY_FILES.some(f => filePath.endsWith(f))) {
                api.storage.remove(`bot-info-${identifier}`);
                const matched = api.getServers().find(s => {
                    const d = api.getDetails(s.serverid);
                    return (d?.identifier || d?.attributes?.identifier) === identifier;
                });
                if (matched) {
                    const d = api.getDetails(matched.serverid);
                    if (d) scanServer(api, d);
                }
            }
        });
    },
    destroy() {
        if (discoveryInterval) clearInterval(discoveryInterval);
        identityCache.clear();
        delete window.__bh_rescanBot;
    }
};
