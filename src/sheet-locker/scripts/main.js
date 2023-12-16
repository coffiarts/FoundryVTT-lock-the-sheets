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
        console.log("Sheet Locker | Initializing Module");

        await allPrerequisitesReady();

        Hooks.once("ready", () =>  {
            ready2play = true;
            Logger.infoGreen(`Ready to play! Version: ${game.modules.get(Config.data.modID).version}`);
            Logger.info(Config.data.modDescription);
            SheetLocker.isActive = Config.setting('isActive');

            Hooks.on("preCreateItem", function (item, data, options, userid) {
                return onItemChangedInSheet(item, data, options, userid);
            });
            Hooks.on("preCreateActiveEffect", function (item, data, options, userid) {
                return onItemChangedInSheet(item, data, options, userid);
            });

            Hooks.on("preUpdateActor", function (actor, data, options, userid) {
                return onSheetChanged(actor, data, options, userid);
            });
            Hooks.on("preUpdateItem", function (item, data, options, userid) {
                return onItemChangedInSheet(item, data, options, userid);
            });
            Hooks.on("preUpdateActiveEffect", function (item, data, options, userid) {
                return onItemChangedInSheet(item, data, options, userid);
            });

            Hooks.on("preDeleteItem", function (item, options, userid) {
                return onItemDeletedFromSheet(item, options, userid);
            });
            Hooks.on("preDeleteActiveEffect", function (item, options, userid) {
                return onItemDeletedFromSheet(item, options, userid);
            });

            Hooks.on("getSceneControlButtons", (controls) => {
                renderControlButton(controls);
            });

            Hooks.on("drawToken", () => {
                renderTokenOverlays();
            });
            Hooks.on("refreshToken", () => {
                renderTokenOverlays();
            });

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
        Logger.debug("Submodule loaded:", cl.name);
    });
}

async function initExposedClasses() {
    window.SheetLocker = SheetLocker;
    Hooks.on("updateSetting", async function (setting) {
        if (setting.key.startsWith(Config.data.modID)) {
            onGameSettingChanged();
        }
    });
    Logger.debug("Exposed classes are ready");
}

async function initSocketlib() {
    socket = socketlib.registerModule(Config.data.modID);
    socket.register("stateChangeUIMessage", stateChangeUIMessage);
    socket.register("sheetEditGMAlertUIMessage", sheetEditGMAlertUIMessage);
    socket.register("itemChangedGMAlertUIMessage", itemChangedGMAlertUIMessage);
    socket.register("itemDeletedGMAlertUIMessage", itemDeletedGMAlertUIMessage);
    socket.register("renderTokenOverlays", renderTokenOverlays);
    Logger.debug(`Module ${Config.data.modID} registered in socketlib.`);
}

function renderControlButton(controls) {
    if (game.user.isGM && Config.setting('showUIButton')) {
        let tokenControls = controls.find(control => control.name === "token")
        tokenControls.tools.push({
            name: "toggleSheetLocker",
            title: Config.localize('controlButton.label'),
            icon: "fa-solid fa-user-lock", // see https://fontawesome.com/search?o=r&m=free
            toggle: true,
            active: Config.setting('isActive'),
            onClick: (active) => {
                Config.modifySetting('isActive', active);
            }
        });
    }
}

function onSheetChanged(actorOrItem, data, options, userid) {
    Logger.debug("actorOrItem:", actorOrItem);
    Logger.debug("data: ", data);
    Logger.debug("options: ", options);
    Logger.debug("userid: ", userid, "game.user.id: ", game.user.id);
    if (Config.setting('isActive') && (!game.user.isGM || Config.setting('lockForGM'))) {
        if (!SheetLocker.isSilentMode) {
            ui.notifications.error("[" + Config.data.modTitle + "] " + Config.localize('sheetEditRejected.playerMsg'), {
                permanent: false,
                localize: false,
                console: false
            });
            if (Config.setting('alertGMOnReject')) {
                socket.executeForAllGMs("sheetEditGMAlertUIMessage", game.users.get(userid)?.name, actorOrItem.name);
            }
        } else {
            SheetLocker.isSilentMode = false;
        }
        return false;
    }
}

