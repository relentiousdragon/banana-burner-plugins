# BananaBurner 2979 Plugin Docs

> Build stuff that runs inside BananaBurner 2979.

Feel free to create a PR with additions or modifications to these docs!

---

## Content

- [How It Works](#how-it-works)
- [Plugin Structure](#plugin-structure)
- [Your First Plugin](#your-first-plugin)
- [The BananaAPI](#bananaapi)
  - [User & Server Data](#user--server-data)
  - [Dashboard Widgets](#dashboard-widgets)
  - [UI Hooks](#ui-hooks)
  - [Storage](#storage)
  - [Notifications](#notifications)
  - [Events](#events)
  - [API Proxy](#api-proxy)
  - [File Editor](#file-editor)
  - [Context Menus](#context-menus)
  - [Image Caching](#image-caching)
  - [Logging](#logging)
- [Plugin Lifecycle](#plugin-lifecycle)
- [Inter-Plugin Communication](#inter-plugin-communication)
- [Widgets](#widget-recipes)
- [Publishing to the Marketplace](#publishing-to-the-marketplace)
- [Do's and Don'ts](#dos-and-donts)
- [Common Pitfalls](#common-pitfalls)
- [Debugging](#debugging)
- [Full Plugin Template](#full-plugin-template)
- [CSS Variables](#css-variables)

---

## How It Works

Plugins are just JavaScript files. You write one, publish it to the Market by sending it to one of the devs for review, and users can install it from the Market. When installed, the script gets downloaded and cached in their browser. it runs on every page load.

You get a `BananaAPI` object that lets you tap into stuff like user data, server list, dashboard, storage, toasts, modals, events.

**Important**: Plugins run in the same page context as the main script. Theres no iframe sandbox or anything like that. So dont be dumb with it, if you break something, it breaks for the user.

---

## Plugin Structure

```
Plugins/
  your-plugin-id/
    metadata.json    <- marketplace info, required
    script.js        <- your code, required
    thumbnail.png    <- optional (16:9)
```

### metadata.json

VERSION = THE VERSION OF THE BANANABURNER SCRIPT THAT YOUR PLUGIN IS SUPPORTED ON. Only Script versions on this version or higher will be able to use and install your extension.
```json
{
  "name": "My Cool Plugin",
  "author": "YourName",
  "version": "3.2",
  "timestamp": "UnixTimestampHere",
  "description": "A short description of what your plugin does. Shows up in the marketplace.",
  "downloads": 0
}
```

| Field         | Required | Notes                                                     |
|---------------|----------|-----------------------------------------------------------|
| `name`        | yes      | Display name in the marketplace                           |
| `author`      | yes      | Your username / handle                                    |
| `version`     | yes      | Should match the BananaBurner version its compatible with |
| `description` | yes      | Keep it short                                             |
| `downloads`   | yes      | Start at 0, the backend increments it automatically       |

### script.js

Your plugin code. Has to `return` an object with at least an `init()` method. That's it.

---

## Your First Plugin

Here's an example plugin that does something:

```js
// My First Plugin
// Shows a greeting card on the dashboard

const WIDGET_ID = 'hello-world';

function render() {
    const user = BananaAPI.getUser();
    const name = user ? user.username : 'stranger';

    return `
        <div class="module-header" style="background: var(--bg-tertiary);">
            <h2 style="display: flex; align-items: center; gap: 0.5rem; margin: 0; font-size: 1.1rem;">
                <i class="fas fa-hand-wave" style="color: var(--accent-primary);"></i>
                Hello There
            </h2>
        </div>
        <div class="module-body" style="padding: 1.25rem; background: var(--bg-secondary);">
            <p style="margin: 0; color: var(--text-secondary);">
                Hey ${name}, welcome back!
            </p>
        </div>`;
}

return {
    init(api) {
        api.addDashboardWidget(WIDGET_ID, render);
        //api.showToast('Hello World loaded!', 'success'); // if you want a toast for every time the plugin loads
    },
    destroy() {
        BananaAPI.removeDashboardWidget(WIDGET_ID);
    }
};
```

When installed, this shows a card on the dashboard. When uninstalled, the widget gets removed.

A few things:
- `BananaAPI` is a global inside your plugin scope
- `init(api)` also receives it as a parameter - either works, use whatever feels right
- You have to return an object with `init()` - that's how the framework starts your plugin
- `destroy()` is optional but please implement it. Kinda annnoying when uninstalled plugins leave garbage behind.

---

## BananaAPI

### User & Server Data

```js
// Who's logged in
const user = BananaAPI.getUser();
// { id: "userID", username: "someone", coins: 42 } or null

// All servers from the control panel
const servers = BananaAPI.getServers();
// Array of server objects - each has .attributes with name, status, identifier, etc.

// Grab a specific one
const server = BananaAPI.getServerById("a1b2c3");

// Get a cached server details object
const detail = BananaAPI.getDetails("a1b2c3");

// Server type detection, only for Node and Python for now, you can probably figure out if a server has another egg from it's startup command  and variables, the docker image for example.
const isNode = BananaAPI.isNodeServer(detail);
const isPython = BananaAPI.isPythonServer(detail);
```

Server data is only there if the user's connected to the panel. Always handle the case where `getServers()` returns an empty array.

### Dashboard Widgets

Widget cards show up below the Quick Actions section.

```js
// Register a widget
BananaAPI.addDashboardWidget('my-widget', () => {
    return `
        <div class="module-header" style="background: var(--bg-tertiary);">
            <h2>My Widget</h2>
        </div>
        <div class="module-body" style="padding: 1rem; background: var(--bg-secondary);">
            <p>Hello from my plugin!</p>
        </div>`;
});

// Re-render it (call this when your data changes)
BananaAPI.refreshWidget('my-widget');

// Remove it
BananaAPI.removeDashboardWidget('my-widget');
```

The render function runs every time the widget needs to display. Return an HTML string. The framework wraps it in a card container automatically.

**Widget HTML structure:**

```html
<div class="module-header" style="background: var(--bg-tertiary);">
    <h2 style="display: flex; align-items: center; gap: 0.5rem; margin: 0; font-size: 1.1rem;">
        <i class="fas fa-your-icon" style="color: var(--accent-primary);"></i>
        Your Widget Title
    </h2>
</div>
<div class="module-body" style="padding: 0; background: var(--bg-secondary);">
    <!-- your content here -->
</div>
```

The header uses `--bg-tertiary` for the background, and the body uses `--bg-secondary`.
You can use other css variables if you want, scroll down to the CSS variables section.

### UI Hooks

Hooks let you inject into existing parts of the UI.

#### Server Card Injection

Inject HTML into the bottom of each server card on the dashboard:

```js
BananaAPI.addServerCardInjection((serverId) => {
    const notes = getMyNotes(serverId);
    if (!notes) return ''; // return empty string to skip

    return `
        <div class="info-item" style="color: var(--accent-primary);">
            <i class="fas fa-sticky-note"></i>
            <span>${notes}</span>
        </div>`;
});
```

#### Server Context Menu

Add items to the context menu on server cards:

```js
BananaAPI.addServerContextMenuItems((serverId) => {
    return [
        {
            label: 'Do Stuff',
            icon: 'fas fa-star',
            onClick: () => handleStuff(serverId)
        },
        {
            label: 'Tralalelo Tralala',
            icon: 'fas fa-exclamation-triangle',
            isDanger: true,
            onClick: () => nukeServer(serverId)
        }
    ];
});
```

#### Module Header / Footer Injection

Add a bar above or below the content of a specific view:

```js
// Views: 'manage', 'coins', 'servers', 'uptime'
BananaAPI.addModuleHeaderInjection('manage', () => {
    return `
        <div style="padding: 1rem; background: var(--bg-tertiary); border-bottom: 1px solid var(--border-light);">
            <button onclick="window.__myPlugin_action()">My Action</button>
        </div>`;
});
```

#### Pullout Flag (Side Panel in Server Modal)

Adds a clickable icon to the right sidebar of the server details modal. When clicked it opens a sidebar:

```js
api.addPulloutFlag({
    id: 'my-panel',
    icon: 'fas fa-flag',
    title: 'My Plugin Panel',
    isVisible: (serverId) => true, // return false to hide for specific servers, for example if you want your plugin's sidebar & pull out flag to only show up for NodeJS servers, you can use the api's isNodeServer here.
    renderPanel: (serverId) => {
        return `<div style="padding: 1.25rem;">Hello from server ${serverId}!</div>`;
    },
    onOpen: (serverId) => {
        BananaAPI.log('PLUGIN', 'Panel opened for ' + serverId);
    }
});
```

#### Startup Variable Locking

Prevent the user from editing a specific startup variable and show a tooltip explaining why:

```js
api.lockStartupVariable('START_BASH_FILE', 'Controlled by Plugin'); //  keep tooltip short.

// Or conditionally lock it
api.lockStartupVariable('START_BASH_FILE', 'Controlled by Plugin', (serverId, value) => {
    return value === '/bb-github.sh'; // only lock if it's this value
});
```

#### Force a Dashboard Re-render

If you update data that affects hooks, call this:

```js
BananaAPI.refreshDashboard();
```

### Storage

You get your own namespaced storage. All your keys are automatically prefixed with `bh-plugin-yourpluginid-`.

```js
BananaAPI.storage.set('myKey', 'hello');
BananaAPI.storage.set('myObj', { foo: 'bar', count: 5 });

const val = BananaAPI.storage.get('myKey');          // "hello"
const obj = BananaAPI.storage.getJSON('myObj', {});  // { foo: "bar", count: 5 }

BananaAPI.storage.remove('myKey');
BananaAPI.storage.clear(); // wipes everything your plugin stored
```

Storage is just localStorage under the hood, so:
- ~5MB per domain, shared with everything else
- Don't store huge blobs of data
- Objects get JSON.stringify'd automatically, you just pass the object

### Notifications

```js
BananaAPI.showToast('It worked!', 'success');  // green
BananaAPI.showToast('Heads up', 'info');       // blue
BananaAPI.showToast('Something broke', 'error'); // red
BananaAPI.showToast('Watch out', 'warning');   // yellow

// Confirm modal
BananaAPI.openConfirmModal(
    'Delete Everything?',
    'This will wipe all your data. <b>Are you sure?</b>',
    () => {
        // user clicked confirm
        doTheDeletion();
    },
    'Delete',  // button text
    true       // isDanger, makes the button red
);

// Append a log to server's console
BananaAPI.appendConsoleLog('Agent started', 'success');
```

### Events

The event system is how plugins react to thinngs happening in the script, and how they talk to each other.

```js
function onServersChange(servers) {
    BananaAPI.log('PLUGIN', 'Server list updated:', servers);
}

BananaAPI.on('serversUpdated', onServersChange);
BananaAPI.off('serversUpdated', onServersChange); // stop listening
```

Event listeners are cleaned up automatically on plugin unload.

#### Built-in Events

| Event               | Payload                               | When it fires                               |
|---------------------|---------------------------------------|---------------------------------------------|
| `dashboardRendered` | `null`                                | Dashboard UI finished rendering             |
| `serversUpdated`    | `Array`                               | Server list refreshed from the panel        |
| `themeChanged`      | `String`                              | User applied a new theme (returns themeID)  |
| `fileSaved`         | `{ identifier, filePath }`            | File saved in the editor                    |
| `startupSaved`      | `{ serverId, identifier, variables }` | Startup variables saved                     |

> Listeners can be `async` functions. The framework waits for all of them to resolve before doing certain things like re-enabling buttons.

#### Emitting Your Own Events

Plugins can emit custom events too, which other plugins can listen for:

```js
// Emit a custom event
BananaAPI.emit('myPlugin:dataReady', { someData: 123 });

// Another plugin listens for it
BananaAPI.on('myPlugin:dataReady', (data) => {
    BananaAPI.log('PLUGIN', 'Got data from the other plugin:', data);
});
```

### API Proxy

Makes requests through the extension's background script.

For authenticated control panel calls:

```js
const headers = BananaAPI.getControlPanelHeaders();

const res = await BananaAPI.proxyFetch(
    `https://control.bot-hosting.net/api/client/servers/${serverId}/files`,
    { headers }
);
```

### File Editor

You can open the panel's built-in file editor from a plugin, and do file operations:

```js
// open a file
BananaAPI.openFileEditor("a1b2c3", "/index.js");

// Open at a specific line
BananaAPI.openFileEditor("a1b2c3", "/logs/latest.log", 42);

// List files in a directory
const files = await BananaAPI.getFiles("a1b2c3", "/src");

// Read a file's contents
const content = await BananaAPI.getFileContents("a1b2c3", "/bannana.json");

// Delete files
await BananaAPI.deleteFiles("a1b2c3", [".git", "bald.sh"]);

// Invalidate the VFS cache for a directory (do this after you create/change files)
BananaAPI.vfsInvalidate("a1b2c3", "/");
```

### Context Menus

Show a context menu anywhere in your plugin UI. Supports submenus:

```js
element.oncontextmenu = (e) => {
    BananaAPI.showContextMenu(e, [
        { icon: 'fas fa-copy', label: 'Copy', onClick: () => doCopy() },
        { type: 'divider' },
        { icon: 'fas fa-trash', label: 'Delete', isDanger: true, onClick: () => doDelete() },
        {
            icon: 'fas fa-folder',
            label: 'More...',
            submenu: [
                { icon: '', label: 'Stuff', onClick: () => moveTo('a') },
                { icon: '', label: 'Stuff2', onClick: () => moveTo('b'), isActive: true },
            ]
        }
    ]);
};
```

**Item properties:**

| Property   | Type       | Info                                                        |
|------------|------------|-------------------------------------------------------------|
| `icon`     | `string`   | Font Awesome class. Can be empty string.                    |
| `label`    | `string`   | Display text                                                |
| `onClick`  | `function` | Called on click                                             |
| `isDanger` | `boolean`  | Red.                                                        |
| `type`     | `string`   | `'divider'` for a separator                                 |
| `submenu`  | `array`    | Sub-items (same format). Adds a chevron and opens on hover. |
| `isActive` | `boolean`  | Checkmark highlight                                         |

### Image Caching

For images that don't change much (avatars, icons), cache them as DataURLs in localStorage. Helps with bad network connections and makes re-renders instant.

```js
// Cache an image (async, stores as DataURL)
const dataUrl = await window.__bh_cacheImage(url, expiryInMs /* default: 1 week */);

// Get it immediately in a render function (sync, returns original URL if not cached yet)
const src = window.__bh_getCachedImageSync(url);

// usage:
return `<img src="${window.__bh_getCachedImageSync(avatarUrl)}" style="border-radius: 50%; width: 32px;">`;
```

### Logging

```js
BananaAPI.log('SUCCESS', 'Sync complete!');
BananaAPI.log('PLUGIN', 'My custom plugin log');
BananaAPI.log('CUSTOM', 'Pink log', '#ff00ff'); // hex color, replace "CUSTOM" with whatever

// You can pass multiple arguments, objects, and arrays (Rest Parameters)
BananaAPI.log('INFO', 'User Data:', userObj, someArray);

// Predefined tags: INFO, SUCCESS, ERROR, WARN, DEBUG, PLUGIN
```

Use logs for development, but keep it clean for production (less spam). You can use the script's `CONFIG` constant `DEBUG` to conditionally log if the user has debug mode enabled:

```js
if (BananaAPI.CONFIG.DEBUG) { BananaAPI.log('DEBUG', 'This only shows if debug mode is enabled'); }
```

### Misc

```js
const config = BananaAPI.CONFIG;      // API URLs, version, etc.
const state  = BananaAPI.getState();  // snapshot of entire app state (read-only)
const myId   = BananaAPI.pluginId;    // your plugin's ID string
```

---

## Plugin Lifecycle

### Install (from Marketplace)
1. User clicks "Install"
2. Script gets downloaded and cached in `localStorage`
3. `loadPlugin()` runs, creates a `BananaAPI`, evaluates your code, calls `init(api)`
4. Plugin ID is added to the active list

### Page Reload
1. Framework reads `bh-active-plugins` from localStorage
2. Loads every active plugin's cached code
3. Calls `init()` again

### Uninstall
1. Right-click plugin card -> "Uninstall" -> confirm
2. `destroy()` is called, widgets removed, events cleaned up
3. Code cache deleted, all storage keys wiped, removed from active list

### Disable (without uninstalling)
1. Right-click plugin card -> "Disable Plugin"
2. `destroy()` runs, widgets removed
3. Plugin stays installed but won't auto-load on reload
4. User can re-enable from the Marketplace same way

---

## Inter-Plugin Communication

If you're building a plugin that's meant to work together with another one (or expose an API for others to use).

**Plugin A (exposes data):**
```js
// Emit data when something happens
function broadcastStatus(data) {
    BananaAPI.emit('pluginA:statusUpdate', data);
}

// Also expose a sync access point via the state or a global if needed
window.__pluginA_getStatus = () => currentStatus;
```

**Plugin B (consumes it):**
```js
BananaAPI.on('pluginA:statusUpdate', (data) => {
    // update your UI with the new info
    BananaAPI.refreshWidget('pluginB-widget');
});
```

if Plugin A isn't installed, Plugin B doesn't get the events.

---

## Widget Recipes

Some common UI patterns you can copy:

### Stat Grid

```js
return `
    <div class="module-header" style="background: var(--bg-tertiary);">
        <h2 style="margin: 0; font-size: 1.1rem;">
            <i class="fas fa-chart-bar" style="color: var(--accent-primary);"></i> Stats
        </h2>
    </div>
    <div class="module-body" style="background: var(--bg-secondary);">
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; padding: 1.25rem;">
            ${stats.map(s => `
                <div style="background: var(--bg-tertiary); padding: 1rem; border-radius: 10px; text-align: center;">
                    <div style="font-size: 1.5rem; font-weight: 700; color: var(--text-primary);">${s.value}</div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem;">${s.label}</div>
                </div>
            `).join('')}
        </div>
    </div>`;
```

### List with Actions

```js
return `
    <div class="module-header" style="background: var(--bg-tertiary);">
        <h2 style="margin: 0; font-size: 1.1rem;">
            <i class="fas fa-list" style="color: var(--accent-primary);"></i> Items
        </h2>
        <button class="btn btn-sm btn-outline" onclick="window.__myPlugin_refresh()">
            <i class="fas fa-sync-alt"></i>
        </button>
    </div>
    <div class="module-body" style="padding: 0; background: var(--bg-secondary);">
        ${items.map((item, i) => `
            <div style="padding: 0.9rem 1.25rem; display: flex; justify-content: space-between; align-items: center;
                        border-bottom: 1px solid var(--border-light); ${i === items.length - 1 ? 'border-bottom: none;' : ''}">
                <span style="color: var(--text-primary);">${item.name}</span>
                <button class="btn btn-sm btn-outline" onclick="window.__myPlugin_action('${item.id}')">Go</button>
            </div>
        `).join('')}
    </div>`;
```

### Empty State

```js
return `
    <div class="module-body" style="padding: 3rem; text-align: center; background: var(--bg-secondary);">
        <i class="fas fa-inbox" style="font-size: 2.5rem; color: var(--text-tertiary); margin-bottom: 1rem;"></i>
        <p style="color: var(--text-secondary); margin: 0;">Nothing here yet.</p>
        <button class="btn btn-sm btn-outline" onclick="window.__myPlugin_load()" style="margin-top: 1rem;">
            Load Data
        </button>
    </div>`;
```

### Loading State

```js
let isLoading = true;

function render() {
    if (isLoading) return `
        <div class="module-body" style="padding: 2rem; text-align: center; background: var(--bg-secondary);">
            <i class="fas fa-spinner fa-spin" style="font-size: 1.5rem; color: var(--accent-primary);"></i>
            <p style="color: var(--text-secondary); margin-top: 0.75rem;">Loading...</p>
        </div>`;

    return `<!-- your stuff -->`;
}
```

---

## Publishing to the Marketplace

1. Set up your plugin folder:
   ```
   Plugins/your-plugin-id/
     metadata.json
     script.js
     thumbnail.png  (optional)
   ```

2. Double check your `metadata.json`, the `version` field has to match the BananaBurner version your plugin supports.

3. Send it to @agentzzrp or @paccman_0 on Discord.

4. Your plugin shows up in the "Plugins" tab after manual review and approval 🎉

---

## Do's and Don'ts

### Do

- **Implement `destroy()`** - Remove your widgets, clear your intervals, delete your window functions. Every single one.
- **Use the module-card pattern** - `module-header` + `module-body`. Your widget will look native instead of injected.
- **Prefix your window functions** - `window.__myPlugin_doThing()` not `window.doThing()`. Other plugins exist.
- **Handle nulls and empty arrays** - Servers might not be loaded. User might not be logged in. APIs can fail.
- **Use `refreshWidget()` to update UI** - Don't reach into the DOM and mutate things. Re-render cleanly.
- **Use CSS variables** - `var(--accent-primary)`, `var(--bg-secondary)`, etc. Your plugin should look right on any theme.
- **Add overflow to tall widgets** - `max-height: 400px; overflow-y: auto` on the body. Don't make the dashboard infinitely tall.
- **Use `BananaAPI.emit()` for cross-plugin comms**

### Don't

- **Don't write to `state` directly** - `BananaAPI.getState()` is read-only for a reason.
- **Don't use `eval()` or inject script tags** - Your code is already being run. More dynamic execution is probably bad.
- **Don't spam proxy fetch** - Cache what you can.
- **Don't block the main thread** - Heavy work goes in `async` functions or `setTimeout`. The dashboard shouldn't freeze.

---

## Common Pitfalls

### "My widget doesn't show up"
Call `addDashboardWidget()` inside `init()`, not at the top of the file. The DOM might not exist yet at that point, the framework handles timing but only for calls made through the API.

### "My onclick handlers don't work"
Functions in HTML strings need to be on `window`. `window.__myPlugin_doThing()` works, `myFunction()` doesn't (it's not in scope when the HTML is stringified) also make sure you're registering the `window` functions before calling `render`.

### "My data disappears after reload"
You're storing in a variable. Variables reset every page load. Use `BananaAPI.storage` for anything that needs to persist.

### "My plugin breaks another plugin"
Name collisions. Check that your `window.__` functions and CSS selectors are specific enough that they won't stomp on something else.

### "Uninstall doesn't clean up"
Your `destroy()` is incomplete. Double check you're removing every widget, clearing every interval, and deleting every `window.__` function you set.

### "I'm bald"
Too bald.

---

## Debugging

Dev Mode gives you extra tools. Enable it from the browser console by running this command:

```js
BananaBurner.setDevMode(true);
```

With Dev Mode on, the Marketplace gets a "LOCAL" tab where you can load plugin folders directly from your computer.

Use your browser's DevTools for console logs, css stuff, network requests and other.

**If your local plugin isn't loading:**
- Make sure `metadata.json` and `script.js` are both in the folder
- Check the `version` field - if it's higher than the current BananaBurner script version it'll be flagged as incompatible
- Open the browser console and look for errors

---

## Full Plugin Template

Copy this as a starting point:

```js
const WIDGET_ID = 'my-plugin';
let myInterval = null;

function render() {
    const user = BananaAPI.getUser();
    return `
        <div class="module-header" style="display: flex; align-items: center; justify-content: space-between; background: var(--bg-tertiary);">
            <h2 style="display: flex; align-items: center; gap: 0.5rem; margin: 0; font-size: 1.1rem;">
                <i class="fas fa-puzzle-piece" style="color: var(--accent-primary);"></i>
                Plugin Name
            </h2>
            <button class="btn btn-sm btn-outline" style="flex: none;" onclick="window.__mp_refresh()">
                <i class="fas fa-sync-alt"></i>
            </button>
        </div>
        <div class="module-body" style="padding: 1.25rem; background: var(--bg-secondary);">
            <p style="color: var(--text-secondary); margin: 0;">
                Hello, ${user?.username || 'friend'}!
            </p>
        </div>`;
}

window.__mp_refresh = () => {
    BananaAPI.showToast('Refreshed!', 'success');
    BananaAPI.refreshWidget(WIDGET_ID);
};

return {
    init(api) {
        api.addDashboardWidget(WIDGET_ID, render);

        // refresh data every 30 seconds
        myInterval = setInterval(() => {
            BananaAPI.refreshWidget(WIDGET_ID);
        }, 30000);
    },
    destroy() {
        BananaAPI.removeDashboardWidget(WIDGET_ID);
        delete window.__mp_refresh;
        if (myInterval) clearInterval(myInterval);
    }
};
```

---

## CSS Variables

Use these variables for consistent theming. Using these makes your plugin match the user's active theme, including custom themes.

### Core Colors & Text

| Variable            | Description                                    | Theme Mapping              |
|---------------------|------------------------------------------------|----------------------------|
| `--bg-primary`      | Main page background                           | `theme-bg-primary`         |
| `--bg-secondary`    | Card/section background                        | `theme-bg-secondary`       |
| `--bg-tertiary`     | Subtle contrast (headers, inputs)              | `theme-bg-tertiary`        |
| `--text-primary`    | Primary text color                             | `theme-text-primary`       |
| `--text-secondary`  | Secondary text color                           | `theme-text-secondary`     |
| `--text-tertiary`   | Tertiary text color                            |                            |
| `--accent-primary`  | Primary accent                                 | `theme-accent`             |
| `--accent-secondary`| Secondary accent (hover states)                | `theme-accent-secondary`   |
| `--border-light`    | light border                                   | `theme-border-color`       |
| `--border-medium`   | medium border                                  |                            |

### Interaction & Feedback

| Variable           | Description                                    |
|--------------------|------------------------------------------------|
| `--bg-hover`       | Background color for hovered items             |
| `--accent-success` | Green                                          |
| `--accent-error`   | Red                                            |
| `--accent-warning` | Orange/Yellow                                  |
| `--accent-info`    | Blue                                           |

### Modals & Popups

| Variable              | Description                                    | Theme Mapping              |
|-----------------------|------------------------------------------------|----------------------------|
| `--modal-bg-primary`  | Primary modal background                       | `theme-popup-bg`           |
| `--modal-bg-secondary`| Secondary modal background                     |                            |
| `--modal-tertiary-bg` | tertiary modal background                      | `theme-popup-tertiary`     |
| `--popup-blur`        | Backdrop blur amount (e.g. `8px`)              |                            |

### Toasts

| Variable         | Color             |
|------------------|-------------------|
| `--toast-info`   | Blue              |
| `--toast-success`| Green             |
| `--toast-error`  | Red               |
| `--toast-warn`   | Orange            |
| `--toast-coins`  | Shade of Orange   |
| `--toast-banana` | Another Orange    |

### Layout & Appearance

| Variable            | Description                                    |
|---------------------|------------------------------------------------|
| `--font-primary`    | Main font                                      |
| `--font-secondary`  | Secondary font                                 |
| `--border-radius`   | Standard radius (default `12px`)               |
| `--border-radius-lg`| Large radius for containers                    |
| `--border-radius-sm`| Small radius for buttons/inputs                |
| `--border-width`    | Border width                                   |
| `--shadow-md`       | Medium box-shadow                              |

Use Devtools to inspect for other variables.

Good luck!

---

Last Updated: March 17th 2026 04:15 UTC+9:00
Contributors: @relentiousdragon, @paccman_0 (Discord)
