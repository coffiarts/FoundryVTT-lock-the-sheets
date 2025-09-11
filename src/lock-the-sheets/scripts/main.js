import {Logger} from './logger.js';
import {Config} from './config.js'
import {ChatInfo} from "./chatinfo.js";
import {ControlButtonManager} from "./controlbuttonmanager.js";

const SUBMODULES = {
    MODULE: Config,
    logger: Logger,
    chatinfo: ChatInfo,
    controlButtonManager: ControlButtonManager
};

let ready2play;
let socket;
let controlButtonManager = new ControlButtonManager();

const tokenOverlays = new WeakMap();

/**
 * Global initializer block:
 */
(async () => {
        console.log("Lock The Sheets! [lock-the-sheets] | Initializing Module");

        await setup();
        Logger.debug("... setup done");

        Hooks.once("ready", () =>  {
            ready2play = true;
            Logger.infoGreen(`Ready to play! Version: ${game.modules.get(Config.data.modID).version}`);
            Logger.infoGreen(Config.data.modDescription);

            LockTheSheets.isActive = Config.setting('isActive');

            if (Config.getGameMajorVersion() >= 13) {
                Logger.debug("Calling renderUIButtonV13() from Hooks.ready");
                renderUIButtonV13();
            }
            else { // v12 or older
                Hooks.on('getSceneControlButtons', controls => {
                    controlButtonManager.registerButtonV12(Config.getUIButtonDefinition(), controls, Config.setting('showUIButton'));
                });
            }

            renderTokenOverlays();

            // stateChangeUIMessage(); // Activate this only if you want to post an initial screen message on game load. But that's probably more annoying than helful.
        });
    }
)
();

async function setup() {
    console.log("Lock The Sheets! [lock-the-sheets] (setup) Starting setup...");
    return Promise.all([
        new Promise(resolve => {
            console.log("[lock-the-sheets] (setup) Waiting for socketlib hook to be ready...");
            Hooks.once('socketlib.ready', () => {
                resolve(initSocketlib());
            });
        }),
        new Promise(resolve => {
            console.log("[lock-the-sheets] (setup) Waiting for setup hook to be ready...");
            Hooks.once('setup', () => {
                resolve(initSubmodules());
                resolve(initExposedClasses());
                resolve(initHooks());
            });
        })
    ]);
}

async function initSubmodules() {
    Object.values(SUBMODULES).forEach(function (cl) {
        cl.init(); // includes loading each module's settings
        Logger.debug("(initSubmodules) Submodule loaded:", cl.name);
    });
}

function renderUIButtonV13() {
    const buttonExists = controlButtonManager.hasButton(Config.getUIButtonDefinition().tool.name);
    const showButton = Config.setting('showUIButton');

    Logger.debug(`(renderUIButtonV13) buttonExists: ${buttonExists}`);
    Logger.debug(`(renderUIButtonV13) showButton: ${showButton}`);

    const buttonDef = Config.getUIButtonDefinition();
    if (!buttonExists && Config.setting('showUIButton')) {
        controlButtonManager.registerButtonV13Plus(buttonDef);
    }
    else if (buttonExists && !Config.setting('showUIButton')) {
        controlButtonManager.removeButtonV13Plus(buttonDef.tool.name);
    }
}

async function initSocketlib() {
    Logger.debug(`(initSocketlib) Registering module ${Config.data.modID} in socketlib ...`);
    socket = socketlib.registerModule(Config.data.modID);
    socket.register("stateChangeUIMessage", stateChangeUIMessage);
    socket.register("sheetEditGMAlertUIMessage", sheetEditGMAlertUIMessage);
    socket.register("itemChangedGMAlertUIMessage", itemChangedGMAlertUIMessage);
    socket.register("itemDeletedGMAlertUIMessage", itemDeletedGMAlertUIMessage);
    Logger.debug(`(initSocketlib) Module ${Config.data.modID} registered in socketlib.`);
}

async function initExposedClasses() {
    window.LockTheSheets = LockTheSheets;
    Logger.debug("(initExposedClasses) Exposed classes are ready");
}

