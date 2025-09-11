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
     * v12 only
     * Called only once(!) on start from the getSceneControlButtonsHook.
     * Inject the button definition into the definitions array that will be used to build the control bar.
     * Any later modification needs to be done via the refreshUIButtonV12() function, which will then directly modify ui.contols.controls (like in the v13 implementation)
     * @param controlButtonDef (group, tool)
     * @param controlsArray This is NOT ui.controls.controls, but the array of control definitions we need to manipulate
     */
    registerButtonOnceV12(controlButtonDef, controlsArray) {
        if (Config.getGameMajorVersion() > 12) return;

        const tokenGroupDef = controlsArray.find(g => g.name === controlButtonDef.group);
        // Logger.debug(`(registerButtonV12) - tokenGroupDef.tools:`, tokenGroupDef.tools);
        if (!tokenGroupDef) return;

        controlButtonDef.tool.active = game.user.isGM && Config.setting('isActive');
        controlButtonDef.tool.visible = game.user.isGM && Config.setting('showUIButton');

        // Add our own control definition to the group
        tokenGroupDef.tools.push(controlButtonDef.tool);

        // Add to registry
        this.buttons.push({
            name: controlButtonDef.tool.name,
            group: controlButtonDef.group,
            tool: controlButtonDef.tool,
        });
        // Logger.debug(`(registerButtonV12) - Button added: ${controlButtonDef.group}/${controlButtonDef.tool.name}`, controlButtonDef.tool);
    }

    /**
     * v12 only
     * Called every time AFTER game load when a button needs to rerendered.
     * Other than registerButtonOnceV12, now we're manipulating ui.controls.controls directly.
     * @param controlButtonDef (group, tool)
     */
    refreshUIButtonV12(controlButtonDef) {
        if (Config.getGameMajorVersion() > 12) return;

        const tokenGroup = ui.controls.controls?.find(g => g.name === controlButtonDef.group);
        if (!tokenGroup) return;

        // Remove existing button
        tokenGroup.tools = tokenGroup.tools.filter(t => t.name !== controlButtonDef.tool.name);

        // Inject updated button
        controlButtonDef.tool.active = game.user.isGM && Config.setting('isActive');
        controlButtonDef.tool.visible = game.user.isGM && Config.setting('showUIButton');
        tokenGroup.tools.push(controlButtonDef.tool);

        // Re-render control bar
        ui.controls.render();
    }

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
        // Logger.debug(`(registerButtonDefinition) - Button added: ${controlButtonDef.group}/${controlButtonDef.tool.name}`);
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
            // Logger.debug(`(addButtons) - Button added: ${button.group}/${button.name}`, button.tool);
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
            // Logger.debug(`(removeButtons) - Button removed: ${button.group}/${button.name}`, button.tool);
        }
        ui.controls.render();
    }

    hasButton(buttonName) {
        return this.buttons.some(b => b.name === buttonName);
    }
}

