// ===== UNDERGROUND WIRE SYSTEM =====
import { GRID_SIZE, WIRE_CONFIG } from './config.js';

export class WireSystem {
    constructor() {
        // wires: Map of "gx,gy" -> wire segment
        this.wires = new Map();
        this.wireViewActive = false;
        this.selectedWireType = 'copper';
        this.powerNetworks = []; // Groups of connected wires + power sources
        this.dirty = true; // Needs recalculation
    }

    key(gx, gy) { return `${gx},${gy}`; }

    hasWire(gx, gy) {
        return this.wires.has(this.key(gx, gy));
    }

    getWire(gx, gy) {
        return this.wires.get(this.key(gx, gy));
    }

    placeWire(gx, gy, wireType, resourceMgr) {
        const k = this.key(gx, gy);
        if (this.wires.has(k)) return false;

        const wireDef = WIRE_CONFIG.wireTypes[wireType];
        if (!resourceMgr.canAfford(wireDef.cost)) return false;
        resourceMgr.spend(wireDef.cost);

        this.wires.set(k, {
            gx, gy,
            type: wireType,
            maxPower: wireDef.maxPower,
            currentPower: 0,
            color: wireDef.color,
            connections: [], // adjacent wire keys
            networkId: -1,
            pulsePhase: Math.random() * Math.PI * 2
        });

        this.dirty = true;
        return true;
    }

    removeWire(gx, gy, resourceMgr) {
        const k = this.key(gx, gy);
        const wire = this.wires.get(k);
        if (!wire) return false;

        const wireDef = WIRE_CONFIG.wireTypes[wire.type];
        resourceMgr.refund(wireDef.cost, 0.5);
        this.wires.delete(k);
        this.dirty = true;
        return true;
    }

    upgradeWire(gx, gy, newType, resourceMgr) {
        const k = this.key(gx, gy);
        const wire = this.wires.get(k);
        if (!wire) return false;

        const newDef = WIRE_CONFIG.wireTypes[newType];
        if (!resourceMgr.canAfford(newDef.cost)) return false;
        resourceMgr.spend(newDef.cost);

        wire.type = newType;
        wire.maxPower = newDef.maxPower;
        wire.color = newDef.color;
        this.dirty = true;
        return true;
    }

    // Recalculate power networks
    recalculate(buildings) {
        if (!this.dirty) return;
        this.dirty = false;

        // Build adjacency
        for (const [key, wire] of this.wires) {
            wire.connections = [];
            wire.networkId = -1;
            wire.currentPower = 0;
            const neighbors = [
                this.key(wire.gx - 1, wire.gy),
                this.key(wire.gx + 1, wire.gy),
                this.key(wire.gx, wire.gy - 1),
                this.key(wire.gx, wire.gy + 1)
            ];
            for (const nk of neighbors) {
                if (this.wires.has(nk)) {
                    wire.connections.push(nk);
                }
            }
        }

        // Flood-fill to find connected networks
        this.powerNetworks = [];
        const visited = new Set();
        let networkId = 0;

        for (const [key, wire] of this.wires) {
            if (visited.has(key)) continue;

            const network = {
                id: networkId,
                wires: [],
                powerSources: [],
                consumers: [],
                totalPower: 0,
                totalDraw: 0
            };

            // BFS
            const queue = [key];
            visited.add(key);
            while (queue.length > 0) {
                const cur = queue.shift();
                const w = this.wires.get(cur);
                if (!w) continue;
                w.networkId = networkId;
                network.wires.push(w);

                for (const conn of w.connections) {
                    if (!visited.has(conn)) {
                        visited.add(conn);
                        queue.push(conn);
                    }
                }
            }

            this.powerNetworks.push(network);
            networkId++;
        }

        // Attach buildings, merging networks bridged by the same building —
        // otherwise a plant touching two wire runs gets double-counted.
        for (const b of buildings) {
            if (!b.built) continue;
            if (!(b.powerOutput > 0) && !(b.powerDraw > 0)) continue;
            const touched = this.powerNetworks.filter(n => this._isBuildingConnected(b, n.wires));
            if (touched.length === 0) continue;
            let target = touched[0];
            for (let i = 1; i < touched.length; i++) {
                const other = touched[i];
                target.wires.push(...other.wires);
                target.powerSources.push(...other.powerSources);
                target.consumers.push(...other.consumers);
                target.totalPower += other.totalPower;
                target.totalDraw += other.totalDraw;
                for (const w of other.wires) w.networkId = target.id;
                this.powerNetworks.splice(this.powerNetworks.indexOf(other), 1);
            }
            if (b.powerOutput > 0 && !target.powerSources.includes(b)) {
                target.powerSources.push(b);
                target.totalPower += b.powerOutput * b.getStatMult();
            }
            if (b.powerDraw > 0 && !target.consumers.includes(b)) {
                target.consumers.push(b);
                target.totalDraw += b.powerDraw;
            }
        }

        // Distribute power
        for (const b of buildings) {
            if (b.powerDraw > 0) b.powered = false;
            if (b.powerDraw === 0) b.powered = true;
        }

        for (const network of this.powerNetworks) {
            const availablePower = network.totalPower;
            let usedPower = 0;

            // Power consumers in order (prioritize defense)
            const sorted = [...network.consumers].sort((a, b) => {
                const catOrder = { defense: 0, infrastructure: 1, economy: 2, special: 3 };
                return (catOrder[a.def.category] || 4) - (catOrder[b.def.category] || 4);
            });

            for (const b of sorted) {
                if (usedPower + b.powerDraw <= availablePower) {
                    b.powered = true;
                    usedPower += b.powerDraw;
                }
            }

            // Update wire power visualization
            for (const w of network.wires) {
                w.currentPower = availablePower > 0 ? Math.min(1, usedPower / availablePower) : 0;
            }
        }
    }

