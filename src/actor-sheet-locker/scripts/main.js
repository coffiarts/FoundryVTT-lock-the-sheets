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
        console.log("Actor Sheet Locker | Initializing Module");

        await allPrerequisitesReady();

        Hooks.once("ready", () =>  {
            ready2play = true;
            Logger.infoGreen(`Ready to play! Version: ${game.modules.get(Config.data.modID).version}`);
            Logger.info(Config.data.modDescription);
            if (Config.setting('isActive')) {
                ActorSheetLocker.switchOn();
                ActorSheetLocker.stateChangeUIMessage();
            } else {
                ActorSheetLocker.switchOff();
            }
        });

        Hooks.on("preUpdateActor", function (actor, data, options, userid) {
            return ActorSheetLocker.onCharacterSheetChanged(actor, data, options, userid);
        });
        Hooks.on("preUpdateItem", function (item, data, options, userid) {
            return ActorSheetLocker.onCharacterSheetChanged(item, data, options, userid);
        });
        Hooks.on("preDeleteItem", function (item, data, options, userid) {
            return ActorSheetLocker.onCharacterSheetChanged(item, data, options, userid);
        });
        Hooks.on("preUpdateItem", function (item, data, options, userid) {
            return ActorSheetLocker.onCharacterSheetChanged(item, data, options, userid);
        });
        Hooks.on("preCreateItem", function (item, data, options, userid) {
            return ActorSheetLocker.onCharacterSheetChanged(item, data, options, userid);
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
            ActorSheetLocker.onGameSettingChanged();
        }
    });
    Logger.debug("Exposed classes are ready");
}

async function initSocketlib() {
    socket = socketlib.registerModule(Config.data.modID);
    socket.register("stateChangeUIMessage", ActorSheetLocker.stateChangeUIMessage);
    Logger.debug(`Module ${Config.data.modID} registered in socketlib.`);
}
/**
 * Public class for accessing this module through macro code
 */
export class ActorSheetLocker {
    static #isActive = false;
    static #previousState;
    static #isSilentMode;

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

    static isOn() {
        return this.#isActive;
    }

    static isOff() {
        return !this.#isActive;
    }

    /**
     *
     * @param newStateIsON
     * @param silentMode if true, any UI messages related to this switch action will be suppressed (overriding game settings)
     * @returns {Promise<void>}
     */
    static async #switch(newStateIsON, silentMode = false) {
        this.#isSilentMode = silentMode;
        this.#previousState = this.#isActive;
        // propagate change to the game settings, and wait for it to complete
        // It turned out to be much more stable here by waiting for game.settings to be updated.
        // Might be an ugly workaround, better ideas welcome!
        await Config.modifySetting('isActive', newStateIsON);
    }

    static onCharacterSheetChanged(actorOrItem, data, options, userid) {
        Logger.info("actorOrItem:", actorOrItem);
        Logger.info("data: ", data);
        Logger.info("options: ", options);
        Logger.info("userid: ", userid, "game.user.id: ", game.user.id);
        if (!game.user.isGM && Config.setting('isActive')) {
            ui.notifications.warn(Config.data.modTitle + " | Sheet editing is locked! Change won't be saved.", {
                permanent: false,
                localize: false,
                console: false
            });
            return false;
        }
    }

    static onGameSettingChanged() {
        this.#isActive = Config.setting('isActive');

        if (game.user.isGM && Config.setting('notifyOnChange')) {
            // UI messages should only be triggered by the GM via sockets.
            // This seems to be the only way to suppress them if needed.
            if (!this.#isSilentMode) {
                socket.executeForEveryone("stateChangeUIMessage");
            } else {
                this.#isSilentMode = false;
            }
        }
    }

    static stateChangeUIMessage() {
        let message =
            (ActorSheetLocker.#isActive ? Config.localize('onOffUIMessage.whenON') : Config.localize('onOffUIMessage.whenOFF'));

        if (ActorSheetLocker.#isActive && Config.setting('warnWhenON') ||
            !ActorSheetLocker.#isActive && Config.setting('warnWhenOFF')) {
            if (Config.setting('notifyOnChange')) {
                ui.notifications.warn(Config.data.modTitle + " " + message, {
                    permanent: false,
                    localize: false,
                    console: false
                });
            }
            Logger.warn(true, message);
        } else {
            ui.notifications.info(Config.data.modTitle + " " + message, {
                permanent: false,
                localize: false,
                console: false
            });
            Logger.info(message);
        }
    }

}
