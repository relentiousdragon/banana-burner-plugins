let globalObserver = null;
const PATH_REGEX = /(?:at\s+)?((?:[\w\.\\\/\-\@\#\$\%\&\+]|<[^>]+>)+\.(?:js|json|ts|tsx|css|html|py|php|go|rs|cpp|h|c|sh|bash|yml|yaml|txt|log|conf|config|mjs|cjs))(?=$|[\s\:\)])(?:(?::(?:<[^>]+>)*(\d+))?(?::(?:<[^>]+>)*(\d+))?)?|https?:\/\/[^\s\)\>\<\;\]\}'"]+/g;

function processLine(el) {
    const freshContent = el.innerHTML;
    if (el.dataset.bhLastContent === freshContent) return;

    const hasMatch = freshContent.match(PATH_REGEX);
    if (hasMatch) {
        el.innerHTML = freshContent.replace(PATH_REGEX, (match, path, line, col) => {
            if (match.includes('bh-console-link') || match.includes('href=')) return match;

            if (match.includes('://')) {
                const url = match.replace(/&amp;/g, '&').replace(/<[^>]+>/g, '');
                return `<a href="${url}" target="_blank" class="bh-console-link" 
                          style="color: var(--accent-primary); cursor: pointer; text-decoration: underline; font-weight: 600;"
                          title="Open Link">${match}</a>`;
            }

            const cleanPath = path.replace(/<[^>]+>/g, '').replace('/home/container/', '/');
            const cleanLine = line ? line.replace(/<[^>]+>/g, '') : '';

            if (!cleanPath.includes('/') && !cleanPath.includes('\\')) {
                return match;
            }

            return `<span class="bh-console-link" 
                          style="color: var(--accent-primary); cursor: pointer; text-decoration: underline; font-weight: 600;"
                          onclick="window.__bh_openLink('${cleanPath}', '${cleanLine}')"
                          title="Open ${cleanPath}${cleanLine ? ' at line ' + cleanLine : ''}">${match}</span>`;
        });
    }
    el.dataset.bhLastContent = el.innerHTML;
}

window.__bh_openLink = (path, line) => {
    const state = BananaAPI.getState();
    const identifier = state.controlPanel.websocket.instance ? state.controlPanel.websocket.identifier : null;
    if (identifier) {
        BananaAPI.openFileEditor(identifier, path, line);
    } else {
        BananaAPI.showToast('No active server connection found.', 'error');
    }
};

function scanConsole(root) {
    if (!root) return;
    root.querySelectorAll('.console-line').forEach(processLine);
}

function startGlobalObserver() {
    if (globalObserver) globalObserver.disconnect();

    globalObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === 1) {
                    if (node.classList.contains('console-body')) scanConsole(node);
                    else if (node.classList.contains('console-line')) processLine(node);
                    else node.querySelectorAll('.console-body').forEach(scanConsole);
                }
            }
            if (mutation.type === 'childList' && mutation.target.classList?.contains('console-line')) {
                processLine(mutation.target);
            }
        }
    });

    globalObserver.observe(document.body, { childList: true, subtree: true });

    const initialConsoles = document.querySelectorAll('.console-body');
    initialConsoles.forEach(scanConsole);
}

return {
    init(api) {
        startGlobalObserver();
        const style = document.createElement('style');
        style.id = 'bh-console-hyperlinks-style';
        style.innerHTML = `.bh-console-link:hover { filter: brightness(1.2); background: rgba(255, 255, 255, 0.05); border-radius: 2px; }`;
        document.head.appendChild(style);
    },
    destroy() {
        if (globalObserver) globalObserver.disconnect();
        delete window.__bh_openLink;
        document.getElementById('bh-console-hyperlinks-style')?.remove();
    }
};
