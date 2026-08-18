import React, { useRef, useEffect, useState, useCallback } from "react";

/* ------------------------------------------------------------------
   AI SOC — Pipeline Hero (v7 · LANES Dual-Pod Architecture)

   · LANES Style Dual-Pod Redundancy:
     Each stage is equipped with 2 redundant pods (01 / 02) running in parallel.
     Capacity slots are rendered as clear horizontal bars with individual slot fill.
   · Smooth Continuous Particle Motion:
     Fixed the sudden acceleration/suction issue from example.html.
     Particles now travel, queue, glide into pod slots, process, and exit
     with uniform, fluid, and natural momentum without jarring speed jumps.
   · Interactive Pod Interruption & Failover:
     Click on any pod to simulate failure/recovery. Traffic automatically
     reroutes to surviving pods with real-time health indicator updates.
   · Subagent Hierarchy:
     Enrichment and Triage connect to subagent dispatchers and solution tool rows.
------------------------------------------------------------------- */

const C = {
    void: "#0A0E14",
    surface: "#131A24",
    line: "#232E3B",
    flow: "#38BDF8",
    ok: "#22C55E",
    alert: "#F43F5E",
    warn: "#F59E0B",
    dim: "#7C8CA1",
    text: "#E2E8F0",
};

const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace';
const SANS =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, sans-serif';

const STAGES = [
    { key: "orchestrator", label: "ORCHESTRATOR", cap: 4, service: 500, tools: 0 },
    { key: "enrichment", label: "ENRICHMENT", cap: 3, service: 1350, tools: 6 },
    { key: "triage", label: "TRIAGE", cap: 4, service: 820, tools: 0 },
];

const PODS_PER_STAGE = 2;
const LANE_OFFSET = 9; // Pod 0 at -9px, Pod 1 at +9px relative to spineY
const SLOT_W = 8.5;
const SLOT_GAP = 2.4;
const SLOT_H = 7;

const QUEUE_MAX = 12;
const QUEUE_GAP = 7;
const QUEUE_HOT_THRESHOLD = 5;

const SUB_DY = 52; // hexagon below spine
const SUB_R = 11;
const TOOL_DY = 40; // solution row below hexagon
const TOOL_GAP = 17;
const STATUS_DY = 118;

const FORK_DY = 48; // exit curve endpoints, above/below spine

/* Helper for canvas letter spacing */
const LS = (g, v) => {
    if ("letterSpacing" in g) g.letterSpacing = v;
};

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const lerp = (a, b, t) => a + (b - a) * t;

/* Rounded rectangle helper */
function rr(g, x, y, w, h, r) {
    const q = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + q, y);
    g.lineTo(x + w - q, y);
    g.quadraticCurveTo(x + w, y, x + w, y + q);
    g.lineTo(x + w, y + h - q);
    g.quadraticCurveTo(x + w, y + h, x + w - q, y + h);
    g.lineTo(x + q, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - q);
    g.lineTo(x, y + q);
    g.quadraticCurveTo(x, y, x + q, y);
    g.closePath();
}

function makeSprite(hex, size) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    const r = size / 2;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, hex + "FF");
    grad.addColorStop(0.3, hex + "C0");
    grad.addColorStop(0.64, hex + "38");
    grad.addColorStop(1, hex + "00");
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return c;
}

function hexPath(g, x, y, r) {
    g.beginPath();
    for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 3;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        i ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.closePath();
}

/* Simulated or real metrics fetch hook */
function useLiveMetrics(enabled) {
    const [data, setData] = useState(null);
    useEffect(() => {
        if (!enabled) {
            setData(null);
            return;
        }
        let alive = true;
        const pull = async () => {
            try {
                if (alive) setData(null);
            } catch {
                if (alive) setData(null);
            }
        };
        pull();
        const id = setInterval(pull, 8000);
        return () => {
            alive = false;
            clearInterval(id);
        };
    }, [enabled]);
    return data;
}

