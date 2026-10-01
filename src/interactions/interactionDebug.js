// interactionDebug.js - Development only: a small readout of what the gaze rests on, and the
// interaction events in the console. main.js loads it only in the dev server with ?debug, so it
// is never part of the experience or of a production build.

const REFRESH = 0.1; // Seconds between readout updates

export class InteractionDebug {
    // environment: optional, to show what responds to the player nearby
    constructor(interaction, environment = null) {
        this.interaction = interaction;
        this.environment = environment;
        this.elapsed = REFRESH;
        this.text = '';

        this.element = document.createElement('div');
        Object.assign(this.element.style, {
            position: 'absolute',
            top: '10px',
            left: '12px',
            padding: '6px 9px',
            borderRadius: '6px',
            background: 'rgba(10, 10, 18, 0.55)',
            color: 'rgba(255, 250, 240, 0.8)',
            font: '11px/1.5 ui-monospace, Consolas, monospace',
            whiteSpace: 'pre',
            pointerEvents: 'none'
        });
        document.body.appendChild(this.element);

        ['focus', 'blur', 'interact', 'interactend'].forEach(type => {
            interaction.addEventListener(type, ({ interactable }) => {
                console.debug(`[interaction] ${type}: ${interactable.id}`);
            });
        });
    }

    update(delta) {
        this.elapsed += delta;
        if (this.elapsed < REFRESH) return;
        this.elapsed = 0;

        const { target, targetDistance, state, distance, registry } = this.interaction;
        const lines = [
            `Interaction target: ${target ? target.id : 'none'}`,
            `Distance: ${target ? `${targetDistance.toFixed(2)}m` : '-'}`,
            `State: ${state}`,
            `Reach: ${distance}m · registered: ${registry.size}`
        ];
        const environment = this.environment;
        if (environment) {
            const near = environment.near.map(item => item.id).join(', ') || 'nothing';
            lines.push(`Near: ${near}`);
            lines.push(`Moving: ${environment.moving.length} · reactive: ${environment.reactives.length} · particles: ${environment.particles.alive}`);
        }
        const text = lines.join('\n');
        if (text !== this.text) {
            this.text = text;
            this.element.textContent = text;
        }
    }
}
