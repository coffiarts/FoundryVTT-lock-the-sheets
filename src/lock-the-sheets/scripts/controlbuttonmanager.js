import {Config} from './config.js';
import {Logger} from './logger.js';
import {LockTheSheets} from "./main.js";

export class ControlButtonManager {

    static CONTROL_GROUPS = {};
    static init() {
        // Initialization of this list needs Config.
        // So it must be inside the init function, so that it can be called from outside when Config is ready
        ControlButtonManager.CONTROL_GROUPS = {
            TOKENS: "tokens",
            TEMPLATES: "templates",
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
     * Register a button definition to be added to the control bar
     * @param controlButtonDef (group, tool)
     */
    registerButton(controlButtonDef) {
        this.buttons.push({
            name: controlButtonDef.tool.name,
            group: controlButtonDef.group,
            tool: controlButtonDef.tool,
        });
        this.renderButtons();
        // Logger.debug(`(registerButtonDefinition) - Button added: ${controlButtonDef.group}/${controlButtonDef.tool.name}`);
    }

    /**
     * Add the buttons to the control bar
     */
    renderButtons() {
        for (const button of this.buttons) {

            const tokenGroup = ui.controls.controls[button.group];
            if (!tokenGroup) continue;

            if ((button.name in tokenGroup.tools)) {
                delete tokenGroup.tools[button.name];
            }

            tokenGroup.tools[button.name] = button.tool;

            ui.controls.render();     // ✅ Render updated controls
            // Logger.debug(`(addButtons) - Button added: ${button.group}/${button.name}`, button.tool);
        }
    }

    /**
     * Remove the buttons from the control bar
     */
    removeButtonV13Plus(buttonName) {
        const button = this.buttons.find(b => b.name === buttonName);
        if (!button) return;

        const tokenGroup = ui.controls.controls[button.group];
        if (!tokenGroup) return;

        if (button.name in tokenGroup.tools) {
            delete tokenGroup.tools[button.name];
            this.buttons.splice(this.buttons.indexOf(button), 1);
            // Logger.debug(`(removeButtons) - Button removed: ${button.group}/${button.name}`, button.tool);
        }
        ui.controls.render();
    }

    hasButton(buttonName) {
        return this.buttons.some(b => b.name === buttonName);
    }
}