export default function PipelineHero() {
    const wrapRef = useRef(null);
    const canvasRef = useRef(null);
    const rafRef = useRef(0);
    const stateRef = useRef(null);
    const hoverRef = useRef(null);

    const [mode, setMode] = useState("sim");
    const [counts, setCounts] = useState({
        closed: 1284,
        escalated: 37,
        inFlight: 0,
        rate: 44,
        podsUp: 6,
        podsTotal: 6,
    });
    const live = useLiveMetrics(mode === "real");

    const cfg = useRef({ mode, live });
    useEffect(() => {
        cfg.current = { mode, live };
    }, [mode, live]);

    const reduced =
        typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const init = useCallback((w, h) => {
        const spineY = Math.round(h * 0.465);
        const padL = Math.max(200, w * 0.175);
        const padR = Math.max(210, w * 0.195);
        const span = w - padL - padR;

        const nodes = STAGES.map((s, i) => {
            const x = padL + (span * (i + 0.5)) / STAGES.length;
            const barWidth = s.cap * SLOT_W + (s.cap - 1) * SLOT_GAP;
            const halfW = barWidth / 2;

            // Fork (branch entry) and merge (branch exit)
            const fork = x - halfW - 22;
            const merge = x + halfW + 20;

            const pods = [];
            for (let l = 0; l < PODS_PER_STAGE; l++) {
                const py = spineY + (l === 0 ? -LANE_OFFSET : LANE_OFFSET);
                pods.push({
                    lane: l,
                    alive: true,
                    busy: [],
                    pos: { x, y: py },
                    barWidth,
                    beat: Math.random() * 1000,
                    ring: 0,
                });
            }

            let sub = null;
            if (s.tools > 0) {
                const sy = spineY + SUB_DY;
                const rowY = sy + TOOL_DY;
                const seats = [];
                for (let k = 0; k < s.tools; k++) {
                    seats.push({
                        x: x + (k - (s.tools - 1) / 2) * TOOL_GAP,
                        y: rowY,
                        flash: 0,
                    });
                }
                sub = { x, y: sy, rowY, seats, flash: 0, busy: 0 };
            }

            return {
                ...s,
                x,
                fork,
                merge,
                barWidth,
                pods,
                queue: [],
                rr: 0,
                ring: 0,
                heat: 0,
                sub,
                calls: [],
            };
        });

        return {
            w,
            h,
            spineY,
            padL,
            padR,
            gap: span / STAGES.length,
            inX: padL - Math.min(114, padL - 84),
            outX: w - padR + Math.min(54, padR - 108),
            nodes,
            particles: [],
            linkLoad: new Array(STAGES.length + 1).fill(0),
            closed: 1284,
            escalated: 37,
            acc: 0,
            rate: 44,
            last: performance.now(),
            sprites: {
                flow: makeSprite(C.flow, 28),
                warn: makeSprite(C.warn, 28),
                alert: makeSprite(C.alert, 28),
            },
        };
    }, []);

    /* Pick available pod using round robin across alive pods with free capacity */
    const pickPod = useCallback((node) => {
        for (let k = 0; k < node.pods.length; k++) {
            const idx = (node.rr + k) % node.pods.length;
            const pod = node.pods[idx];
            if (pod.alive && pod.busy.length < node.cap) {
                node.rr = (idx + 1) % node.pods.length;
                return pod;
            }
        }
        return null;
    }, []);

    const step = useCallback(
        (S, dt, now) => {
            const running = cfg.current.mode === "sim";

            let rate = 0;
            if (running) {
                rate = 48 + 32 * Math.sin(now / 23000);
                S.nodes[1].service = 1200 + 1200 * (0.5 + 0.5 * Math.sin(now / 31000));
                S.rate = Math.max(6, Math.round(rate));
            } else {
                S.rate = 0;
            }

            // Spawn new alert particles
            if (running) {
                const per = 60000 / Math.max(rate, 1);
                S.acc += dt;
                while (S.acc > per) {
                    S.acc -= per;
                    if (S.particles.length < 220) {
                        S.particles.push({
                            seg: -1,
                            state: "travel", // "travel" | "queued" | "enter" | "service" | "leave"
                            t: Math.random() * 0.15,
                            lane: (Math.random() - 0.5) * 8,
                            sev: 0.8 + Math.random() * 0.45,
                            failed: false,
                            qi: 0,
                            qx: S.inX,
                            qy: S.spineY,
                            pod: null,
                            slot: 0,
                            enterT: 0,
                            leaveT: 0,
                            enterDuration: 320,
                            leaveDuration: 300,
                            startX: 0,
                            startY: 0,
                            targetX: 0,
                            targetY: 0,
                            jit: Math.random() * 6.28,
                            px: null,
                            py: null,
                        });
                    }
                }
            } else {
                S.acc = 0;
            }

            const baseSpeed = 0.0006;
            const load = new Array(S.linkLoad.length).fill(0);

            // Update particle states with smooth continuous progression
            for (let i = S.particles.length - 1; i >= 0; i--) {
                const p = S.particles[i];

                if (p.state === "travel") {
                    load[p.seg + 1]++;
                    p.t += dt * baseSpeed * (0.92 + p.sev * 0.18);

                    if (p.t >= 1) {
                        const next = p.seg + 1;
                        if (next >= S.nodes.length) {
                            if (p.failed) S.escalated++;
                            else S.closed++;
                            S.particles.splice(i, 1);
                            continue;
                        }

                        const n = S.nodes[next];
                        const pod = pickPod(n);

                        if (pod) {
                            // Directly enter pod smoothly
                            p.state = "enter";
                            p.seg = next;
                            p.pod = pod;
                            p.slot = pod.busy.length;
                            pod.busy.push(p);
                            pod.ring = 1;
                            n.ring = 1;

                            p.startX = n.fork;
                            p.startY = S.spineY;
                            const slotX =
                                pod.pos.x -
                                pod.barWidth / 2 +
                                p.slot * (SLOT_W + SLOT_GAP) +
                                SLOT_W / 2;
                            p.targetX = slotX;
                            p.targetY = pod.pos.y;
                            p.enterT = 0;
                            p.enterDuration = 320; // Smooth entry without sudden jerk
                        } else {
                            // Place into queue
                            p.state = "queued";
                            p.seg = next;
                            p.qi = n.queue.length;
                            p.qx = n.fork;
                            p.qy = S.spineY;
                            n.queue.push(p);
                        }
                    }
                } else if (p.state === "enter") {
                    p.enterT += dt / p.enterDuration;
                    if (p.enterT >= 1) {
                        p.state = "service";
                        const n = S.nodes[p.seg];
                        p.doneAt = now + n.service * (0.75 + Math.random() * 0.5);

                        // Trigger subagent if available
                        if (n.sub && n.calls.length < 4) {
                            const k = n.sub.seats.length;
                            const want = 1 + ((Math.random() * Math.min(3, k)) | 0);
                            const picked = [];
                            while (picked.length < want) {
                                const idx = (Math.random() * k) | 0;
                                if (!picked.includes(idx)) picked.push(idx);
                            }
                            n.calls.push({
                                phase: 0,
                                t: 0,
                                legs: picked.map((idx, j) => ({ i: idx, u: -j * 0.22 })),
                            });
                        }
                    }
                } else if (p.state === "service") {
                    if (now >= p.doneAt) {
                        const n = S.nodes[p.seg];
                        const pod = p.pod;
                        if (pod) {
                            const idx = pod.busy.indexOf(p);
                            if (idx >= 0) pod.busy.splice(idx, 1);
                        }

                        if (n.key === "triage" && Math.random() < 0.16) {
                            p.failed = true;
                        }

                        p.state = "leave";
                        p.startX =
                            pod.pos.x -
                            pod.barWidth / 2 +
                            p.slot * (SLOT_W + SLOT_GAP) +
                            SLOT_W / 2;
                        p.startY = pod.pos.y;
                        p.targetX = n.merge;
                        p.targetY = S.spineY;
                        p.leaveT = 0;
                        p.leaveDuration = 300;
                    }
                } else if (p.state === "leave") {
                    p.leaveT += dt / p.leaveDuration;
                    if (p.leaveT >= 1) {
                        p.state = "travel";
                        p.t = 0;
                        p.lane = (Math.random() - 0.5) * 8;
                    }
                }
            }

            for (let i = 0; i < load.length; i++) {
                S.linkLoad[i] += (load[i] - S.linkLoad[i]) * Math.min(dt * 0.006, 1);
            }

            // Node & Queue dispatching
            for (const n of S.nodes) {
                // Dispatch queued items to available pods
                let guard = 0;
                while (n.queue.length && guard++ < 8) {
                    const pod = pickPod(n);
                    if (!pod) break;

                    const p = n.queue.shift();
                    p.state = "enter";
                    p.pod = pod;
                    p.slot = pod.busy.length;
                    pod.busy.push(p);
                    pod.ring = 1;
                    n.ring = 1;

                    p.startX = p.qx;
                    p.startY = p.qy;
                    const slotX =
                        pod.pos.x -
                        pod.barWidth / 2 +
                        p.slot * (SLOT_W + SLOT_GAP) +
                        SLOT_W / 2;
                    p.targetX = slotX;
                    p.targetY = pod.pos.y;
                    p.enterT = 0;
                    p.enterDuration = Math.max(
                        240,
                        Math.min(380, Math.hypot(p.targetX - p.startX, p.targetY - p.startY) * 5)
                    );
                }

                // Smooth queue slot advancement
                n.queue.forEach((p, qi) => {
                    p.qi = qi;
                    const slot = Math.min(qi, QUEUE_MAX);
                    const targetX = n.fork - 8 - slot * QUEUE_GAP;
                    const targetY = S.spineY + Math.sin(p.jit) * 1.5;
                    p.qx += (targetX - p.qx) * Math.min(dt * 0.008, 1);
                    p.qy += (targetY - p.qy) * Math.min(dt * 0.008, 1);
                });

                // Update pods & rings
                for (const pod of n.pods) {
                    pod.beat += dt;
                    pod.ring = Math.max(0, pod.ring - dt * 0.0026);
                }

                n.ring = Math.max(0, n.ring - dt * 0.0026);
                const targetHeat = Math.min(n.queue.length / (QUEUE_HOT_THRESHOLD * 1.5), 1);
                n.heat += (targetHeat - n.heat) * Math.min(dt * 0.004, 1);

                // Subagent animation steps
                if (n.sub) {
                    for (let k = n.calls.length - 1; k >= 0; k--) {
                        const c = n.calls[k];
                        if (c.phase === 0) {
                            c.t += dt * 0.0026;
                            if (c.t >= 1) {
                                c.phase = 1;
                                n.sub.flash = 1;
                            }
                        } else if (c.phase === 1) {
                            let allDone = true;
                            for (const leg of c.legs) {
                                const before = leg.u;
                                leg.u += dt * 0.003;
                                if (before < 1 && leg.u >= 1) n.sub.seats[leg.i].flash = 1;
                                if (leg.u < 2) allDone = false;
                            }
                            if (allDone) {
                                c.phase = 2;
                                c.t = 0;
                                n.sub.flash = Math.max(n.sub.flash, 0.85);
                            }
                        } else {
                            c.t += dt * 0.0026;
                            if (c.t >= 1) n.calls.splice(k, 1);
                        }
                    }

                    n.sub.flash = Math.max(0, n.sub.flash - dt * 0.0022);
                    n.sub.busy +=
                        (Math.min(n.calls.length / 3, 1) - n.sub.busy) * Math.min(dt * 0.005, 1);
                    for (const s of n.sub.seats) s.flash = Math.max(0, s.flash - dt * 0.0019);
                }
            }
        },
        [pickPod]
    );

    /* Smooth position resolver for every particle */
    const posOf = useCallback((S, p, now) => {
        const { spineY, inX, outX, nodes } = S;

        if (p.state === "queued") {
            return {
                x: p.qx,
                y: p.qy,
                q: true,
                deep: p.qi / QUEUE_MAX,
            };
        }

        if (p.state === "enter") {
            const e = easeInOut(Math.min(p.enterT, 1));
            // S-curve trajectory gliding smoothly into the slot
            const x = lerp(p.startX, p.targetX, e);
            const y = lerp(p.startY, p.targetY, e);
            return { x, y, a: 1 };
        }

        if (p.state === "service") {
            const pod = p.pod;
            const slotX =
                pod.pos.x -
                pod.barWidth / 2 +
                p.slot * (SLOT_W + SLOT_GAP) +
                SLOT_W / 2;
            return {
                x: slotX,
                y: pod.pos.y,
                svc: true,
                a: 0.95,
            };
        }

        if (p.state === "leave") {
            const e = easeInOut(Math.min(p.leaveT, 1));
            // S-curve trajectory gliding smoothly out of the slot back to the spine
            const x = lerp(p.startX, p.targetX, e);
            const y = lerp(p.startY, p.targetY, e);
            return { x, y, a: 1 };
        }

        // Standard segment travel
        const from = p.seg < 0 ? inX : nodes[p.seg].merge;
        const last = p.seg + 1 >= nodes.length;
        const to = last ? outX : nodes[p.seg + 1].fork;

        const e = easeInOut(p.t);
        const x = from + (to - from) * e;
        let y = spineY + p.lane * (1 - e);

        if (last) {
            y = spineY + (p.failed ? 1 : -1) * e * e * FORK_DY;
        }

        const fadeIn = p.seg < 0 ? Math.min(p.t * 3.5, 1) : 1;
        const fadeOut = last ? 1 - Math.max(0, (p.t - 0.76) * 4.2) : 1;

        return { x, y, a: fadeIn * fadeOut };
    }, []);

    const draw = useCallback(
        (S, now) => {
            const cv = canvasRef.current;
            if (!cv) return;
            const g = cv.getContext("2d");
            const { w, h, spineY, inX, outX, nodes } = S;
            const idle = cfg.current.mode !== "sim";
            const k = idle ? 0.45 : 1;

            g.fillStyle = "rgba(10,14,20,0.28)";
            g.fillRect(0, 0, w, h);

            /* ---------- Spine segments ---------- */
            g.lineWidth = 1;
            for (let i = 0; i < nodes.length; i++) {
                const segStart = i === 0 ? inX : nodes[i - 1].merge;
                const segEnd = nodes[i].fork;
                const lit = Math.min(S.linkLoad[i] / 6, 1);
                g.strokeStyle = `rgba(56,189,248,${(0.18 + lit * 0.32) * k})`;
                g.beginPath();
                g.moveTo(segStart, spineY);
                g.lineTo(segEnd, spineY);
                g.stroke();
            }

            /* ---------- In-node Branch Guide Lines (Dual Lane) ---------- */
            for (const n of nodes) {
                for (const pod of n.pods) {
                    const col = pod.alive
                        ? `rgba(56,189,248,${0.18 * k})`
                        : `rgba(244,63,94,${0.16 * k})`;
                    g.strokeStyle = col;
                    g.lineWidth = 1;

                    // Branch in: fork -> pod bar
                    g.beginPath();
                    g.moveTo(n.fork, spineY);
                    g.bezierCurveTo(
                        n.fork + 10,
                        spineY,
                        pod.pos.x - pod.barWidth / 2 - 12,
                        pod.pos.y,
                        pod.pos.x - pod.barWidth / 2 - 2,
                        pod.pos.y
                    );
                    g.stroke();

                    // Branch out: pod bar -> merge
                    g.beginPath();
                    g.moveTo(pod.pos.x + pod.barWidth / 2 + 2, pod.pos.y);
                    g.bezierCurveTo(
                        pod.pos.x + pod.barWidth / 2 + 12,
                        pod.pos.y,
                        n.merge - 10,
                        spineY,
                        n.merge,
                        spineY
                    );
                    g.stroke();
                }
            }

            /* ---------- Exit: stem and fork ---------- */
            const lastMerge = nodes[nodes.length - 1].merge;
            const splitX = lastMerge + (outX - lastMerge) * 0.28;
            g.strokeStyle = `rgba(56,189,248,${(0.18 + Math.min(S.linkLoad[S.linkLoad.length - 1] / 6, 1) * 0.3) * k
                })`;
            g.beginPath();
            g.moveTo(lastMerge, spineY);
            g.lineTo(splitX, spineY);
            g.stroke();

            const mkExit = (dir, col) => {
                g.strokeStyle = col;
                g.beginPath();
                g.moveTo(splitX, spineY);
                g.bezierCurveTo(
                    splitX + (outX - splitX) * 0.5,
                    spineY,
                    outX - 22,
                    spineY + dir * FORK_DY,
                    outX,
                    spineY + dir * FORK_DY
                );
                g.stroke();
            };
            mkExit(-1, `rgba(34,197,94,${0.45 * k})`);
            mkExit(1, `rgba(244,63,94,${0.45 * k})`);

            /* ---------- Subagent trees ---------- */
            for (const n of nodes) {
                if (!n.sub) continue;
                const sub = n.sub;

                // Connecting trunk from lower pod area to subagent hexagon
                g.lineWidth = 1;
                g.strokeStyle = `rgba(56,189,248,${(0.22 + sub.busy * 0.3) * k})`;
                g.beginPath();
                g.moveTo(n.x, spineY + LANE_OFFSET + 8);
                g.lineTo(sub.x, sub.y - SUB_R);
                g.stroke();

                // Hexagon -> solutions
                for (const s of sub.seats) {
                    const dx = s.x - sub.x;
                    const dy = s.y - sub.y;
                    const len = Math.hypot(dx, dy) || 1;
                    g.strokeStyle = `rgba(148,163,184,${(0.2 + s.flash * 0.36) * k})`;
                    g.beginPath();
                    g.moveTo(sub.x + (dx / len) * SUB_R, sub.y + (dy / len) * SUB_R);
                    g.lineTo(s.x - (dx / len) * 5, s.y - (dy / len) * 5);
                    g.stroke();
                }

                // Solution baseline
                g.strokeStyle = `rgba(148,163,184,${0.14 * k})`;
                g.beginPath();
                g.moveTo(sub.seats[0].x - 7, sub.rowY + 7);
                g.lineTo(sub.seats[sub.seats.length - 1].x + 7, sub.rowY + 7);
                g.stroke();

                // Solution square seats
                for (const s of sub.seats) {
                    const lit = s.flash > 0.02;
                    g.fillStyle = `rgba(${lit ? "56,189,248" : "148,163,184"},${(0.38 + s.flash * 0.58) * k
                        })`;
                    const q = 2.6 + s.flash * 1.1;
                    g.fillRect(s.x - q, s.y - q, q * 2, q * 2);
                    if (s.flash > 0.05) {
                        g.strokeStyle = `rgba(56,189,248,${s.flash * 0.38 * k})`;
                        const r = 4.6 + (1 - s.flash) * 5.5;
                        g.strokeRect(s.x - r, s.y - r, r * 2, r * 2);
                    }
                }

                // Subagent Hexagon
                if (sub.flash > 0.04) {
                    g.strokeStyle = `rgba(56,189,248,${sub.flash * 0.4 * k})`;
                    g.lineWidth = 1;
                    hexPath(g, sub.x, sub.y, SUB_R + (1 - sub.flash) * 9);
                    g.stroke();
                }
                g.lineWidth = 1.5;
                g.strokeStyle = `rgba(56,189,248,${(0.52 + sub.busy * 0.45) * k})`;
                hexPath(g, sub.x, sub.y, SUB_R);
                g.fillStyle = C.void;
                g.fill();
                g.stroke();
                g.fillStyle = `rgba(56,189,248,${(0.62 + sub.flash * 0.38) * k})`;
                g.beginPath();
                g.arc(sub.x, sub.y, 2.4 + sub.busy * 1.3, 0, 6.2832);
                g.fill();

                // Subagent call packets
                for (const c of n.calls) {
                    if (c.phase === 0) {
                        const e = easeInOut(c.t);
                        g.fillStyle = "rgba(125,211,252,1)";
                        g.beginPath();
                        g.arc(
                            lerp(n.x, sub.x, e),
                            lerp(spineY + LANE_OFFSET + 8, sub.y - SUB_R, e),
                            2,
                            0,
                            6.2832
                        );
                        g.fill();
                    } else if (c.phase === 1) {
                        for (const leg of c.legs) {
                            if (leg.u <= 0 || leg.u >= 2) continue;
                            const s = sub.seats[leg.i];
                            const out = leg.u < 1;
                            const e = easeInOut(out ? leg.u : 2 - leg.u);
                            g.fillStyle = out ? "rgba(125,211,252,1)" : "rgba(241,245,249,0.95)";
                            g.beginPath();
                            g.arc(lerp(sub.x, s.x, e), lerp(sub.y, s.y, e), 1.8, 0, 6.2832);
                            g.fill();
                        }
                    } else {
                        const e = easeInOut(c.t);
                        g.fillStyle = "rgba(241,245,249,0.95)";
                        g.beginPath();
                        g.arc(
                            lerp(sub.x, n.x, e),
                            lerp(sub.y - SUB_R, spineY + LANE_OFFSET + 8, e),
                            2,
                            0,
                            6.2832
                        );
                        g.fill();
                    }
                }

                if (!idle) {
                    g.font = `600 9px ${MONO}`;
                    LS(g, "0.06em");
                    g.textAlign = "center";
                    const full = "SUBAGENT CONNECTED";
                    const tw = g.measureText(full).width;
                    const ty = spineY + STATUS_DY;
                    g.fillStyle = "rgba(34,197,94,0.9)";
                    g.beginPath();
                    g.arc(sub.x - tw / 2 - 4, ty - 3, 2.2, 0, 6.2832);
                    g.fill();
                    g.fillStyle = "rgba(124,140,161,1)";
                    g.fillText(full, sub.x + 5, ty);
                    LS(g, "0px");
                }
            }

            /* ---------- Particles ---------- */
            for (const p of S.particles) {
                const pos = posOf(S, p, now);
                const alpha = pos.a == null ? 1 : pos.a;
                let sprite = S.sprites.flow;
                let rgb = "56,189,248";
                if (p.failed) {
                    sprite = S.sprites.alert;
                    rgb = "244,63,94";
                } else if (pos.q && pos.deep > 0.55) {
                    sprite = S.sprites.warn;
                    rgb = "245,158,11";
                }

                // Smooth trail stroke
                if (p.px != null && !pos.q && !pos.svc) {
                    g.strokeStyle = `rgba(${rgb},${0.34 * alpha})`;
                    g.lineWidth = 1.2 * p.sev;
                    g.beginPath();
                    g.moveTo(p.px, p.py);
                    g.lineTo(pos.x, pos.y);
                    g.stroke();
                }

                const s = (pos.q ? 8 : 11) * p.sev;
                g.globalAlpha = alpha;
                g.drawImage(sprite, pos.x - s / 2, pos.y - s / 2, s, s);
                g.globalAlpha = 1;

                p.px = pos.x;
                p.py = pos.y;
            }

            /* ---------- LANES Stage Nodes (Dual-Pod Bars) ---------- */
            g.textAlign = "center";
            for (const n of nodes) {
                const hot = n.queue.length > QUEUE_HOT_THRESHOLD;
                const activePods = n.pods.filter((p) => p.alive);
                const totalBusy = n.pods.reduce((sum, p) => sum + p.busy.length, 0);
                const totalCapacity = n.cap * activePods.length;
                const isHoveredNode = hoverRef.current && hoverRef.current.node === n;

                // Pod capacity bars
                n.pods.forEach((pod, i) => {
                    const p = pod.pos;
                    const col = pod.alive ? (hot ? C.alert : C.flow) : C.alert;
                    const tot = pod.barWidth;
                    const isHoveredPod =
                        isHoveredNode && hoverRef.current && hoverRef.current.pod === pod;

                    // Hover outline indicator
                    if (isHoveredPod) {
                        g.strokeStyle = "rgba(226,232,240,0.35)";
                        g.lineWidth = 1;
                        rr(g, p.x - tot / 2 - 4, p.y - SLOT_H / 2 - 3, tot + 28, SLOT_H + 6, 4);
                        g.stroke();
                    }

                    // Render individual capacity slots
                    for (let slotIdx = 0; slotIdx < n.cap; slotIdx++) {
                        const sx = p.x - tot / 2 + slotIdx * (SLOT_W + SLOT_GAP);
                        const isBusy = slotIdx < pod.busy.length;

                        if (pod.alive) {
                            if (isBusy) {
                                g.fillStyle = col;
                                rr(g, sx, p.y - SLOT_H / 2, SLOT_W, SLOT_H, 3.5);
                                g.fill();

                                // Subtle inner sheen
                                g.fillStyle = "rgba(255,255,255,0.35)";
                                rr(g, sx + 1.5, p.y - SLOT_H / 2 + 1.2, SLOT_W - 3, SLOT_H - 2.4, 2);
                                g.fill();
                            } else {
                                g.fillStyle = `rgba(148,163,184,${0.18 * k})`;
                                rr(g, sx, p.y - SLOT_H / 2, SLOT_W, SLOT_H, 3.5);
                                g.fill();
                            }
                        } else {
                            // Down state: dashed red outline
                            g.strokeStyle = `rgba(244,63,94,${0.5 * k})`;
                            g.lineWidth = 1;
                            g.setLineDash([2, 2]);
                            rr(g, sx, p.y - SLOT_H / 2, SLOT_W, SLOT_H, 3.5);
                            g.stroke();
                            g.setLineDash([]);
                        }
                    }

                    // Pod ID label: "01" / "02" or "DOWN"
                    g.font = `600 8px ${MONO}`;
                    g.textAlign = "left";
                    g.fillStyle = pod.alive
                        ? `rgba(124,140,161,${0.85 * k})`
                        : `rgba(244,63,94,${0.95 * k})`;
                    g.fillText(pod.alive ? `0${i + 1}` : "DOWN", p.x + tot / 2 + 5, p.y + 2.8);
                    g.textAlign = "center";
                });

                // Stage Header Labels (above the dual bars)
                const headerY = spineY - LANE_OFFSET - 14;
                const downPodIdx = n.pods.findIndex((p) => !p.alive);
                let labelText = n.label;
                let labelColor = hot ? C.alert : `rgba(124,140,161,${k})`;

                if (activePods.length === 0) {
                    labelText = `${n.label} · STALLED`;
                    labelColor = C.alert;
                } else if (downPodIdx >= 0) {
                    labelText = `${n.label} · POD-0${downPodIdx + 1} DOWN`;
                    labelColor = C.warn;
                }

                g.font = `600 9px ${MONO}`;
                LS(g, "0.1em");
                g.fillStyle = labelColor;
                g.fillText(labelText, n.x, headerY - 14);
                LS(g, "0px");

                g.font = `600 11px ${MONO}`;
                g.fillStyle =
                    totalCapacity === 0
                        ? C.alert
                        : hot
                            ? C.alert
                            : idle
                                ? "rgba(226,232,240,0.4)"
                                : `rgba(226,232,240,${0.92 * k})`;
                g.fillText(
                    idle ? `—/${n.cap * PODS_PER_STAGE}` : `${totalBusy}/${totalCapacity || n.cap * PODS_PER_STAGE}`,
                    n.x,
                    headerY
                );
            }

            /* ---------- Ingest Header & Readout ---------- */
            const feedX = inX - 58;
            const feed = (dir) => {
                g.strokeStyle = `rgba(56,189,248,${0.2 * k})`;
                g.lineWidth = 1;
                g.beginPath();
                g.moveTo(feedX, spineY + dir * 24);
                g.bezierCurveTo(
                    feedX + 24,
                    spineY + dir * 24,
                    inX - 28,
                    spineY,
                    inX,
                    spineY
                );
                g.stroke();
                g.fillStyle = `rgba(56,189,248,${0.4 * k})`;
                g.beginPath();
                g.arc(feedX, spineY + dir * 24, 1.8, 0, 6.2832);
                g.fill();
            };
            feed(-1);
            feed(0);
            feed(1);

            g.textAlign = "left";
            g.font = `600 9px ${MONO}`;
            LS(g, "0.1em");
            g.fillStyle = `rgba(124,140,161,${k})`;
            g.fillText("ALERT INGEST", feedX, spineY + 44);
            LS(g, "0px");
            g.font = `600 17px ${MONO}`;
            g.fillStyle = idle ? "rgba(226,232,240,0.4)" : "rgba(226,232,240,0.92)";
            g.fillText(idle ? "—" : `${S.rate}`, feedX, spineY + 64);
            if (!idle) {
                const rw = g.measureText(`${S.rate}`).width;
                g.font = `600 9px ${MONO}`;
                g.fillStyle = `rgba(124,140,161,${k})`;
                g.fillText("/MIN", feedX + rw + 4, spineY + 64);
            }

            /* ---------- Exit Column Readouts ---------- */
            const ex = outX + 12;
            const win = (label, color, x, y) => {
                g.font = `600 9px ${MONO}`;
                LS(g, "0.08em");
                g.fillStyle = color;
                g.fillText(label, x, y);
                const lw = g.measureText(label).width;
                const tag =
                    g.measureText(" · LAST 24H").width + lw + 10 < w - x ? " · LAST 24H" : " · 24H";
                g.fillStyle = `rgba(124,140,161,${k})`;
                g.fillText(tag, x + lw, y);
                LS(g, "0px");
            };

            const closedY = spineY - FORK_DY;
            win("AUTO-CLOSED", `rgba(34,197,94,${0.95 * k})`, ex, closedY - 20);
            g.font = `600 17px ${MONO}`;
            g.fillStyle = idle ? "rgba(34,197,94,0.45)" : C.ok;
            g.fillText(idle ? "—" : S.closed.toLocaleString(), ex, closedY + 4);
            g.font = `600 9px ${MONO}`;
            LS(g, "0.08em");
            g.fillStyle = `rgba(124,140,161,${k})`;
            g.fillText("TPI · TPNI · FP", ex, closedY + 21);
            LS(g, "0px");

            const escY = spineY + FORK_DY;
            win("ESCALATED", `rgba(244,63,94,${0.95 * k})`, ex, escY - 12);
            g.font = `600 17px ${MONO}`;
            g.fillStyle = idle ? "rgba(244,63,94,0.45)" : C.alert;
            g.fillText(idle ? "—" : S.escalated.toLocaleString(), ex, escY + 12);

            /* ---------- Bottom Interactive Hint ---------- */
            g.textAlign = "left";
            g.font = `500 9px ${SANS}`;
            g.fillStyle = "rgba(124,140,161,0.55)";
            g.fillText("💡 파드(01 / 02)를 클릭하면 중단 및 자동 장애 복구(Failover)를 시뮬레이션할 수 있습니다", 24, h - 14);

            /* ---------- Idle notice ---------- */
            if (idle) {
                g.textAlign = "center";
                g.font = `600 9px ${MONO}`;
                LS(g, "0.1em");
                g.fillStyle = "rgba(124,140,161,0.95)";
                g.fillText("NO LIVE FEED", w / 2, spineY + STATUS_DY - 13);
                LS(g, "0.04em");
                g.fillStyle = "rgba(124,140,161,0.6)";
                g.fillText("CONNECT /api/pipeline/live", w / 2, spineY + STATUS_DY + 2);
                LS(g, "0px");
            }
        },
        [posOf]
    );

    /* Hit-testing for pod clicks */
    const hitTest = useCallback((mx, my) => {
        const S = stateRef.current;
        if (!S) return null;

        for (const node of S.nodes) {
            for (const pod of node.pods) {
                const tot = pod.barWidth;
                if (
                    mx >= pod.pos.x - tot / 2 - 6 &&
                    mx <= pod.pos.x + tot / 2 + 24 &&
                    my >= pod.pos.y - SLOT_H / 2 - 5 &&
                    my <= pod.pos.y + SLOT_H / 2 + 5
                ) {
                    return { node, pod };
                }
            }
        }
        return null;
    }, []);

    useEffect(() => {
        const wrap = wrapRef.current;
        const cv = canvasRef.current;
        if (!wrap || !cv) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        let alive = true;

        const size = () => {
            const r = wrap.getBoundingClientRect();
            if (!r.width) return;
            cv.width = Math.round(r.width * dpr);
            cv.height = Math.round(r.height * dpr);
            cv.style.width = r.width + "px";
            cv.style.height = r.height + "px";
            const g = cv.getContext("2d");
            g.setTransform(dpr, 0, 0, dpr, 0, 0);

            const prev = stateRef.current;
            stateRef.current = init(r.width, r.height);
            if (prev) {
                stateRef.current.closed = prev.closed;
                stateRef.current.escalated = prev.escalated;
                // Preserve pod health states on resize
                prev.nodes.forEach((pn, ni) => {
                    pn.pods.forEach((pp, pi) => {
                        if (stateRef.current.nodes[ni]?.pods[pi]) {
                            stateRef.current.nodes[ni].pods[pi].alive = pp.alive;
                        }
                    });
                });
            }
            g.fillStyle = C.void;
            g.fillRect(0, 0, r.width, r.height);
        };

        size();
        const ro = new ResizeObserver(size);
        ro.observe(wrap);

        const handlePointerMove = (e) => {
            const r = cv.getBoundingClientRect();
            const hit = hitTest(e.clientX - r.left, e.clientY - r.top);
            hoverRef.current = hit;
            cv.style.cursor = hit ? "pointer" : "default";
        };

        const handlePointerLeave = () => {
            hoverRef.current = null;
            if (cv) cv.style.cursor = "default";
        };

        const handleClick = (e) => {
            const r = cv.getBoundingClientRect();
            const hit = hitTest(e.clientX - r.left, e.clientY - r.top);
            if (!hit) return;

            const { node, pod } = hit;
            pod.alive = !pod.alive;

            // If pod goes down, requeue its in-flight items gracefully
            if (!pod.alive) {
                for (const p of pod.busy) {
                    p.state = "queued";
                    p.pod = null;
                    p.qi = 0;
                    p.qx = node.fork;
                    p.qy = stateRef.current.spineY;
                    node.queue.unshift(p);
                }
                pod.busy = [];
            }
        };

        cv.addEventListener("pointermove", handlePointerMove);
        cv.addEventListener("pointerleave", handlePointerLeave);
        cv.addEventListener("click", handleClick);

        if (reduced) {
            if (stateRef.current) draw(stateRef.current, performance.now());
            return () => {
                alive = false;
                ro.disconnect();
                cv.removeEventListener("pointermove", handlePointerMove);
                cv.removeEventListener("pointerleave", handlePointerLeave);
                cv.removeEventListener("click", handleClick);
            };
        }

        let uiTick = 0;
        const loop = (now) => {
            if (!alive) return;
            rafRef.current = requestAnimationFrame(loop);
            const S = stateRef.current;
            if (!S) return;
            if (document.hidden) {
                S.last = now;
                return;
            }
            const dt = Math.min(now - S.last, 60);
            S.last = now;
            step(S, dt, now);
            draw(S, now);

            if (now - uiTick > 400) {
                uiTick = now;
                let podsUp = 0;
                let podsTotal = 0;
                for (const n of S.nodes) {
                    for (const p of n.pods) {
                        podsTotal++;
                        if (p.alive) podsUp++;
                    }
                }

                setCounts({
                    closed: S.closed,
                    escalated: S.escalated,
                    inFlight: S.particles.length,
                    rate: S.rate,
                    podsUp,
                    podsTotal,
                });
            }
        };
        rafRef.current = requestAnimationFrame(loop);

        return () => {
            alive = false;
            cancelAnimationFrame(rafRef.current);
            ro.disconnect();
            cv.removeEventListener("pointermove", handlePointerMove);
            cv.removeEventListener("pointerleave", handlePointerLeave);
            cv.removeEventListener("click", handleClick);
        };
    }, [init, step, draw, hitTest, reduced]);

    const isHealthy = counts.podsUp === counts.podsTotal;

    return (
        <div
            className="min-h-screen w-full p-4 sm:p-6"
            style={{ background: C.void, fontFamily: SANS }}
        >
            <div className="mx-auto" style={{ maxWidth: 1180 }}>
                <div
                    className="relative overflow-hidden rounded-xl"
                    style={{ border: `1px solid ${C.line}`, background: C.void }}
                >
                    <div ref={wrapRef} className="relative w-full" style={{ height: 296 }}>
                        <canvas ref={canvasRef} className="block h-full w-full" />

                        <div className="pointer-events-none absolute left-6 top-6">
                            <div
                                style={{
                                    fontFamily: MONO,
                                    fontSize: 9,
                                    fontWeight: 600,
                                    letterSpacing: "0.24em",
                                    color: C.dim,
                                }}
                            >
                                AI SOC · DUAL LANES
                            </div>
                            <div
                                className="mt-1.5"
                                style={{
                                    fontSize: 20,
                                    fontWeight: 650,
                                    color: C.text,
                                    letterSpacing: "-0.01em",
                                }}
                            >
                                Operation Overview
                            </div>
                            <div
                                className="mt-3 flex items-center gap-2"
                                style={{
                                    fontFamily: MONO,
                                    fontSize: 9,
                                    fontWeight: 600,
                                    letterSpacing: "0.08em",
                                    color: C.dim,
                                }}
                            >
                                {mode === "sim" ? (
                                    <>
                                        <span style={{ color: isHealthy ? C.ok : C.warn }}>
                                            {isHealthy ? "● HEALTHY" : "◐ DEGRADED"}
                                        </span>
                                        <span style={{ opacity: 0.5 }}>·</span>
                                        <span>
                                            {counts.podsUp}/{counts.podsTotal} PODS ACTIVE
                                        </span>
                                        <span style={{ opacity: 0.5 }}>·</span>
                                        <span>{counts.inFlight} IN FLIGHT</span>
                                    </>
                                ) : (
                                    <span style={{ opacity: 0.8 }}>○ AWAITING DATA</span>
                                )}
                            </div>
                        </div>

                        <div className="absolute right-6 top-6">
                            <ModeToggle mode={mode} onChange={setMode} />
                        </div>
                    </div>
                </div>

                {/* KPI Metrics */}
                <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
                    {[
                        [
                            "SYSTEM STATUS",
                            isHealthy ? "Healthy" : "Degraded",
                            `${counts.podsUp}/${counts.podsTotal} pods · 1/1 subagent`,
                            isHealthy ? C.ok : C.warn,
                        ],
                        [
                            "POD REDUNDANCY",
                            "Dual Lane",
                            "3 stages · 2 pods/stage (01/02)",
                            C.flow,
                        ],
                        [
                            "AI ANALYSIS PIPELINE",
                            String(counts.inFlight),
                            `${counts.closed.toLocaleString()} completed · ${counts.escalated} failed`,
                            C.text,
                        ],
                        ["AVG DURATION", "178s", "per completed session", C.text],
                    ].map(([k, v, sub, col]) => (
                        <div
                            key={k}
                            className="rounded-xl px-4 py-4"
                            style={{ background: C.surface, border: `1px solid ${C.line}` }}
                        >
                            <div
                                style={{
                                    fontFamily: MONO,
                                    fontSize: 9,
                                    fontWeight: 600,
                                    letterSpacing: "0.14em",
                                    color: C.dim,
                                }}
                            >
                                {k}
                            </div>
                            <div
                                className="mt-2"
                                style={{ fontSize: 26, fontWeight: 650, color: col }}
                            >
                                {v}
                            </div>
                            <div
                                className="mt-1"
                                style={{ fontSize: 11, color: "rgba(160,175,192,0.85)" }}
                            >
                                {sub}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Legend bar */}
                <div
                    className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 px-1"
                    style={{ fontFamily: MONO, fontSize: 10, color: "rgba(160,175,192,0.8)" }}
                >
                    <Legend mark="slot">처리 슬롯 점유 (Active Slot)</Legend>
                    <Legend mark="dual">이중 파드 레인 (01 / 02)</Legend>
                    <Legend mark="hex">서브에이전트 (Subagent)</Legend>
                    <Legend mark="sq">솔루션 도구 (Tools)</Legend>
                    <Legend mark="warn">대기 적체 (Queue Hot)</Legend>
                    <Legend mark="down">파드 장애 (Pod Down)</Legend>
                </div>
            </div>
        </div>
    );
}

function ModeToggle({ mode, onChange }) {
    const base = {
        fontFamily: MONO,
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: "0.1em",
        padding: "5px 11px",
        borderRadius: 6,
        lineHeight: 1,
        transition: "background 140ms, color 140ms",
    };
    return (
        <div
            className="flex"
            style={{
                border: `1px solid ${C.line}`,
                borderRadius: 8,
                padding: 2,
                background: "rgba(19,26,36,0.7)",
                backdropFilter: "blur(6px)",
            }}
        >
            {[
                ["sim", "SIMULATION"],
                ["real", "REAL"],
            ].map(([id, label]) => (
                <button
                    key={id}
                    onClick={() => onChange(id)}
                    style={{
                        ...base,
                        background: mode === id ? "rgba(56,189,248,0.16)" : "transparent",
                        color: mode === id ? C.flow : C.dim,
                    }}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}

function Legend({ mark, children }) {
    const s = 9;
    return (
        <span className="flex items-center gap-1.5">
            <svg width={s + 4} height={s + 4} viewBox="0 0 13 13">
                {mark === "slot" && (
                    <rect x="2" y="3.5" width="9" height="6" rx="3" fill={C.flow} />
                )}
                {mark === "dual" && (
                    <>
                        <rect x="1" y="2" width="11" height="3.5" rx="1.7" fill="rgba(56,189,248,0.4)" />
                        <rect x="1" y="7.5" width="11" height="3.5" rx="1.7" fill="rgba(56,189,248,0.4)" />
                    </>
                )}
                {mark === "hex" && (
                    <polygon
                        points="6.5,1.5 11,4 11,9 6.5,11.5 2,9 2,4"
                        fill="none"
                        stroke={C.flow}
                        strokeWidth="1.2"
                    />
                )}
                {mark === "sq" && <rect x="3.5" y="3.5" width="6" height="6" fill="#94A3B8" />}
                {mark === "warn" && <circle cx="6.5" cy="6.5" r="3.4" fill={C.warn} />}
                {mark === "down" && (
                    <rect
                        x="2"
                        y="3.5"
                        width="9"
                        height="6"
                        rx="3"
                        fill="none"
                        stroke={C.alert}
                        strokeWidth="1.2"
                        strokeDasharray="2 2"
                    />
                )}
            </svg>
            {children}
        </span>
    );
}
