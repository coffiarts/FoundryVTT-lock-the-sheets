import {Config} from './config.js';
import {Logger} from './logger.js';

export class ControlButtonManager {

    static CONTROL_GROUPS = {};
    static init() {
        // Initialization of this list needs Config.
        // So it must be inside the init function, so that it can be called from outside when Config is ready
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
        };
    }

    buttons = [];

    /**
     * v13+ only
     * Register a button definition to be added to the control bar
     * @param controlButtonDef (group, tool)
     */
    registerButtonV13Plus(controlButtonDef) {
        if (Config.getGameMajorVersion() < 13) return;
        this.buttons.push({
            name: controlButtonDef.tool.name,
            group: controlButtonDef.group,
            tool: controlButtonDef.tool,
        });
        this.renderButtonsV13Plus();
        Logger.debug(`(registerButtonDefinition) - Button added: ${controlButtonDef.group}/${controlButtonDef.tool.name}`);
    }

    /**
     * v12 only
     * Inject the button definition into the scene control bar
     * @param controlButtonDef (group, tool)
     * @param controls
     */
    registerButtonV12(controlButtonDef, controls, active = true) {
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
    renderButtonsV13Plus() {
        if (Config.getGameMajorVersion() < 13) return;

        for (const button of this.buttons) {

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
    removeButtonV13Plus(buttonName) {
        if (Config.getGameMajorVersion() < 13) return;

        const button = this.buttons.find(b => b.name === buttonName);
        if (!button) return;

        const tokenGroup = ui.controls.controls[button.group];
        if (!tokenGroup) return;

        if (button.name in tokenGroup.tools) {
            delete tokenGroup.tools[button.name];
            this.buttons.splice(this.buttons.indexOf(button), 1);
            Logger.debug(`(removeButtons) - Button removed: ${button.group}/${button.name}`);
        }
        ui.controls.render();
    }

    /**
     * v13+ only
     * Remove all buttons from the control bar
     */
    removeAllButtonsV13Plus() {
        if (Config.getGameMajorVersion() < 13) return;
        for (const button of this.buttons) {
            this.removeButtonV13Plus(button.name);
        }
    }

    hasButton(buttonName) {
        Logger.debug("(hasButton) - searching:", buttonName);
        Logger.debug("(hasButton) - buttons", this.buttons.length);
        let found = this.buttons.some(b => b.name === buttonName);
        Logger.debug("(hasButton) - found:", found);
        return found;
    }

    /**
     * v13+ only
     * Toggle the button active state
     * @param buttonName
     * @param active
     * @return {Promise<unknown>}
     */
    toggleButtonStateV13(buttonName, active) {
        if (Config.getGameMajorVersion() < 13) return;
        Logger.debug(`(toggleButtonStateV13) - buttonName: ${buttonName}, active: ${active}`);
        const button = this.buttons.find(b => b.name === buttonName);
        if (!button) return;

        const tokenGroup = ui.controls.controls[button.group];
        if (!tokenGroup) return;

        if (button.name in tokenGroup.tools) {
            tokenGroup.tools[button.name].active = active;
            Logger.debug(`(toggleButtonStateV13) - Button ${button.group}/${button.name} set to active: ${active}`);
        }
        return new Promise(resolve => {
            resolve(ui.controls.render());
        });
    }
}

