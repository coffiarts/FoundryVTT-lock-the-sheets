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

function getSheetLockActiveEffectName() {
    return 'Sheet Lock';
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
        }
    }

    // Refresh Token status overlays
    renderTokenOverlays();
    ui.sidebar.render(true); // just for double safety, maybe not needed
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
 * Originally (v11) inspired by // https://github.com/LeafWulf/deathmark/blob/master/scripts/deathmark.js, using Token.overlayEffect.
 * But as of v12, this has been desupported and now needs to be done by ActiveEffects.
 */
async function renderTokenOverlays() {
    for (const aToken of game.scenes.current.tokens) {
        if (aToken.actorLink) {
            // ensure that overlay is only rendered for the token's owner (the GM will implicitely see the change for all owned tokens)
            const actor = game.actors.find((actor)=>{return (actor.id === aToken.actorId)});
            const owner = findOwnerByActorName(actor.name);
            // Logger.debug("owner", owner, "owner?.active", owner?.active, "game.user", game.user, "actor", actor, "owner === game.user", owner === game.user, "game.user.isGM", game.user.isGM);
            if(owner != null) { // only owned tokens are meant to show an icon

                const overlayImg = (owner.active && owner === game.user || game.user.isGM) ? ((LockTheSheets.isActive) ? Config.setting('overlayIconLocked') : Config.setting('overlayIconOpen')) : "";

                if (owner === game.user || !owner.active && game.user.isGM) {
                    // Logger.debug("overlayImg", overlayImg);

                    if (Config.getGameMajorVersion() < 12) {
                        // Up to Foundry v11, adding a simple overlay image is sufficient
                        await aToken.update({overlayEffect: overlayImg});
                    } else {
                        // As of v12, everything needs to be done through an ActiveEffect
                        // see https://foundryvtt.com/api/interfaces/foundry.types.ActiveEffectData.html
                        aToken.actor.effects.getName(getSheetLockActiveEffectName())?.delete();
                        const activeEffectData = [{
                            name: getSheetLockActiveEffectName(),
                            img: overlayImg,
                            flags: {
                                core: {
                                    overlay: true
                                },
                                dsa5: { // a dummy flag required by game system dsa5/tde5 as of version 6.x for handling status effects correctly
                                    value: null
                                }
                            },
                            duration: {
                                seconds: 10000000000000000000 // still a nasty workaround to simulate a permanent status
                            }
                        }];
                        await aToken.actor.createEmbeddedDocuments("ActiveEffect", activeEffectData);
                    }
                }
            }
        }
    }
}

async function renderActorDirectoryOverlays(app, html) {
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
