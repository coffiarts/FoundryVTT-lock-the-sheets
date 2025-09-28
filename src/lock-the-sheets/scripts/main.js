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

let socket;
let controlButtonManager = new ControlButtonManager();

// A cache for the generated notification messages, so that we can suppress redundant alerts
const notificationCache = new Map();

let ready2play;

/**
 * Global initializer block:
 */
(async () => {
        console.log("Lock The Sheets! [lock-the-sheets] | Initializing Module");

        await setup();

        Logger.debug("(setup) Waiting for getSceneControlButtons hook to be ready...");
        if (Config.getGameMajorVersion() <= 12) {
            Hooks.on('getSceneControlButtons', controls => {
                controlButtonManager.registerButtonOnceV12(Config.getUIButtonDefinition(), controls);
            });
        }
        Logger.debug("(setup) ... getSceneControlButtons hook complete.");

        Logger.debug("... SETUP COMPLETE.");

        Hooks.once("ready", () =>  {
            initHooks();
            LockTheSheets.isActive = Config.setting('isActive');
            if (Config.getGameMajorVersion() >= 13) {
                Logger.debug("Calling renderUIButtonV13() from Hooks.ready");
                renderUIButtonV13();
            }
            renderTokenOverlays();
            ui.controls.render();
            renderHUDIcon();

            Logger.infoGreen(`Ready to play! Version: ${game.modules.get(Config.data.modID).version}`);
            Logger.infoGreen(Config.data.modDescription);
            // stateChangeUIMessage(); // Activate this only if you want to post an initial screen message on game load. But that's probably more annoying than helful.

            ready2play = true;
        });
    }
)
();

