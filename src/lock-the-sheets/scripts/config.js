import {Logger} from './logger.js';
import {LockTheSheets} from "./main.js";
import {ControlButtonManager} from "./controlbuttonmanager.js";

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

    static OVERLAY_ICONS = {
        locked: `${Config.data.modPath}/artwork/lock-red-closed.png`,
        open: `${Config.data.modPath}/artwork/lock-green-open.png`
    }

    static OVERLAY_SCALE_MAPPING = { zero: 0, small: 0.2, normal: 0.3, large: 0.4 };

    static getUIButtonDefinition() {
        if (Config.getGameMajorVersion() >= 13) {
            // v13 or newer: use onChange handler instead of onClick handler
            return {
                group: ControlButtonManager.CONTROL_GROUPS.TOKENS,
                tool: {
                    name: 'lockTheSheets', // this MUST be a js code-compatible property name (i.e. no blanks, no spaces, no hyphens, no special chars!)
                    title: Config.localize('controlButton.label'),
                    icon: "fa-solid fa-user-lock", // see https://fontawesome.com/search?o=r&m=free
                    button: true,
                    toggle: true,
                    active: () => (game.user.isGM && Config.setting('isActive')),
                    visible: () => (game.user.isGM && Config.setting('showUIButton')),
                    onChange: () => {
                        Config.toggleActiveState();
                    }
                }
            }
        } else {
            // v12: use onClick handler instead of onChange handler
            return {
                group: ControlButtonManager.CONTROL_GROUPS.TOKENS,
                tool: {
                    name: 'lockTheSheets', // this MUST be a js code-compatible property name (i.e. no blanks, no spaces, no hyphens, no special chars!)
                    title: Config.localize('controlButton.label'),
                    icon: "fa-solid fa-user-lock", // see https://fontawesome.com/search?o=r&m=free
                    button: true,
                    toggle: true,
                    active: () => (game.user.isGM && Config.setting('isActive')),
                    visible: () => (game.user.isGM && Config.setting('showUIButton')),
                    onClick: () => {
                        Config.toggleActiveState();
                    }
                }
            }
        }
    }

    static toggleActiveState() {
        const active = !Config.setting('isActive');
        Logger.debug("UI button onClick", active);
        Config.modifySetting('isActive', active);
    }

    static init() {

        // Register all globally relevant game settings here

        const settingsData1 = {
            modVersion: {
                scope: 'client', config: true, type: String, default: game.modules.get(MOD_ID).version,
                onChange: value => {
                    if (value !== game.modules.get(MOD_ID).version) {
                        // This "pseudo-setting" is meant for display only.
                        // So we always want it to snap back to its default on change
                        game.settings.set(Config.data.modID, `modVersion`, game.modules.get(MOD_ID).version);
                    }
                }
            }
        }
        Config.registerSettings(settingsData1);

        // create separator and title at the beginning of this settings section
        if (Config.getGameMajorVersion() >= 13) {
            Hooks.on('renderSettingsConfig', (app, html) => {
                // Core
                let formGroup = html.querySelector(`#settings-config-${Config.data.modID.replace(/\./g, "\\.")}\\.isActive`).closest(".form-group");
                formGroup?.insertAdjacentHTML("beforebegin", `<div><h4 style="margin-top: 0; border-bottom: 1px solid #888; padding-bottom: 4px; margin-bottom: 6px;">Core</h4></div>`);
                // UI
                formGroup = html.querySelector(`#settings-config-${Config.data.modID.replace(/\./g, "\\.")}\\.alertGMOnReject`).closest(".form-group");
                formGroup?.insertAdjacentHTML("beforebegin", `<div><h4 style="margin-top: 0; border-bottom: 1px solid #888; padding-bottom: 4px; margin-bottom: 6px;">UI</h4></div>`);
            });
        }
        else {
            Hooks.on('renderSettingsConfig', (app, [html]) => {
                // Core
                html.querySelector(`[data-setting-id="${Config.data.modID}.isActive"]`)?.insertAdjacentHTML('beforeBegin', `<h3>Core</h3>`)
                // UI
                html.querySelector(`[data-setting-id="${Config.data.modID}.alertGMOnReject"]`)?.insertAdjacentHTML('beforeBegin', `<h3>UI</h3>`)
            });
        }

        const settingsData2 = {
            isActive: {
                scope: 'world', config: true, type: Boolean, default: false,
            },
            allowEquip: {
                scope: 'world', config: true, type: Boolean, default: true
            },
            lockForGM: {
                scope: 'world', config: true, type: Boolean, default: false
            },
            alertGMOnReject: {
                scope: 'world', config: true, type: Boolean, default: true
            },
            notifyOnChange: {
                scope: 'world', config: true, type: Boolean, default: true
            },
            showOverlayLocked: {
                scope: 'world', config: true, type: Boolean, default: false
            },
            showOverlayOpen: {
                scope: 'world', config: true, type: Boolean, default: true
            },
            overlayScale: {
                scope: 'world', config: true, type: String,
                choices: {
                    "zero": Config.localize("setting.overlayScaleOptions.zero"),
                    "small": Config.localize("setting.overlayScaleOptions.small"),
                    "normal": Config.localize("setting.overlayScaleOptions.normal"),
                    "large": Config.localize("setting.overlayScaleOptions.large")
                },
                default: "normal",
                render: "radio"
            },
            showHUDIconLocked: {
                scope: 'world', config: true, type: Boolean, default: true,
            },
            showHUDIconOpen: {
                scope: 'world', config: true, type: Boolean, default: true,
            },
            hudIconTimeoutSeconds: {
                scope: 'world', config: true, type: Number, default: 5,
                range: {                 // define a slider
                    min: 0,
                    max: 10,
                    step: 1
                }
            },
            showUIButton: {
                scope: 'world', config: true, type: Boolean, default: true,
            },
        };
        Config.registerSettings(settingsData2);

        // Add the keybinding
        game.keybindings.register("lock-the-sheets", "active", {
            name: Config.localize('setting.keybindingNames.toggle'),
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

        game.keybindings.register("lock-the-sheets", "scale: zero", {
            name: Config.localize('setting.keybindingNames.scaleZero'),
            editable: [],
            restricted: true,
            onDown: () => {
                if (!game.user.isGM) {
                    return;
                }
                Config.modifySetting('overlayScale', 'zero');
            }
        });

        game.keybindings.register("lock-the-sheets", "scale: small", {
            name: Config.localize('setting.keybindingNames.scaleSmall'),
            editable: [],
            restricted: true,
            onDown: () => {
                if (!game.user.isGM) {
                    return;
                }
                Config.modifySetting('overlayScale', 'small');
            }
        });

        game.keybindings.register("lock-the-sheets", "scale: normal", {
            name: Config.localize('setting.keybindingNames.scaleNormal'),
            editable: [],
            restricted: true,
            onDown: () => {
                if (!game.user.isGM) {
                    return;
                }
                Config.modifySetting('overlayScale', 'normal');
            }
        });

        game.keybindings.register("lock-the-sheets", "scale: large", {
            name: Config.localize('setting.keybindingNames.scaleLarge'),
            editable: [],
            restricted: true,
            onDown: () => {
                if (!game.user.isGM) {
                    return;
                }
                Config.modifySetting('overlayScale', 'large');
            }
        });

        game.keybindings.register("lock-the-sheets", "showUIButton", {
            name: Config.localize('setting.showUIButton.name'),
            editable: [],
            restricted: true,
            onDown: () => {
                if (!game.user.isGM) {
                    return;
                }
                Config.modifySetting('showUIButton', !Config.setting('showUIButton'));
            }
        });

        Logger.info("Empty keybindings registered. Assign them to your liking in the game settings.");

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
        while (safetyCount++ < 10 && game.settings.get(Config.data.modID, key) !== expectedValue) {
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

    static escapeHtmlAttr(str) {
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    static getGameMajorVersion() {
        return game.version.split('.')[0];
    }

    static getActorSheetAppClassName() {
        let className;
        switch (game.system.id) {
            case "dnd5e":
                className = (Config.getGameMajorVersion() >= 13) ? "CharacterActorSheet" : "ActorSheet5eCharacter2";
                break;
            case "dsa5":
                className = "ActorSheetdsa5Character";
                break;
        }
        Logger.debug("(getActorSheetAppClassName) classname:", className);
        return className;
    }

    static getActorSheetCSSQuerySelector() {
        let querySelector;
        switch (game.system.id) {
            case "dnd5e":
                querySelector = (Config.getGameMajorVersion() >= 13) ? ".application.sheet.dnd5e2.actor.standard-form.character" : ".app.window-app.dnd5e2.sheet.actor.character";
                break;
            case "dsa5":
                querySelector = "ActorSheetdsa5Character";
                break;
        }
        Logger.debug("(getActorSheetCSSQuerySelector) querySelector:", querySelector);
        return querySelector;
    }
}