function onItemChangedInSheet(item, data, options, userid) {
    Logger.debug("item:", item);
    Logger.debug("data: ", data);
    Logger.debug("options: ", options);
    Logger.debug("userid: ", userid, "game.user.id: ", game.user.id);
    if (Config.setting('isActive') && (!game.user.isGM || Config.setting('lockForGM'))) {

        // Check for allowed actions
        if (
            // Allow equip/unequip
            Config.setting('allowEquip') && (
                data?.system?.worn != null // tde5
                ||
                data?.system?.equipped != null // dnd5e
            )
        ) return true;

        if (!SheetLocker.isSilentMode) {
            ui.notifications.error("[" + Config.data.modTitle + "] " + Config.localize('sheetEditRejected.playerMsg'), {
                permanent: false,
                localize: false,
                console: false
            });
            if (Config.setting('alertGMOnReject')) {
                socket.executeForAllGMs("itemChangedGMAlertUIMessage", game.users.get(userid)?.name, item.name);
            }
        } else {
            SheetLocker.isSilentMode = false;
        }
        return false;
    }
}

function onItemDeletedFromSheet(item, options, userid) {
    Logger.debug("item:", item);
    Logger.debug("options: ", options);
    Logger.debug("userid: ", userid, "game.user.id: ", game.user.id);
    if (Config.setting('isActive') && (!game.user.isGM || Config.setting('lockForGM'))) {
        if (!SheetLocker.isSilentMode) {
            ui.notifications.error("[" + Config.data.modTitle + "] " + Config.localize('sheetEditRejected.playerMsg'), {
                permanent: false,
                localize: false,
                console: false
            });
            if (Config.setting('alertGMOnReject')) {
                socket.executeForAllGMs("itemDeletedGMAlertUIMessage", game.users.get(userid)?.name, item.name);
            }
        } else {
            SheetLocker.isSilentMode = false;
        }
        return false;
    }
}

/**
 * inspired by // https://github.com/LeafWulf/deathmark/blob/master/scripts/deathmark.js
 */
async function renderTokenOverlays() {
    for (const aToken of game.scenes.current.tokens) {
        if (aToken.actorLink) {
            // ensure that overlay is only rendered for the token's owner (the GM will implicitely see them for all owned tokens)
            const actor = game.actors.find((actor)=>{return (actor.id === aToken.actorId)});
            const overlayImg =(SheetLocker.isActive) ?
                        Config.setting('overlayIconLocked') : Config.setting('overlayIconOpen');
            if(actor.isOwner && !game.user.isGM) { // GM session must NOT generate overlays, otherwise ANY token will receive an icon
                await aToken.update({overlayEffect: overlayImg});
            }
        }
   }
}
function getButton() {
    return ui.controls.controls.find(control => control.name === "token").tools.find(tool => tool.name === "toggleSheetLocker");
}

async function onGameSettingChanged() {
    SheetLocker.isActive = Config.setting('isActive');

    if (game.user.isGM && Config.setting('notifyOnChange')) {
        // UI messages should only be triggered by the GM via sockets.
        // This seems to be the only way to suppress them if needed.
        if (!SheetLocker.isSilentMode) {
            socket.executeForEveryone("stateChangeUIMessage");
        } else {
            SheetLocker.isSilentMode = false;
        }
    }

    if (game.user.isGM) {

        // Refresh scene control button (if active) to reflect the potentially new state.
        let button = getButton();
        if (Config.setting('showUIButton')) {
            if (button == null) {
                renderControlButton(ui.controls.controls);
                button = getButton();
            }
            button.active = SheetLocker.isActive;
            ui.controls.render();
        } else if (button != null) {
            // if button has been deactivated, remove it from the scene controls
            ui.controls.controls.find(control => control.name === "token").tools.pop(button);
            ui.controls.render();
        }

        // Refresh status overlays
        socket.executeForEveryone("renderTokenOverlays")

    }
}

function stateChangeUIMessage() {
    let message =
        (SheetLocker.isActive ? Config.localize('onOffUIMessage.whenON') : Config.localize('onOffUIMessage.whenOFF'));

    if (Config.setting('notifyOnChange')) {

        if (SheetLocker.isActive) {
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
export class SheetLocker {
    static isActive = false;
    static #previousState;
    static isSilentMode;

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
     * @param silentMode if true, any UI messages related to this switch action will be suppressed (overriding game settings)
     * @returns {Promise<void>}
     */
    static async #switch(newStateIsON, silentMode = false) {
        SheetLocker.isSilentMode = silentMode;
        this.#previousState = this.isActive;
        // propagate change to the game settings, and wait for it to complete
        // It turned out to be much more stable here by waiting for game.settings to be updated.
        // Might be an ugly workaround, better ideas welcome!
        await Config.modifySetting('isActive', newStateIsON);
    }
}
