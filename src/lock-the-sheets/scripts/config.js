import {Logger} from './logger.js';
import {LockTheSheets} from "./main.js";

// keep values in sync with module.json!
const MOD_ID = "lock-the-sheets";
const MOD_PATH = `/modules/${MOD_ID}`;
const MOD_TITLE = "Lock The Sheets!";
const MOD_DESCRIPTION = "Oh Game Master, thou shalt be the gatekeeper! Lock and unlock all your players' character sheets at once with just one click. May you never ever again watch them accidentally delete that beloved item from their inventory (\"Uuuugh... NOOOOO!\")... or let those nasty cheaters among them mess around secretly with their hitpoints (\"AAAAArrrrgh!\").";
const MOD_LINK = `https://github.com/coffiarts/FoundryVTT-${MOD_ID}`;

export class Config {
    static data = {
        modID: MOD_ID,
        modPath: MOD_PATH,
        modTitle: MOD_TITLE,
        modDescription: MOD_DESCRIPTION,
        modlink: MOD_LINK
    };

    static init() {

        // Register all globally relevant game settings here
        const data = {
            modVersion: {
                scope: 'client', config: true, type: String, default: game.modules.get(MOD_ID).version,
                onChange: value => {
                    if (value !== game.modules.get(MOD_ID).version) {
                        // This "pseudo-setting" is meant for display only.
                        // So we always want to snap back to its default on change
                        game.settings.set(Config.data.modID, `modVersion`, game.modules.get(MOD_ID).version);
                    }
                }
            },
            isActive: {
                scope: 'world', config: true, type: Boolean, default: false,
            },
            showUIButton: {
                scope: 'world', config: true, type: Boolean, default: true,
            },
            notifyOnChange: {
                scope: 'world', config: true,  type: Boolean, default: true
            },
            lockForGM: {
                scope: 'world', config: true, type: Boolean, default: false
            },
            alertGMOnReject: {
                scope: 'world', config: true, type: Boolean, default: true
            },
            overlayIconLocked: {
                scope: 'world', config: true, type: String, filePicker: "image", default: `${Config.data.modPath}/artwork/lock-red-closed.png`
            },
            overlayIconOpen: {
                scope: 'world', config: true, type: String, filePicker: "image", default: `${Config.data.modPath}/artwork/lock-green-open.png`
            },
            allowEquip: {
                scope: 'world', config: true, type: Boolean, default: true
            }
        };
        Config.registerSettings(data);

        // Add the keybinding
        game.keybindings.register("lock-the-sheets", "active", {
            name: Config.localize('keybindingMenuLabel'),
            editable: [
                //{ key: "KeyL", modifiers: [KeyboardManager.MODIFIER_KEYS.SHIFT] }
            ],
            restricted: true,
            onDown: () => {
                if (!game.user.isGM) {
                    return;
                }
                LockTheSheets.toggle();
            }
        });
        Logger.info("Empty keybinding registered. Assign it to your liking in the game settings.");

        // Whenever loading up, we need to adjust the "pseudo-setting" modVersion once to the current value from
        // the manifest. Otherwise, module updates won't be reflected in its value (users would always see their first
        // installed version ever in the settings menu).
        game.settings.set(Config.data.modID, 'modVersion', game.modules.get(MOD_ID).version);
        Logger.debug("(Config.init) All game settings registered)");

    }

    static registerSettings(settingsData) {
        Object.entries(settingsData).forEach(([key, data]) => {
            let name = Config.localize(`setting.${key}.name`);
            let hint = Config.localize(`setting.${key}.hint`);
            game.settings.register(
                Config.data.modID, key, {
                    name: name,
                    hint: hint,
                    ...data
                }
            );
            Logger.debug("(Config.registerSettings) Game Setting registered:", name);
        });
    }

    static setting(key) {
        return game.settings.get(Config.data.modID, key);
    }

    static async modifySetting(key, newValue) {
        // Logger.debug("Change of game.settings requested by module:", key, "=>", newValue);
        game.settings.set(Config.data.modID, key, newValue);

        // It turned out to be much more stable here by waiting for game.settings to be updated.
        // Might be an ugly workaround, better ideas welcome!
        return new Promise(resolve => {
            resolve(this.gameSettingConfirmed(key, newValue));
        });
    }

    static async gameSettingConfirmed(key, expectedValue) {
        // Logger.debug(`expected: ${Config.data.modID}.${key} = ${expectedValue}`);
        let safetyCount = 0;
        while (safetyCount++ <10 && game.settings.get(Config.data.modID, key) !== expectedValue) {
            await this.sleep(500);
        }
    }

    static async sleep(msec) {
        Logger.debug(`(Config.sleep) Waiting for ${msec} msec. Zzzzzz....`)
        return new Promise(resolve => setTimeout(resolve, msec));
    }

    /**
     * Returns the localized string for a given module scoped i18n key
     *
     * @ignore
     * @static
     * @param {*} key
     * @returns {string}
     * @memberof Config
     */
    static localize(key) {
        return game.i18n.localize(`${Config.data.modID}.${key}`);
    }

    static format(key, data) {
        return game.i18n.format(`${Config.data.modID}.${key}`, data);
    }


}
