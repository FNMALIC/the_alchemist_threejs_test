// interactionPrompt.js - The quiet prompt under the crosshair ("E  Examine"), and the crosshair
// opening into a faint ring while something is in focus. Driven only by the interaction
// system's events, so the page is touched when the target changes, never every frame.
// Styles: #interaction-prompt and #crosshair.focused in index.html.

export class InteractionPrompt {
    // element: the prompt (with .key and .label inside); crosshair: the crosshair element
    constructor(interaction, { element, crosshair = null }) {
        this.element = element;
        this.key = element.querySelector('.key');
        this.label = element.querySelector('.label');
        this.crosshair = crosshair;

        interaction.addEventListener('targetchange', ({ interactable }) => this.show(interactable));
        // While a longer interaction plays out, the prompt steps back
        interaction.addEventListener('interact', () => element.classList.add('busy'));
        interaction.addEventListener('interactend', () => element.classList.remove('busy'));
    }

    // interactable: what is in focus, or null to hide
    show(interactable) {
        const visible = interactable !== null;
        if (visible) {
            this.label.textContent = interactable.prompt;
            this.key.hidden = !interactable.interact; // Something only to look at has no key to press
        }
        this.element.classList.toggle('visible', visible);
        this.crosshair?.classList.toggle('focused', visible);
    }
}
