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
let permanentUIMsgID;

/**
 * Global initializer block:
 * First of all, we need to initialize a lot of stuff in correct order:
 */
(async () => {
        console.log("Actor Sheet Locker | Initializing Module");

        await allPrerequisitesReady();

        Hooks.once("ready", () =>  {
            ready2play = true;
            Logger.infoGreen(`Ready to play! Version: ${game.modules.get(Config.data.modID).version}`);
            Logger.info(Config.data.modDescription);
            if (Config.setting('isActive')) {
                ActorSheetLocker.switchOn();
                stateChangeUIMessage();
            } else {
                ActorSheetLocker.switchOff();
            }
        });

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
    window.ActorSheetLocker = ActorSheetLocker;
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
    Logger.debug(`Module ${Config.data.modID} registered in socketlib.`);
}

function renderControlButton(controls) {
    if (game.user.isGM) {
        let tokenControls = controls.find(control => control.name === "token")
        tokenControls.tools.push({
            name: "toggleActorSheetLocker",
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
        if (!ActorSheetLocker.isSilentMode) {
            ui.notifications.error("[" + Config.data.modTitle + "] " + Config.localize('sheetEditRejected.playerMsg'), {
                permanent: false,
                localize: false,
                console: false
            });
            if (Config.setting('alertGMOnReject')) {
                socket.executeForAllGMs("sheetEditGMAlertUIMessage", game.users.get(userid)?.name, actorOrItem.name);
            }
        } else {
            ActorSheetLocker.isSilentMode = false;
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

        // check if event is allowed
        if (
            data?.system?.worn != null
        ) return true;

        if (!ActorSheetLocker.isSilentMode) {
            ui.notifications.error("[" + Config.data.modTitle + "] " + Config.localize('sheetEditRejected.playerMsg'), {
                permanent: false,
                localize: false,
                console: false
            });
            if (Config.setting('alertGMOnReject')) {
                socket.executeForAllGMs("itemChangedGMAlertUIMessage", game.users.get(userid)?.name, item.name);
            }
        } else {
            ActorSheetLocker.isSilentMode = false;
        }
        return false;
    }
}

function onItemDeletedFromSheet(item, options, userid) {
    Logger.debug("item:", item);
    Logger.debug("options: ", options);
    Logger.debug("userid: ", userid, "game.user.id: ", game.user.id);
    if (Config.setting('isActive') && (!game.user.isGM || Config.setting('lockForGM'))) {
        if (!ActorSheetLocker.isSilentMode) {
            ui.notifications.error("[" + Config.data.modTitle + "] " + Config.localize('sheetEditRejected.playerMsg'), {
                permanent: false,
                localize: false,
                console: false
            });
            if (Config.setting('alertGMOnReject')) {
                socket.executeForAllGMs("itemDeletedGMAlertUIMessage", game.users.get(userid)?.name, item.name);
            }
        } else {
            ActorSheetLocker.isSilentMode = false;
        }
        return false;
    }
}

function onGameSettingChanged() {
    ActorSheetLocker.isActive = Config.setting('isActive');

    if (game.user.isGM && Config.setting('notifyOnChange')) {
        // UI messages should only be triggered by the GM via sockets.
        // This seems to be the only way to suppress them if needed.
        if (!ActorSheetLocker.isSilentMode) {
            socket.executeForEveryone("stateChangeUIMessage");
        } else {
            ActorSheetLocker.isSilentMode = false;
        }
    }

    // Refresh scene control button to reflect new state of "isActive".
    ui.controls.controls.find(control => control.name === "token").tools.find(tool => tool.name === "toggleActorSheetLocker").active = ActorSheetLocker.isActive;
    ui.controls.render();
}

function stateChangeUIMessage() {
    let message =
        (ActorSheetLocker.isActive ? Config.localize('onOffUIMessage.whenON') : Config.localize('onOffUIMessage.whenOFF'));

    if (Config.setting('notifyOnChange')) {

        let isPermanent = (
            ActorSheetLocker.isActive &&  Config.setting('notifyPermanentlyWhileLOCKED')
            ||
            !ActorSheetLocker.isActive &&  Config.setting('notifyPermanentlyWhileUNLOCKED')
        );

        // Clear previous permanent msg (if any)
        if (permanentUIMsgID != null) {
            ui.notifications.remove(permanentUIMsgID);
        }

        if (ActorSheetLocker.isActive) {
            permanentUIMsgID = ui.notifications.error(`[${Config.data.modTitle}] ${message}`, {
                permanent: isPermanent,
                localize: false,
                console: false
            });
        } else {
            permanentUIMsgID = ui.notifications.info(`[${Config.data.modTitle}] ${message}`, {
                permanent: isPermanent,
                localize: false,
                console: false
            });
        };
        if (!isPermanent) permanentUIMsgID = null;
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
export class ActorSheetLocker {
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
        ActorSheetLocker.isSilentMode = silentMode;
        this.#previousState = this.isActive;
        // propagate change to the game settings, and wait for it to complete
        // It turned out to be much more stable here by waiting for game.settings to be updated.
        // Might be an ugly workaround, better ideas welcome!
        await Config.modifySetting('isActive', newStateIsON);
    }
}
