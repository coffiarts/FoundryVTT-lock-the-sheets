import {Logger} from './logger.js';
import {Config} from './config.js'
import {ChatInfo} from "./chatinfo.js";

const SUBMODULES = {
    MODULE: Config,
    logger: Logger,
    chatinfo: ChatInfo
};

let ready2play;
let socket;

/**
 * Global initializer block:
 * First of all, we need to initialize a lot of stuff in correct order:
 */
(async () => {
        console.log("Lock The Sheets! | Initializing Module");

        await allPrerequisitesReady();

        // The fist Hook needs to be registered before anything else, because it's used to add the custom control button on rendering the sidebar'
        if (Config.getGameMajorVersion() <= 12) { // As of v13, this is done without hooks (this is covered later)
            Hooks.on("getSceneControlButtons", (controls) => {
                addCustomControlButtonV12(controls);
            });
        }

        Hooks.once("ready", () =>  {
            ready2play = true;
            Logger.infoGreen(`Ready to play! Version: ${game.modules.get(Config.data.modID).version}`);
            Logger.infoGreen(Config.data.modDescription);
            LockTheSheets.isActive = Config.setting('isActive');

            // Hooks related to sheet locking: Actors
            Hooks.on("preUpdateActor", (actor, data, options, userId) =>
                handleLock("actor", "update", actor, data, options, userId)
            );

            // Hooks related to sheet locking: Items
            Hooks.on("preCreateItem", (item, data, options, userId) =>
                handleLock("item", "create", item, data, options, userId)
            );
            Hooks.on("preUpdateItem", (item, data, options, userId) =>
                handleLock("item", "update", item, data, options, userId)
            );
            Hooks.on("preDeleteItem", (item, options, userId) =>
                handleLock("item", "delete", item, null, options, userId)
            );

            // Hooks related to sheet locking: ActiveEffects
            Hooks.on("preCreateActiveEffect", (effect, data, options, userId) =>
                handleLock("effect", "create", effect, data, options, userId)
            );
            Hooks.on("preUpdateActiveEffect", (effect, data, options, userId) =>
                handleLock("effect", "update", effect, data, options, userId)
            );
            Hooks.on("preDeleteActiveEffect", (effect, options, userId) =>
                handleLock("effect", "delete", effect, null, options, userId)
            );

            // Hooks related to the UI changes (Control Button, Actor Overlays)
            if (Config.getGameMajorVersion() <= 12) {
                // fr v12, we simply need to force a refresh  ofthe controls layer. This will fire the related getSceneControlButtons hooks above and add/remove the button as needed
                ui.controls.initialize({layer: "token"});
            }
            Hooks.on("renderActorDirectory", (app, html) => {
                renderActorDirectoryOverlays(app, html);
            });

            // Hooks for capturing mod setting changes
            Hooks.on("updateSetting", async function (setting) {
                if (setting.key.startsWith(Config.data.modID)) {
                    onGameSettingChanged();
                }
            });

            // backward-compatibility with v11
            if (Config.getGameMajorVersion() < 12) {
                // In v11, token overlays are rendered permanently (with each frame) on every single client, so they need to be hooked
                // Hooks related to rendering the status icon overlays
                Hooks.on("drawToken", () => {
                    renderTokenOverlays();
                });
                Hooks.on("refreshToken", () => {
                    renderTokenOverlays();
                });
            } else {
                // As of v12, token overlays are Active Effects, i.e. they're stateful. They are added and removed only on change
                renderTokenOverlays();
            }

            stateChangeUIMessage();
        });
    }
)
();

async function allPrerequisitesReady() {
    return Promise.all([
        areDependenciesReady(),
        isSocketlibReady()
    ]);
}

async function areDependenciesReady() {
    return new Promise(resolve => {
        Hooks.once('setup', () => {
            resolve(initDependencies());
            resolve(initExposedClasses());
        });
    });
}

async function isSocketlibReady() {
    return new Promise(resolve => {
        Hooks.once('socketlib.ready', () => {
            resolve(initSocketlib());
        });
    });
}
async function initDependencies() {
    Object.values(SUBMODULES).forEach(function (cl) {
        cl.init(); // includes loading each module's settings
        Logger.debug("(initDependencies) Submodule loaded:", cl.name);
    });
}

