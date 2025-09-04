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

        Hooks.once("ready", () =>  {
            ready2play = true;
            Logger.infoGreen(`Ready to play! Version: ${game.modules.get(Config.data.modID).version}`);
            Logger.infoGreen(Config.data.modDescription);
            LockTheSheets.isActive = Config.setting('isActive');

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
            Hooks.on("renderSceneControls", (controls) => {
                renderControlButton(controls);
            });
            Hooks.on("renderActorDirectory", (app, html) => {
                renderActorDirectoryOverlays(app, html);
            });
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
            renderControlButton(ui.controls);
            // ui.sidebar.render(true); // Is already done in renderControlButton()
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

function onSheetChanged(item, data, options, userid) {
    Logger.debug("(onSheetChanged) ",
        "item:", item,
        "data: ", data,
        "options: ", options,
        "userid: ", userid,
        "game.user.id: ", game.user.id);

    if (Config.setting('isActive') && !itemIsSheetLockActiveEffect(item) && (!game.user.isGM || Config.setting('lockForGM'))) {

        if (!LockTheSheets.isSilentMode) {
            ui.notifications.error("[" + Config.data.modTitle + "] " + Config.localize('sheetEditRejected.playerMsg'), {
                permanent: false,
                localize: false,
                console: false
            });
            if (Config.setting('alertGMOnReject')) {
                socket.executeForAllGMs("sheetEditGMAlertUIMessage", game.users.get(userid)?.name, item.name);
            }
        } else {
            LockTheSheets.isSilentMode = false;
        }
        return false;
    }
}

function onItemChangedInSheet(item, data, options, userid) {
    Logger.debug("(onItemChangedInSheet) ",
        "item:", item,
        "data: ", data,
        "options: ", options,
        "userid: ", userid,
        "game.user.id: ", game.user.id);

    if (Config.setting('isActive') && !itemIsSheetLockActiveEffect(item) && (!game.user.isGM || Config.setting('lockForGM'))) {

        // Allow equip/unequip
        if (Config.setting('allowEquip') && (
            data?.system?.worn != null // tde5
            ||
            data?.system?.equipped != null // dnd5e
        )) return true;

        if (!LockTheSheets.isSilentMode) {
            ui.notifications.error("[" + Config.data.modTitle + "] " + Config.localize('sheetEditRejected.playerMsg'), {
                permanent: false,
                localize: false,
                console: false
            });
            if (Config.setting('alertGMOnReject')) {
                socket.executeForAllGMs("itemChangedGMAlertUIMessage", game.users.get(userid)?.name, item.name);
            }
        } else {
            LockTheSheets.isSilentMode = false;
        }
        return false;
    }
}

function onItemDeletedFromSheet(item, options, userid) {
    Logger.debug("(onItemDeletedFromSheet) ",
        "item:", item,
        "options: ", options,
        "userid: ", userid,
        "game.user.id: ", game.user.id);

    if (Config.setting('isActive') && !itemIsSheetLockActiveEffect(item) && (!game.user.isGM || Config.setting('lockForGM'))) {

        if (!LockTheSheets.isSilentMode) {
            ui.notifications.error("[" + Config.data.modTitle + "] " + Config.localize('sheetEditRejected.playerMsg'), {
                permanent: false,
                localize: false,
                console: false
            });
            if (Config.setting('alertGMOnReject')) {
                socket.executeForAllGMs("itemDeletedGMAlertUIMessage", game.users.get(userid)?.name, item.name);
            }
        } else {
            LockTheSheets.isSilentMode = false;
        }
        return false;
    }
}

function itemIsSheetLockActiveEffect(item) {
    return item.name === getSheetLockActiveEffectName();
}

function getSheetLockActiveEffectName() {
    return 'Sheet Lock';
}

async function onGameSettingChanged() {
    LockTheSheets.isActive = Config.setting('isActive');

    if (game.user.isGM && Config.setting('notifyOnChange')) {
        // UI messages should only be triggered by the GM via sockets.
        // This seems to be the only way to suppress them if needed.
        if (!LockTheSheets.isSilentMode) {
            socket.executeForEveryone("stateChangeUIMessage");
        } else {
            LockTheSheets.isSilentMode = false;
        }
    }

    if (game.user.isGM) {

        // Refresh scene control button (if active) to reflect the potentially new state.
        let button = getControlButton();
        if (Config.setting('showUIButton')) {
            if (button == null) {
                renderControlButton(ui.controls);
                button = getControlButton();
            }
            button.active = LockTheSheets.isActive;
            ui.controls.render();
        } else if (button != null) {
            // if button has been deactivated, remove it from the scene controls
            if (Config.getGameMajorVersion() >= 13) {
                Logger.debug("onGameSettingChanged - ui.controls.controls.tokens.tools:", ui.controls.controls.tokens.tools);
                delete ui.controls.controls.tokens.tools.toggleLockTheSheets;
            }
            else { // v12 or older
                // requery actual button to ensure that it's properly deleted (this prevents sticky buttons caused by mod upgrades)
                button = ui.controls.controls.find(control => control.name === "token").tools.find(tool => tool.name = "toggleLockTheSheets");
                const tools = ui.controls.controls.find(control => control.name === "token").tools;
                Logger.debug("onGameSettingChanged: tools (before)", tools);
                Logger.debug("onGameSettingChanged: deleting button", button)
                delete tools.find(tool => tool.name !== button.name);
                Logger.debug("onGameSettingChanged: tools (after)", tools);
            }
            ui.controls.render();
        }
    }

    // Refresh status overlays
    renderTokenOverlays();
    ui.sidebar.render(true);
}

function renderControlButton(controls) {

    Logger.debug("renderControlButton", controls);
    Logger.debug("renderControlButton: Config.setting('showUIButton')", Config.setting('showUIButton'));
    Logger.debug("renderControlButton: game.user.isGM", game.user.isGM);
    if (game.user.isGM && Config.setting('showUIButton')) {

        Logger.debug(controls);
        let tokenControlTools = (Config.getGameMajorVersion() >= 13)
            ? controls.controls.tokens?.tools
            : controls?.controls?.find(control => control.name === "token")?.tools;
        Logger.debug("renderControlButton: tokenControlTools", tokenControlTools);
        // if (!tokenControlTools) return;

        let existing = (Config.getGameMajorVersion() >= 13)
            ? tokenControlTools.toggleLockTheSheets
            : tokenControlTools.find(tool => tool.name = "toggleLockTheSheets");
        Logger.debug("renderControlButton: existing", existing);
        if (!existing || existing.length === 0) {
            if (Config.getGameMajorVersion() >= 13) {
                tokenControlTools.toggleLockTheSheets = createControlButton(true);
                ui.controls.render();
            } else { // v12 or older
                tokenControlTools.push(createControlButton(true));
                ui.sidebar.render(true);
            }
        }
    }
}

function createControlButton(visible = true) {
    return {
        name: "toggleLockTheSheets",
        title: Config.localize('controlButton.label'),
        icon: "fa-solid fa-user-lock", // see https://fontawesome.com/search?o=r&m=free
        toggle: true,
        active: Config.setting('isActive'),
        visible: visible,
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
            const owner = findOwnerForActorName(actor.name);
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
            const owner = findOwnerForActorName(actorName);
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
            const owner = findOwnerForActorName(actorName);
            //if (owner) Logger.debug("\nactorName", actorName, "\nowner", owner);
            if (owner != null) { // skip any unowned characters
                const imgPath = (LockTheSheets.isActive) ? Config.setting('overlayIconLocked') : Config.setting('overlayIconOpen');
                element.innerHTML = overlayIconAsHTML(actorName, imgPath) + element.innerHTML;
                element.innerHTML = element.innerHTML.replace('data-src', 'src');
            }
        });
    }
}

function findOwnerForActorName(actorName) {
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

function getControlButton() {
    if (Config.getGameMajorVersion() >= 13) {
        const tokenControlTools = ui.controls.controls.tokens?.tools;
        return tokenControlTools?.toggleLockTheSheets || null;
    }
    else { // v12 and older
        return ui.controls.controls.find(control => control.name === "token").tools.find(tool => tool.name === "toggleLockTheSheets");
    }
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
        LockTheSheets.isSilentMode = silentMode;
        this.#previousState = this.isActive;
        // propagate change to the game settings, and wait for it to complete
        // It turned out to be much more stable here by waiting for game.settings to be updated.
        // Might be an ugly workaround, better ideas welcome!
        await Config.modifySetting('isActive', newStateIsON);
    }
}
