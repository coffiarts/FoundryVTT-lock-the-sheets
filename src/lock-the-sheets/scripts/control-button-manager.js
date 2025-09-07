import {Logger} from './logger.js';

export class ControlButtonManager {
    constructor(groupName = 'token') {
        this.groupName = groupName;
        this.tools = new Map(); // Store tools by name
        this._registerHook();
        Logger.debug(`(ControlButtonManager.constructor) Control button manager initialized: ${this.groupName}`);
    }

    _registerHook() {
        Hooks.on('getSceneControlButtons', controls => {
            let group;

            // v13: controls is a Record<string, SceneControl>
            if (typeof controls === 'object' && !Array.isArray(controls)) {
                group = controls[this.groupName];
                if (!group) return;
            }

            // v12 and earlier: controls is an array
            else if (Array.isArray(controls)) {
                const found = controls.find(g => g.name === this.groupName);
                if (!found) return;
                group = found;
            }

            // Deep clone the group to avoid mutating Foundry's internal state
            const clonedGroup = foundry.utils.deepClone(group);
            clonedGroup.activeTool ??= clonedGroup.tools[0]?.name;

            // Filter tools based on visibility
            const dynamicTools = Array.from(this.tools.values()).filter(tool => {
                return typeof tool.visible === 'function' ? tool.visible() : tool.visible !== false;
            });

            Logger.debug(dynamicTools);

            // Append custom tools safely
            clonedGroup.tools.push(...dynamicTools);
            Logger.debug("Added tools: ", dynamicTools);
            Logger.debug("Cloned group: ", clonedGroup);

            // Return updated structure
            if (Array.isArray(controls)) {
                return controls.map(g => (g.name === this.groupName ? clonedGroup : g));
            } else {
                controls[this.groupName] = clonedGroup;
                return controls;
            }
        });
    }

    addTool(toolConfig) {
        if (!toolConfig.name) throw new Logger.error(false, `Tool '${toolConfig.name}' is missing a name.`);
        if (!toolConfig.onClick) Logger.warn(false,`Tool '${toolConfig.name}' is missing an onClick handler.`);
        this.tools.set(toolConfig.name, toolConfig);
        this.refresh();
    }

    removeTool(toolName) {
        this.tools.delete(toolName);
        this.refresh();
    }

    setToolVisibility(toolName, visibleFnOrBool) {
        const tool = this.tools.get(toolName);
        if (tool) {
            tool.visible = visibleFnOrBool;
            this.tools.set(toolName, tool);
            this.refresh();
        }
    }

    setToolActiveState(toolName, activeState) {
        const tool = this.tools.get(toolName);
        if (tool) {
            tool.active = activeState;
            this.tools.set(toolName, tool);
            this.refresh();
        }
    }

    refresh() {
        if (ui.controls) {
            ui.controls.initialize(); // Rebuild control bar
            ui.controls.render();     // Re-render control bar
        }
    }
}