async function initExposedClasses() {
    window.LockTheSheets = LockTheSheets;
    Logger.debug("(initExposedClasses) Exposed classes are ready");
}

async function initSocketlib() {
    socket = socketlib.registerModule(Config.data.modID);
    socket.register("stateChangeUIMessage", stateChangeUIMessage);
    socket.register("sheetEditGMAlertUIMessage", sheetEditGMAlertUIMessage);
    socket.register("itemChangedGMAlertUIMessage", itemChangedGMAlertUIMessage);
    socket.register("itemDeletedGMAlertUIMessage", itemDeletedGMAlertUIMessage);
    Logger.debug(`(initSocketlib) Module ${Config.data.modID} registered in socketlib.`);
}

/**
 * Central hook handler for LockTheSheets
 * @param {string} type - "actor", "item", or "effect"
 * @param {string} action - "create", "update", "delete"
 * @param {Document|Actor|Item|ActiveEffect} doc
 * @param {object} data - the update data (if applicable)
 * @param {object} options - the options object
 * @param {string} userId - ID of the user performing the action
 * @returns {boolean|undefined} false to block
 */
function handleLock(type, action, doc, data, options, userId) {

    // Only when module is set to "active"
    if (!Config.setting("isActive")) return true;

    // Skip GM
    const user = game.users.get(userId);
    if (!user || user.isGM) return true;

    // Allow specific exceptions, e.g., equipping items
    if (type === "item" && Config.setting("allowEquip")) {
        const wornOrEquipped = data?.system?.worn ?? data?.system?.equipped;
        if (wornOrEquipped != null) return true;
    }

    // Show message to player (unless in silent mode or suppressed once)
    if (Config.setting('notifyOnChange') && !LockTheSheets.suppressNotificationsOnce) {
        ui.notifications.error(
            `[${Config.data.modTitle}] ${Config.localize("sheetEditRejected.playerMsg")}`
        );
        if (Config.setting("alertGMOnReject")) {
            socket.executeForAllGMs(
                "itemChangedGMAlertUIMessage",
                user.name,
                doc.name
            );
        }
    } else {
        // Reset the one-time suppress flag after use
        LockTheSheets.suppressNotificationsOnce = false;
    }

    // Block the action
    return false;
}

async function onGameSettingChanged() {

    // Handle the "Active" switch
    LockTheSheets.isActive = Config.setting('isActive');

    // Handle the "Notification" options
    if (game.user.isGM && Config.setting('notifyOnChange')) {
        // UI messages should only be triggered by the GM via sockets.
        // This seems to be the only way to suppress them if needed.
        if (!LockTheSheets.suppressNotificationsOnce) {
            socket.executeForEveryone("stateChangeUIMessage");
        } else {
            LockTheSheets.suppressNotificationsOnce = false;
        }
    }

    // Handle the "Show UI Button" option
    if (game.user.isGM) { // It's a GM-only feature, so it can be safely skipped for any non-GM user

        if (Config.getGameMajorVersion() >= 13) { // in v13, we just add/remove the button via API as needed, without any hooking
            if (Config.setting('showUIButton')) {
                ui.controls.addControl("token", defineCustomControlButton());
            } else {
                ui.controls.removeControl("token", "toggleLockTheSheets");
            }
        }
        else { // v12 or older
            // in v12 we simply need to force a refresh the controls layer. This will fire the related getSceneControlButtons hooks to add/remove the button as needed
            ui.controls.initialize({ layer: "token" });
            ui.controls.render(true); // just for double safety, possibly not needed
        }
    }

    // Refresh Token status overlays
    renderTokenOverlays();
    ui.sidebar.render(true); // just for double safety, possibly not needed
}

/**
 * Only for v12. Adds a custom control button to the sidebar.
 * @param controls the temporary array of control definitions that are to be rendered
 */
function addCustomControlButtonV12(controls) {

    if (Config.getGameMajorVersion() > 12) return;
    if (!game.user.isGM) return;
    if (!Config.setting('showUIButton')) return;

    let tokenControlTools = controls.find(control => control.name === "token")?.tools;

        // Only add if not already present
        if (!tokenControlTools.some(t => t.name === "toggleMyButton")) {
            tokenControlTools.push(defineCustomControlButton());
        }
}