    _isBuildingConnected(building, networkWires) {
        // Check if any wire is adjacent to any cell of the building
        for (let dx = -1; dx <= building.size; dx++) {
            for (let dy = -1; dy <= building.size; dy++) {
                if (dx >= 0 && dx < building.size && dy >= 0 && dy < building.size) continue;
                const wk = this.key(building.gx + dx, building.gy + dy);
                for (const w of networkWires) {
                    if (this.key(w.gx, w.gy) === wk) return true;
                }
            }
        }
        // Also check if wire is directly under the building
        for (let dx = 0; dx < building.size; dx++) {
            for (let dy = 0; dy < building.size; dy++) {
                const wk = this.key(building.gx + dx, building.gy + dy);
                for (const w of networkWires) {
                    if (this.key(w.gx, w.gy) === wk) return true;
                }
            }
        }
        return false;
    }

    toggleView() {
        this.wireViewActive = !this.wireViewActive;
    }

    draw(ctx, camera, canvasW, canvasH, time) {
        if (!this.wireViewActive) return;

        const bounds = camera.getViewBounds(canvasW, canvasH);
        const startGx = Math.floor(bounds.left / GRID_SIZE) - 1;
        const endGx = Math.ceil(bounds.right / GRID_SIZE) + 1;
        const startGy = Math.floor(bounds.top / GRID_SIZE) - 1;
        const endGy = Math.ceil(bounds.bottom / GRID_SIZE) + 1;

        // Dim overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);

        // Draw wire segments
        for (const [key, wire] of this.wires) {
            if (wire.gx < startGx || wire.gx > endGx || wire.gy < startGy || wire.gy > endGy) continue;

            const wx = wire.gx * GRID_SIZE;
            const wy = wire.gy * GRID_SIZE;
            const cx = wx + GRID_SIZE / 2;
            const cy = wy + GRID_SIZE / 2;

            // Wire cell background
            ctx.fillStyle = 'rgba(30, 20, 10, 0.6)';
            ctx.fillRect(wx + 2, wy + 2, GRID_SIZE - 4, GRID_SIZE - 4);

            // Draw connections to neighbors
            ctx.strokeStyle = wire.color;
            ctx.lineWidth = wire.currentPower > 0 ? 4 : 2;
            ctx.shadowColor = wire.currentPower > 0 ? wire.color : 'transparent';
            ctx.shadowBlur = wire.currentPower > 0 ? 8 : 0;

            for (const connKey of wire.connections) {
                const conn = this.wires.get(connKey);
                if (!conn) continue;
                const ccx = conn.gx * GRID_SIZE + GRID_SIZE / 2;
                const ccy = conn.gy * GRID_SIZE + GRID_SIZE / 2;
                // Only draw if this wire is "less than" connection (avoid double drawing)
                if (wire.gx < conn.gx || (wire.gx === conn.gx && wire.gy < conn.gy)) {
                    ctx.beginPath();
                    ctx.moveTo(cx, cy);
                    ctx.lineTo(ccx, ccy);
                    ctx.stroke();
                }
            }

            // Junction dot
            if (wire.currentPower > 0) {
                const pulse = Math.sin(time * 4 + wire.pulsePhase) * 0.3 + 0.7;
                ctx.fillStyle = wire.color;
                ctx.globalAlpha = pulse;
                ctx.beginPath();
                ctx.arc(cx, cy, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            } else {
                ctx.fillStyle = '#555';
                ctx.beginPath();
                ctx.arc(cx, cy, 3, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.shadowBlur = 0;
        }
    }

    getNetworkInfo(building) {
        for (const network of this.powerNetworks) {
            if (network.consumers.includes(building) || network.powerSources.includes(building)) {
                return network;
            }
        }
        return null;
    }
}