async function initHooks() {
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

    // Hook related to the UI changes (Control Button, Actor Overlays)
    Hooks.on("renderActorDirectory", (app, html) => {
        renderActorDirectoryOverlays(app, html);
    });

    // Hook for capturing mod setting changes
    Hooks.on("updateSetting", async function (setting) {
        if (setting.key.startsWith(Config.data.modID)) {
            onGameSettingChanged();
        }
    });
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
    if (!user || user.isGM && !Config.setting("lockForGM")) return true;

    // Allow specific exceptions, e.g., equipping items
    if (type === "item" && Config.setting("allowEquip")) {
        const wornOrEquipped = data?.system?.worn ?? data?.system?.equipped;
        if (wornOrEquipped != null) return true;
    }

    // Show message to player (unless in silent mode or suppressed once)
    if (Config.setting('notifyOnChange') && !LockTheSheets.suppressNotificationsOnce) {
        ui.notifications.warn(
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
        // Reset the one-time suppression flag after use
        LockTheSheets.suppressNotificationsOnce = false;
    }

    // Block the action
    return false;
}

async function onGameSettingChanged() {

    // Handle change of "Active" switch
    if (LockTheSheets.isActive !== Config.setting('isActive')) {

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
    }

    // Refresh Token status overlays
    renderTokenOverlays();
    ui.sidebar.render(true); // just for double safety, possibly not needed

    // Refresh UI Button display state
    if (Config.getGameMajorVersion() >= 13) {
        Logger.debug("Calling renderUIButtonV13() from onGameSettingChanged");
        await renderUIButtonV13();
    }
    ui.controls.render(true);
}

/**
 * Render overlays on scene tokens.
 */
function renderTokenOverlays() {
    for (const token of canvas.tokens.placeables) {
        const actor = token.actor;
        if (!actor) continue;

        const owner = findOwnerByActorName(actor.name);
        if (!owner) continue;

        const isOwner = owner === game.user;
        const canSeeOverlay = (isOwner && owner.active) || game.user.isGM;

        if (!canSeeOverlay) {
            // Remove overlay if present
            const existing = tokenOverlays.get(token);
            existing?.destroy();
            tokenOverlays.delete(token);
            continue;
        }

        // Pick the icon based on lock state and config
        let overlayImg = null;
        if (LockTheSheets.isActive && Config.setting("showOverlayLocked")) {
            overlayImg = Config.OVERLAY_ICONS.locked;
        } else if (!LockTheSheets.isActive && Config.setting("showOverlayOpen")) {
            overlayImg = Config.OVERLAY_ICONS.open;
        }
        if (!overlayImg) {
            const existing = tokenOverlays.get(token);
            existing?.destroy();
            tokenOverlays.delete(token);
            continue;
        }

        // Remove any old overlay
        const existing = tokenOverlays.get(token);
        existing?.destroy();

        // Create new overlay sprite
        const sprite = window.PIXI.Sprite.from(overlayImg);

        // Scaling
        const scaledSize = getScaledOverlaySize(token.w, token.h);
        sprite.width = scaledSize;
        sprite.height = scaledSize;

        // Anchor and position: top-right corner
        sprite.anchor.set(0, 1);
        sprite.x = token.w - scaledSize;
        sprite.y = scaledSize;

        // Attach overlay
        token.addChild(sprite);
        tokenOverlays.set(token, sprite);

        ui.sidebar.render(true);
    }
}

function getScaledOverlaySize(parentWidth, parentHeight) {
    const scaleFactor = Config.OVERLAY_SCALE_MAPPING[Config.setting("overlayScale")];
    const baseSize = Math.min(parentWidth, parentHeight);
    return Math.round(baseSize * scaleFactor);
}

function getScaledActorOverlayDimensions(parentElement) {
    const scaledSize = getScaledOverlaySize(parentElement.width, parentElement.height);
    const width = `${scaledSize}px`;
    const height = `${scaledSize}px`;
    const left = `${parentElement.width - scaledSize}px`;
    return {width, height, left};
}

async function renderActorDirectoryOverlays(app, html) {

    // Skip if overlays for current lock state are not enabled
    if (LockTheSheets.isActive && !Config.setting('showOverlayLocked')
        || !LockTheSheets.isActive && !Config.setting('showOverlayOpen'))
        return;

    if (Config.getGameMajorVersion() >= 13) {
        html.querySelectorAll('.directory-item.actor').forEach(element => {
            // Grab the actor name text
            const actorName = element.querySelector(".entry-name")?.textContent.trim();
            const owner = findOwnerByActorName(actorName);
            // Logger.debug("\nactorName", actorName, "\nowner", owner);
            if (!owner) return; // skip unowned

            const imgPath = (LockTheSheets.isActive)
                ? Config.OVERLAY_ICONS.locked
                : Config.OVERLAY_ICONS.open;

            if (!imgPath) return;

            // Create <img> overlay icon
            const actorThumbnail = element.querySelector("img.thumbnail");
            if (!actorThumbnail) return;

            const icon = document.createElement("img");
            const {width, height, left} = getScaledActorOverlayDimensions(actorThumbnail);

            // icon.classList.add("overlay-icon"); // optional, so you can style it with CSS
            icon.style.position = "absolute";
            icon.style.width = width;
            icon.style.height = height;
            icon.style.top = "0";
            icon.style.left = left;
            icon.style.zIndex = "100";
            icon.src = imgPath;
            icon.alt = actorName;
            icon.title = actorName;

            // Insert before the actor’s thumbnail
            if (actorThumbnail) {
                element.insertBefore(icon, actorThumbnail);
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
                const imgPath = (LockTheSheets.isActive) ? Config.OVERLAY_ICONS.locked : Config.OVERLAY_ICONS.open;
                element.innerHTML = overlayIconAsHTML(actorName, imgPath, element.children[0]) + element.innerHTML;
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

function overlayIconAsHTML(title, imgPath, actorThumbnail){
    if (!imgPath) return "";
    const safeTitle = Config.escapeHtmlAttr(title);
    const {width, height, left} = getScaledActorOverlayDimensions(actorThumbnail);
    return `<img style="position:absolute; width: ${width}; height: ${height}; left: ${left}" title="${safeTitle}" src="${imgPath}" alt="${safeTitle}">`;
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
    ui.notifications.warn(`[${Config.data.modTitle}] ${message}`, {
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
    ui.notifications.warn(`[${Config.data.modTitle}] ${message}`, {
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
    ui.notifications.warn(`[${Config.data.modTitle}] ${message}`, {
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