function defineCustomControlButton() {
    return {
        name: "toggleLockTheSheets",
        title: Config.localize('controlButton.label'),
        icon: "fa-solid fa-user-lock", // see https://fontawesome.com/search?o=r&m=free
        toggle: true,
        active: Config.setting('isActive'),
        onClick: (active) => {
            Config.modifySetting('isActive', active);
        }
    }
}

/**
 * Render token overlays for lock state (v12+ with PIXI).
 */
async function renderTokenOverlays() {
    for (const tokenDoc of game.scenes.current.tokens) {
        if (!tokenDoc.actorLink) continue; // only tokens that have an actor

        const actor = game.actors.get(tokenDoc.actorId);
        if (!actor) continue;

        const owner = findOwnerByActorName(actor.name);
        if (!owner) continue; // only owned actor tokens show overlays

        const isOwner = owner === game.user;
        const canSeeOverlay = (isOwner && owner.active) || game.user.isGM;

        if (!canSeeOverlay) continue;

        // Decide which overlay to show (if any)
        let overlayImg = "";
        if (LockTheSheets.isActive && Config.setting("showOverlayLocked")) {
            overlayImg = Config.setting("overlayIconLocked");
        } else if (!LockTheSheets.isActive && Config.setting("showOverlayOpen")) {
            overlayImg = Config.setting("overlayIconOpen");
        }

        // Get the actual rendered Token object
        const tokenObj = tokenDoc.object;
        if (!tokenObj) continue;

        // First remove any existing overlay
        const existing = tokenObj.icon.children.find(c => c.lockOverlay);
        if (existing) {
            existing.destroy();
        }

        // Add new overlay if image is defined
        if (overlayImg) {
            const tex = await loadTexture(overlayImg);
            const sprite = new PIXI.Sprite(tex);

            // Mark it for later cleanup
            sprite.lockOverlay = true;

            // Position top right, size relative to token
            sprite.width = tokenObj.w / 3;
            sprite.height = tokenObj.h / 3;
            sprite.x = tokenObj.w - sprite.width;
            sprite.y = 0;

            // Ensure above token art
            tokenObj.icon.addChild(sprite);
        }
    }
}

async function renderActorDirectoryOverlays(app, html) {

    // Skip if overlays for current lock state are not enabled
    if (LockTheSheets.isActive && !Config.setting('showOverlayLocked')
        || !LockTheSheets.isActive && !Config.setting('showOverlayOpen'))
        return;

    if (Config.getGameMajorVersion() >= 13) {
        Logger.debug("\nFIRED!");
        html.querySelectorAll('.directory-item.actor').forEach(element => {
            // Grab the actor name text
            const actorName = element.querySelector(".entry-name")?.textContent.trim();
            const owner = findOwnerByActorName(actorName);
            Logger.debug("\nactorName", actorName, "\nowner", owner);
            if (!owner) return; // skip unowned

            const imgPath = (LockTheSheets.isActive)
                ? Config.setting("overlayIconLocked")
                : Config.setting("overlayIconOpen");

            if (!imgPath) return;

            // Create <img> overlay icon
            const icon = document.createElement("img");
            icon.classList.add("overlay-icon"); // optional, so you can style it with CSS
            icon.style.position = "absolute";
            icon.src = imgPath;
            icon.alt = actorName;
            icon.title = actorName;

            // Insert before the actor’s thumbnail
            const thumb = element.querySelector("img.thumbnail");
            if (thumb) {
                element.insertBefore(icon, thumb);
            } else {
                element.prepend(icon);
            }
        });
    }
    else { // v12 and older
        html.find('.directory-item.document.actor').each((i, element) => {
            //Logger.debug(element);
            const actorName = element.children[0].title;
            const owner = findOwnerByActorName(actorName);
            //if (owner) Logger.debug("\nactorName", actorName, "\nowner", owner);
            if (owner != null) { // skip any unowned characters
                const imgPath = (LockTheSheets.isActive) ? Config.setting('overlayIconLocked') : Config.setting('overlayIconOpen');
                element.innerHTML = overlayIconAsHTML(actorName, imgPath) + element.innerHTML;
                element.innerHTML = element.innerHTML.replace('data-src', 'src');
            }
        });
    }
}