async function setup() {
    console.log("Lock The Sheets! [lock-the-sheets] | DEBUG | (setup) STARTING SETUP...");
    return Promise.all([
        new Promise(resolve => {
            console.log("Lock The Sheets! [lock-the-sheets] | DEBUG | (setup) Waiting for socketlib hook to be ready...");
            Hooks.once('socketlib.ready', () => {
                resolve(initSocketlib());
            });
            console.log("Lock The Sheets! [lock-the-sheets] | DEBUG | (setup) ... socketlib hook complete.");
        }),
        new Promise(resolve => {
            console.log("Lock The Sheets! [lock-the-sheets] | DEBUG | (setup) Waiting for setup hook to be ready...");
            Hooks.once('setup', () => {
                resolve(initSubmodules());
                resolve(initExposedClasses());
            });
            Logger.debug("(setup) ... setup hook complete.");
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
    if (!game.user.isGM) return;
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

function initHooks() {
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

    // Process open Actor Sheets so that they intercept user interactions
    Hooks.on(`render${Config.getActorSheetAppClassName()}`, () => {
        toggleNativeUILock();
    });
    Logger.debug(`(initHooks) Game system-specific hook registered: Hooks.on("render${Config.getActorSheetAppClassName()}").`);

    // Hook related to the UI changes (Control Button, Actor Overlays)
    Hooks.on("renderActorDirectory", (app, html) => {
        renderActorDirectoryOverlays(app, html);
    });
    Hooks.on("changeSidebarTab", app => {
        const isActors = (typeof ActorDirectory !== "undefined" && app instanceof ActorDirectory)
            || app.id === "actors"
            || app.tabName === "actors";
        if (isActors) {
            renderActorDirectoryOverlays(app, app.element);
        }
    });
    Hooks.on("drawToken", async () => {
        renderTokenOverlays()
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
 * @returns {boolean|undefined} false to block, true to allow
 */
function handleLock(type, action, doc, data, options, userId) {

    // Only when module is set to "active"
    if (!LockTheSheets.isActive) return true; // true = allow

    // Skip GM
    const user = game.users.get(userId);
    if (!user || user.isGM && !Config.setting("lockForGM")) {
        Logger.debug("(handleLock) - user is a GM (and lockForGM is off), so allowing the action", options);
        return true; // true = allow
    }

    // Allow specific exceptions, e.g., equipping items
    if (type === "item" && Config.setting("allowEquip")) {
        const wornOrEquipped = data?.system?.worn ?? data?.system?.equipped;
        if (wornOrEquipped != null) return true; // true = allow
    }

    // Block any update that is not a user-initiated change
    if (!LockTheSheets.userInteractionDetected) {
        Logger.debug("(handleLock) - user interaction not detected, so allowing the action", options);
        return true; // true = allow
    } else { // user interaction detected, reset flag after a tolerance period (1 sec)
        setTimeout(() => {
            LockTheSheets.userInteractionDetected = false; // we've acknowledged the user interaction for this call, so reset the flag
            Logger.debug("(registerUserInteractionListener) userInteractionDetected:", LockTheSheets.userInteractionDetected);
        }, 1000);
    }

    // If we've got to this point, we assume that the action qualifies for blocking
    Logger.debug("(handleLock) received an action to block:", type, action, doc, data, options, userId);

    // Show message to player (unless in silent mode or suppressed once)
    if (Config.setting('notifyOnChange') && !LockTheSheets.suppressNotificationsOnce) {

        // Suppress multiple notifications for the same user within the same second:
        // For that, we calculate the event's time in seconds, then use it as id for the notification cache.
        const timestampInSeconds = Math.round(options.modifiedTime/1000);
        const notificationCacheKey = `${userId}-${timestampInSeconds}`;
        if (notificationCache.has(notificationCacheKey)) {
            Logger.debug("(handleLock) - notification skipped, because it was too clause to the previous one", notificationCacheKey);
            return false; // false = block
        }
        // Register the new message in the cache
        notificationCache.set(notificationCacheKey, options.modifiedTime);

        // Purge any entries older than 3 sec from the cache
        for (let key of notificationCache.keys()) {
            if (notificationCache.get(key) < Date.now() - 3000)
                notificationCache.delete(key);
        }
        Logger.debug("(handleLock) - notificationCache", notificationCache);

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
        // Reset the one-time suppression flag after use
        LockTheSheets.suppressNotificationsOnce = false;
    }

    // Block the action (if not already done above)
    return false;
}

async function onGameSettingChanged() {

    // Handle change of "Active" switch
    if (LockTheSheets.isActive !== Config.setting('isActive')) {

        LockTheSheets.isActive = Config.setting('isActive');

        await toggleNativeUILock();

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
        await renderUIButtonV13();
    } else { // v12
        controlButtonManager.refreshUIButtonV12(Config.getUIButtonDefinition());
    }
    ui.controls.render();

    renderHUDIcon();
}

/**
 * Render overlays on scene tokens.
 */
function renderTokenOverlays() {

    for (const token of canvas.tokens.placeables) {
        const actor = token.actor;
        // if (!actor) continue;

        const owner = findOwnerByActorName(actor?.name);
        // if (!owner || owner.isGM) continue;

        // Remove old overlay if present
        if (token.lockTheSheetsOverlay) {
            token.lockTheSheetsOverlay.destroy();
            delete token.lockTheSheetsOverlay;
        }

        const isPlayerOwned = typeof owner !== "undefined";
        const isOwner = owner === game.user;
        const isGM = game.user.isGM;
        const canSeeOverlay = (isPlayerOwned && isOwner) || (isGM && isPlayerOwned);
        if (!canSeeOverlay) {
            continue;
        }

        // Pick the icon based on lock state and config
        let overlayImg = null;
        if (LockTheSheets.isActive && Config.setting("showOverlayLocked")) {
            overlayImg = Config.OVERLAY_ICONS.locked;
        } else if (!LockTheSheets.isActive && Config.setting("showOverlayOpen")) {
            overlayImg = Config.OVERLAY_ICONS.open;
        } else {
            continue;
        }

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
        sprite.zIndex = 1000; // or any high number
        token.addChild(sprite);
        token.sortChildren(); // ensures zIndex is respected

        // Register in cache
        token.lockTheSheetsOverlay = sprite;

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
    if ((LockTheSheets.isActive && !Config.setting('showOverlayLocked')) ||
        (!LockTheSheets.isActive && !Config.setting('showOverlayOpen'))) {
        return;
    }

    const imgPath = LockTheSheets.isActive
        ? Config.OVERLAY_ICONS.locked
        : Config.OVERLAY_ICONS.open;
    if (!imgPath) return;

    // Collect actor elements
    let actorElements;
    if (Config.getGameMajorVersion() >= 13) {
        actorElements = html.querySelectorAll('.directory-item.actor');
    } else {
        actorElements = html.find('.directory-item.document.actor').toArray(); // v12 jQuery → array
    }

    actorElements.forEach(element => {
        handleActorElementOverlay(element, imgPath);
    });
}

function handleActorElementOverlay(element, imgPath) {
    if (element.jquery) element = element[0];

    const thumbnail = element.querySelector("img.thumbnail");
    if (!thumbnail) return;

    // force the actor thumbnail to load NOW (i.e. to skip any lazy-loading), so that we can use its REAL dimensions for calculation of the overlay size
    if (thumbnail.dataset.src && !thumbnail.src) thumbnail.src = thumbnail.dataset.src;

    const actorName = element.querySelector(".entry-name")?.textContent.trim() || thumbnail.title;
    if (!actorName) return;

    const owner = findOwnerByActorName(actorName);
    if (!owner) return;

    // remove previous overlays
    element.querySelectorAll("img.lock-the-sheets-overlay").forEach(img => img.remove());

    const { width, height, left } = getScaledActorOverlayDimensions(thumbnail);
    const overlay = document.createElement("img");
    overlay.classList.add("lock-the-sheets-overlay");
    overlay.style.position = "absolute";
    overlay.style.width = width;
    overlay.style.height = height;
    overlay.style.left = left;
    overlay.style.top = "0";
    overlay.style.zIndex = "100";
    overlay.src = imgPath;
    overlay.alt = actorName;
    overlay.title = actorName;

    // if (getComputedStyle(element).position === "static") element.style.position = "relative";
    element.insertBefore(overlay, thumbnail.nextSibling);
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

function stateChangeUIMessage() {
    let message =
        (LockTheSheets.isActive ? Config.localize('onOffUIMessage.whenON') : Config.localize('onOffUIMessage.whenOFF'));

    if (game.user.isGM && Config.setting('notifyOnChange')) {

        if (LockTheSheets.isActive) {
            ui.notifications.error(`[${Config.data.modTitle}] ${message}`, {
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

function clearHUDIcon() {
    document.getElementById("lock-the-sheets-hud")?.remove();
}

function renderHUDIcon() {
    Logger.debug("(renderHUDIcon))");

    clearHUDIcon();

    if (LockTheSheets.isActive && !Config.setting("showHUDIconLocked")
    || !LockTheSheets.isActive && !Config.setting("showHUDIconOpen")) {
        Logger.debug("(renderHUDIcon) - no HUD icon to render (overlays are disabled for the current lock state)");
        return;
    }

    // parent.style.position = "relative";
    const hud = document.createElement("div");
    hud.id = "lock-the-sheets-hud";
    hud.style.position = "absolute";
    hud.style.top = "0px";
    const leftPos =
        (Config.getGameMajorVersion() >= 13)
        ? (game.system.id === "dsa5")
            ? -250 * Config.OVERLAY_SCALE_MAPPING[Config.setting("overlayScale")] // v13 dsa5
            : 300 - 220 * Config.OVERLAY_SCALE_MAPPING[Config.setting("overlayScale")] // v13 dnd5
        : 0; // v12
    if (Config.getGameMajorVersion() >= 13) {
        hud.style.left = leftPos + "px";
    } else {
        hud.style.right = leftPos + "px";
    }
    hud.style.display = "inline-block";
    hud.style.marginTop = (Config.getGameMajorVersion() >= 13) ? "10px" : "20px";
    hud.style.marginRight = (Config.getGameMajorVersion() >= 13) ? "0px" : "20px";

    const icon = document.createElement("img");
    const size = 250 * Config.OVERLAY_SCALE_MAPPING[Config.setting("overlayScale")];
    icon.id = "lock-the-sheets-hud-icon";
    icon.src = (LockTheSheets.isActive) ? Config.OVERLAY_ICONS.locked : Config.OVERLAY_ICONS.open;
    icon.width = size;
    icon.height = size;
    icon.style.border = "none";
    icon.style.filter = "opacity(1)";
    icon.style.transition = "filter 4s";
    hud.appendChild(icon);

    // insert into Foundry's own UI container
    const parentName = (Config.getGameMajorVersion() >= 13) ? "sidebar" : "ui-middle";
    const parent = document.getElementById(parentName);
    Logger.debug("(renderHUDIcon) - inserting HUD icon", parent, hud);
    parent.appendChild(hud);

    if (Config.setting("hudIconTimeoutSeconds") > 0) {
        setTimeout(() => {
            fadeOutHUDIcon(icon);
        }, Config.setting("hudIconTimeoutSeconds") * 1000);
    }
}

function fadeOutHUDIcon(icon) {
    Logger.debug("(fadeOutHUDIcon))");
    icon.style.filter = "opacity(0)";
}

async function toggleNativeUILock() {
    if (game.user.isGM && !Config.setting("lockForGM")) return; // no need to toggle for GM, unless explicitly enabled
    // Logger.debug("(toggleNativeUILock)");
    await toggleNativeUILockButton();
    if (LockTheSheets.isActive) {
        registerUserInteractionListeners();
    }
}

function registerUserInteractionListeners() {
    // We add a catch-all listeners that detect any user interactions on the Actor Sheet's form elements and marks them as such.
    // This is needed later for heuristic distinction of user-initiated changes from programmatic or system-initiated changes
    const openActorSheets = window.document.querySelectorAll(Config.getActorSheetCSSQuerySelector());
    // Logger.debug("(toggleNativeUILock-registerUserInteractionListeners) - found open Actor Sheets:", openActorSheets);
    for (const sheet of openActorSheets) {
        // Logger.debug("(toggleNativeUILock-registerUserInteractionListeners) - registering listeners for sheet", sheet);
        ["input", "change", "click"].forEach(type => {
            // Logger.debug(`(toggleActorSheetLocks-registerUserInteractionListeners) - registering listener for type ${type}`, sheet);
            sheet.addEventListener(type, () => {
                if (LockTheSheets.isActive) {
                    // Logger.debug(`(toggleActorSheetLocks-registerUserInteractionListeners) - user interaction detected`, event.type, event.target);
                    LockTheSheets.userInteractionDetected = true;
                    // Logger.debug("(toggleNativeUILock-registerUserInteractionListeners) userInteractionDetected:", LockTheSheets.userInteractionDetected);
                }
            }, {capture: true});
        });
    }
}

async function toggleNativeUILockButton() {
    // Logger.debug("(toggleNativeUILockButton-toggleNativeUILockButton)");
    let elements;
    switch (game.system.id) {
        case "dnd5e": // dnd5e has a "lock slider"
            elements = window.document.querySelectorAll("slide-toggle");
            break;
        case "dsa5": // dsa5 has a "lock advancement button"
            elements = (Config.getGameMajorVersion() >= 13)
                ? window.document.querySelectorAll(`button.header-control[data-action="locksheet"]`)
                : window.document.querySelectorAll(`.header-button.control.locksheet`); // v12
            break;
    }

    if (!elements || !elements.length === 0) {
        // Logger.debug("(toggleNativeUILock-toggleNativeUILockButton) no toggles found. Probably no Actor Sheets are currently open.", elements);
        return;
    }

    const blockClick = (event) => {
        event.stopPropagation();
        event.preventDefault();
    };

    for (const toggleElement of elements) {
        if (!(toggleElement instanceof HTMLElement)) {
            // Logger.debug("(toggleNativeUILockButton) Toggle is not an HTMLElement. Skipping.", toggleElement);
            continue;
        }

        // Now enable/disable the visible slider as needed
        if (LockTheSheets.isActive) {
            // With active lock, we first have to make sure that the toggle reflects the current lock state.
            // Otherwise we might unintendedly "lock" the slider/button in UNlocked position, leaving the sheet open to edits
            if (!game.user.isGM || Config.setting("lockForGM")) {
                switch (game.system.id) {
                    case "dnd5e":
                        toggleElement.checked = false;
                        toggleElement.addEventListener("click", blockClick);
                        break;
                    case "dsa5":
                        // Logger.debug("(toggleNativeUILockButton) - toggleElement.classList: ", toggleElement.classList);
                        toggleElement.setAttribute("data-tooltip", "Locked by GM");
                        const lockElement = (Config.getGameMajorVersion() >= 13) ? toggleElement : toggleElement.children[0];
                        if (lockElement?.classList.contains("fa-unlock")) { // simulate click if state is unlocked
                            toggleElement.setAttribute("was-unlocked", "true");
                            LockTheSheets.isActive = false; // temporarily disable global lock flag, to avoid inintentionally blocking our own action here
                            LockTheSheets.userInteractionDetected = false; // force current action to be flagged as system-initiated, to push it through
                            await new Promise(resolve => {
                                // Logger.debug("(toggleNativeUILockButton) - simulating click on toggleElement", toggleElement);
                                resolve(toggleElement.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: false})));
                            });
                            LockTheSheets.isActive = true;
                        }
                        break;
                }
            }
            toggleElement.classList.add("disabled");
            toggleElement.style.pointerEvents = "none";
            toggleElement.style.opacity = "0.5";
            Logger.debug("(toggleNativeUILockButton) Lock toggled ON.");
        } else {
            switch (game.system.id) {
                case "dnd5e":
                    toggleElement.removeEventListener("click", blockClick);
                    break;
                case "dsa5":
                    toggleElement.setAttribute("data-tooltip", "SHEET.Lock");
                    if (toggleElement.getAttribute("was-unlocked") === "true") {
                        toggleElement.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: false}));
                        toggleElement.removeAttribute("was-unlocked");
                    }
                    break;
            }
            toggleElement.classList.remove("disabled");
            toggleElement.style.pointerEvents = "auto";
            toggleElement.style.opacity = "1";
            Logger.debug("(toggleNativeUILockButton) Lock toggled OFF.");
        }
    }
}

/**
 * Public class for accessing this module through macro code
 */
export class LockTheSheets {
    static isActive = false;
    static #previousState;
    static suppressNotificationsOnce;
    static userInteractionDetected = false; // used for dsa5 only, dnd5e works differently


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

    static async changeOverlayScale() {

        const currentKey = Config.setting("overlayScale");

        // Step 2: Get keys in order
        const keys = Object.keys(Config.OVERLAY_SCALE_MAPPING);

        // Step 3: Find next key index
        const currentIndex = keys.indexOf(currentKey);
        const nextIndex = (currentIndex + 1) % keys.length;

        // Step 4: Get next key and value
        const nextKey = keys[nextIndex];

        // Step 5: Update the setting
        await Config.modifySetting("overlayScale", nextKey);
    }

    static async toggleOverlays() {
        const isOn = (Config.setting("showOverlayLocked") || Config.setting("showOverlayOpen") || Config.setting("showHUDIconLocked") || Config.setting("showHUDIconOpen"));
        await Config.modifySetting("showOverlayLocked", !isOn);
        await Config.modifySetting("showOverlayOpen", !isOn);
        await Config.modifySetting("showHUDIconLocked", !isOn);
        await Config.modifySetting("showHUDIconOpen", !isOn);
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
