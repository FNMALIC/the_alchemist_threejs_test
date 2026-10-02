// crestSeat.js - Sit on any high dune crest and watch, for as long as you like. Standing still on
// a ridge, a quiet "E — sit here" appears; E (or a tap) sits you down where you are, facing
// wherever you were looking. E again, or starting to walk, gets you up.
const SIT_EXPOSURE = 0.35; // How far above the ground around you a crest must rise (Soundscape.exposure)
const SIT_HEIGHT = 3.5; // Metres: only real dunes, not ripples
const STILL_SPEED = 0.6; // m/s: you have to stop first

export class CrestSeat {
    // player: PlayerController; heightAt(x, z); hint: the prompt's element
    // allowed(): whether sitting here is possible now (not during the story's own moments)
    constructor(player, heightAt, hint, allowed = () => true) {
        this.player = player;
        this.heightAt = heightAt;
        this.hint = hint;
        this.allowed = allowed;
        this.seated = false; // Sitting on a crest (not the story's last seat)
        this.canSit = false;
        this.shownFor = 0;

        document.addEventListener('keydown', event => {
            if (event.code !== 'KeyE' || event.repeat || !player.isLocked) return;
            if (this.seated) player.standUp();
            else if (this.canSit) this.sit();
        });
        player.addEventListener('stand', () => {
            this.seated = false;
        });
    }

    sit() {
        const { x, z } = this.player.eye;
        this.player.sit(x, z, undefined, undefined, { permanent: false });
        this.seated = true;
        this.shownFor = 0;
    }

    // exposure: -1 deep in a hollow .. 1 on a crest (see soundscape.js)
    update(delta, exposure) {
        const player = this.player;
        const { x, z } = player.eye;
        this.canSit = !this.seated && !player.seated && player.isLocked && this.allowed() &&
            exposure > SIT_EXPOSURE && this.heightAt(x, z) > SIT_HEIGHT && player.movement.speed < STILL_SPEED;

        // Once seated, the way back up is shown for a moment, then left alone
        if (this.seated) this.shownFor += delta;
        const touch = player.touch;
        const text = this.seated ? (touch ? 'Get up' : 'E — get up') : (touch ? 'Sit here' : 'E — sit here');
        if (this.hint.textContent !== text) this.hint.textContent = text;
        this.hint.classList.toggle('visible', this.canSit || (this.seated && this.shownFor < 5));
    }
}