function findOwnerByActorName(actorName) {
    const actor = game.actors.find((actor) => {
        return actor.name === actorName
    });
    return game.users.find((user) => {
        return user.character?.id === actor?.id ||
            !user.isGM && actor?.testUserPermission(user, "OWNER")
    });
}

function overlayIconAsHTML(title, imgPath){
    if (!imgPath) return "";
    const safeTitle = Config.escapeHtmlAttr(title);
    return `<img style="position:absolute" title="${safeTitle}" src="${imgPath}" alt="${safeTitle}">`;
}

function stateChangeUIMessage() {
    let message =
        (LockTheSheets.isActive ? Config.localize('onOffUIMessage.whenON') : Config.localize('onOffUIMessage.whenOFF'));

    if (Config.setting('notifyOnChange')) {

        if (LockTheSheets.isActive) {
            ui.notifications.warn(`[${Config.data.modTitle}] ${message}`, {
                permanent: false,
                localize: false,
                console: false
            });
        } else {
            ui.notifications.info(`[${Config.data.modTitle}] ${message}`, {
                permanent: false,
                localize: false,
                console: false
            });
        }
    }
    Logger.info(message);
}

function sheetEditGMAlertUIMessage(userName, sheetName) {
    let message =
        Config.localize('sheetEditRejected.gmMsgSheet')
            .replace('{userName}', userName)
            .replace('{sheetName}', sheetName);
    ui.notifications.error(`[${Config.data.modTitle}] ${message}`, {
        permanent: false,
        localize: false,
        console: false
    });
    Logger.warn(message);
}

function itemChangedGMAlertUIMessage(userName, itemName) {
    let message =
        Config.localize('sheetEditRejected.gmMsgItem')
            .replace('{userName}', userName)
            .replace('{itemName}', itemName);
    ui.notifications.error(`[${Config.data.modTitle}] ${message}`, {
        permanent: false,
        localize: false,
        console: false
    });
    Logger.warn(message);
}

function itemDeletedGMAlertUIMessage(userName, itemName) {
    let message =
        Config.localize('sheetEditRejected.gmMsgItemDeleted')
            .replace('{userName}', userName)
            .replace('{itemName}', itemName);
    ui.notifications.error(`[${Config.data.modTitle}] ${message}`, {
        permanent: false,
        localize: false,
        console: false
    });
    Logger.warn(message);
}

/**
 * Public class for accessing this module through macro code
 */
export class LockTheSheets {
    static isActive = false;
    static #previousState;
    static suppressNotificationsOnce;

    static healthCheck() {
        alert(`Module '${Config.data.modTitle}' says: '${ready2play ? `I am alive!` : `I am NOT ready - something went wrong:(`}'` );
    }

    static switchOn(silentMode = false) {
        this.#switch(true, silentMode);
    }

    /**
     *
     * @param silentMode if true, any UI messages related to this switch action will be suppressed (overriding game settings)
     */
    static switchOff(silentMode = false) {
        this.#switch(false, silentMode);
    }

    /**
     *
     * @param silentMode if true, any UI messages related to this switch action will be suppressed (overriding game settings)
     */
    static toggle(silentMode = false) {
        this.#switch(!Config.setting('isActive'), silentMode);
    }

    static isOn() {
        return this.isActive;
    }

    static isOff() {
        return !this.isActive;
    }

    /**
     *
     * @param newStateIsON
     * @param suppressNotificationsOnce if true, any UI messages related to this switch action will be suppressed (overriding game settings)
     * @returns {Promise<void>}
     */
    static async #switch(newStateIsON, suppressNotificationsOnce = false) {
        LockTheSheets.suppressNotificationsOnce = suppressNotificationsOnce;
        this.#previousState = this.isActive;
        // propagate change to the game settings, and wait for it to complete
        // It turned out to be much more stable here by waiting for game.settings to be updated.
        // Might be an ugly workaround, better ideas welcome!
        await Config.modifySetting('isActive', newStateIsON);
    }
}
