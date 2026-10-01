// spatialGrid.js - Reactive things sorted into square cells on the ground, so the environment only
// ever looks at the few near the player (or near a footstep), never at all of them.
// Queries fill an array the caller passes in: nothing is allocated while playing.

const CELL_SIZE = 4; // Metres
const OFFSET = 4096; // Cell coordinates are shifted positive so each cell gets a unique number

export class SpatialGrid {
    constructor(cellSize = CELL_SIZE) {
        this.cellSize = cellSize;
        this.cells = new Map(); // Cell number -> items in it
        this.cellOf = new Map(); // Item -> its cell number
    }

    cellAt(x, z) {
        const cx = Math.floor(x / this.cellSize) + OFFSET;
        const cz = Math.floor(z / this.cellSize) + OFFSET;
        return cx * OFFSET * 2 + cz;
    }

    insert(item, x, z) {
        const cell = this.cellAt(x, z);
        let items = this.cells.get(cell);
        if (!items) this.cells.set(cell, items = []);
        items.push(item);
        this.cellOf.set(item, cell);
    }

    remove(item) {
        const cell = this.cellOf.get(item);
        if (cell === undefined) return;
        const items = this.cells.get(cell);
        items.splice(items.indexOf(item), 1);
        if (items.length === 0) this.cells.delete(cell);
        this.cellOf.delete(item);
    }

    // The item is now at (x, z): move it to another cell if it crossed into one
    move(item, x, z) {
        if (this.cellOf.get(item) === this.cellAt(x, z)) return;
        this.remove(item);
        this.insert(item, x, z);
    }

    // Everything in the cells that a circle of `radius` around (x, z) touches, into `out`
    // (which is emptied first). Some may be a little outside the circle: check the distance.
    query(x, z, radius, out) {
        out.length = 0;
        const size = this.cellSize;
        const minX = Math.floor((x - radius) / size), maxX = Math.floor((x + radius) / size);
        const minZ = Math.floor((z - radius) / size), maxZ = Math.floor((z + radius) / size);
        for (let cx = minX; cx <= maxX; cx++) {
            for (let cz = minZ; cz <= maxZ; cz++) {
                const items = this.cells.get((cx + OFFSET) * OFFSET * 2 + cz + OFFSET);
                if (items) for (let i = 0; i < items.length; i++) out.push(items[i]);
            }
        }
        return out;
    }
}
