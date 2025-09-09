import {Config} from './config.js';
import {Logger} from './logger.js';

export class ControlButtonManager {

    static buttons = [];

    static CONTROL_GROUPS = {};

    static init() {
        ControlButtonManager.CONTROL_GROUPS = {
            TOKENS: (Config.getGameMajorVersion() >= 13) ? "tokens" : "token",
            TEMPLATES: (Config.getGameMajorVersion() >= 13) ? "templates" : "measure",
            TILES: "items",
            DRAWINGS: "scenes",
            WALLS: "journal",
            LIGHTING: "compendium",
            SOUNDS: "settings",
            REGIONS: "community",
            NOTES: "artwork"
        };    }

    /**
     * v13+ only
     * Register a button definition to be added to the control bar
     * @param controlButtonDef (group, tool)
     * @return {Promise<void>}
     */
    static async registerButtonV13Plus(controlButtonDef) {
        if (Config.getGameMajorVersion() < 13) return;
        ControlButtonManager.buttons.push({
            name: controlButtonDef.tool.name,
            group: controlButtonDef.group,
            tool: controlButtonDef.tool,
        });
        ControlButtonManager.renderButtonsV13Plus();
        Logger.debug(`(registerButtonDefinition) - Button added: ${controlButtonDef.group}/${controlButtonDef.tool.name}`);
    }

    /**
     * v12 only
     * Inject the button definition into the scene control bar
     * @param controlButtonDef (group, tool)
     * @param controls
     */
    static registerButtonV12(controlButtonDef, controls, active = true) {
        if (Config.getGameMajorVersion() > 12) return;
        if (!active) return;

        const tokenGroup = controls.find(g => g.name === controlButtonDef.group);
        if (!tokenGroup) return;

        const exists = tokenGroup.tools.some(t => t.name === controlButtonDef.tool.name);
        if (!exists) {
            tokenGroup.tools.push(controlButtonDef.tool);
            Logger.debug(`(getV12SceneControlButtons) - Button added: ${controlButtonDef.group}/${controlButtonDef.tool.name}`);
        }
    }

    /**
     * v13+ only
     * Add the buttons to the control bar
     */
    static renderButtonsV13Plus() {
        if (Config.getGameMajorVersion() < 13) return;

        for (const button of ControlButtonManager.buttons) {

            const tokenGroup = ui.controls.controls[button.group];
            if (!tokenGroup) continue;

            if ((button.name in tokenGroup.tools)) {
                delete tokenGroup.tools[button.name];
            }

            tokenGroup.tools[button.name] = button.tool;

            ui.controls.render();     // ✅ Render updated controls
            Logger.debug(`(addButtons) - Button added: ${button.group}/${button.name}`);
        }
    }

    /**
     * v13+ only
     * Remove the buttons from the control bar
     */
    static removeButtonV13Plus(buttonName) {
        if (Config.getGameMajorVersion() < 13) return;

        const button = ControlButtonManager.buttons.find(b => b.name === buttonName);
        if (!button) return;

        const tokenGroup = ui.controls.controls[button.group];
        if (!tokenGroup) return;

        if (button.name in tokenGroup.tools) {
            delete tokenGroup.tools[button.name];
            ui.controls.render();
            ControlButtonManager.buttons.splice(ControlButtonManager.buttons.indexOf(button), 1);
            Logger.debug(`(removeButtons) - Button removed: ${button.group}/${button.name}`);
        }
    }

    /**
     * v13+ only
     * Remove all buttons from the control bar
     */
    static removeAllButtonsV13Plus() {
        if (Config.getGameMajorVersion() < 13) return;
        for (const button of ControlButtonManager.buttons) {
            ControlButtonManager.removeButtonV13Plus(button.name);
        }
    }
}

