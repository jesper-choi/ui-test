import React, { useRef, useEffect, useState, useCallback } from "react";

/* ------------------------------------------------------------------
   AI SOC — Pipeline Hero (v10 · Laminar Constant-Speed Flow)

   · Uniform Constant Velocity (등속도 유체 모션):
     No abrupt accelerations, no sudden slowdowns, no stop-and-go jerking.
     Particles glide continuously at an exact constant speed along
     smooth C1-continuous Bezier streamline splines.
   · Pure & Minimalist Twin-Core Pods:
     Zero text clutter (no "01", "02", "ERR").
     Sleek floating capsules with soft glowing breathing cores
     and active processing indicators.
   · Stages: ORCHESTRATOR ➔ ENRICHMENT (with Subagent) ➔ TRIAGE
   · Interactive Downtime & Realtime Bypass:
     Click any pod to toggle health. Traffic seamlessly routes
     only to active pods without any jerky speed jumps.
------------------------------------------------------------------- */

const C = {
    void: "#0A0E14",
    surface: "#101622",
    cardBg: "rgba(16, 22, 34, 0.7)",
    line: "#1E293B",
    flow: "#38BDF8",
    flowGlow: "rgba(56, 189, 248, 0.2)",
    ok: "#22C55E",
    alert: "#F43F5E",
    warn: "#F59E0B",
    dim: "#64748B",
    text: "#E2E8F0",
    textMuted: "#94A3B8",
};

const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace';
const SANS =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, sans-serif';

const STAGES = [
    { key: "orchestrator", label: "ORCHESTRATOR", cap: 4, tools: 0 },
    { key: "enrichment", label: "ENRICHMENT", cap: 3, tools: 4 },
    { key: "triage", label: "TRIAGE", cap: 4, tools: 0 },
];

const PODS_PER_STAGE = 2;
const POD_OFFSET_Y = 22; // Upper Pod at -22px, Lower Pod at +22px
const POD_W = 40;
const POD_H = 18;
const POD_R = 9;

// Constant flow speed in pixels per millisecond (approx 160 px/sec)
const BASE_SPEED = 0.155;

const SUB_DY = 56;
const SUB_R = 9;
const TOOL_DY = 30;
const TOOL_GAP = 16;
const STATUS_DY = 110;

const FORK_DY = 42;

const LS = (g, v) => {
    if ("letterSpacing" in g) g.letterSpacing = v;
};

// Smoothstep for pure C1 continuous spatial blending without speed distortion
const smoothstep = (t) => {
    const c = Math.max(0, Math.min(1, t));
    return c * c * (3 - 2 * c);
};

const lerp = (a, b, t) => a + (b - a) * t;

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
    grad.addColorStop(0.3, hex + "A0");
    grad.addColorStop(0.65, hex + "20");
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
        rate: 42,
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
        const spineY = Math.round(h * 0.44);
        const padL = Math.max(180, w * 0.18);
        const padR = Math.max(190, w * 0.2);
        const span = w - padL - padR;

        const inX = padL - Math.min(108, padL - 78);
        const outX = w - padR + Math.min(50, padR - 100);

        const nodes = STAGES.map((s, i) => {
            const x = padL + (span * (i + 0.5)) / STAGES.length;
            const fork = x - POD_W / 2 - 28;
            const merge = x + POD_W / 2 + 28;

            const pods = [];
            for (let l = 0; l < PODS_PER_STAGE; l++) {
                const py = spineY + (l === 0 ? -POD_OFFSET_Y : POD_OFFSET_Y);
                pods.push({
                    lane: l,
                    alive: true,
                    activeCount: 0,
                    pos: { x, y: py },
                    left: x - POD_W / 2,
                    right: x + POD_W / 2,
                    beat: Math.random() * 1000,
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
                pods,
                podChoiceIndex: 0,
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
            inX,
            outX,
            splitX: nodes[nodes.length - 1].merge + (outX - nodes[nodes.length - 1].merge) * 0.28,
            nodes,
            particles: [],
            closed: 1284,
            escalated: 37,
            spawnAcc: 0,
            rate: 42,
            last: performance.now(),
            sprites: {
                flow: makeSprite(C.flow, 24),
                warn: makeSprite(C.warn, 24),
                alert: makeSprite(C.alert, 24),
            },
        };
    }, []);

    /* Select pod deterministically & alternate lane */
    const assignPod = (node) => {
        const alivePods = node.pods.filter((p) => p.alive);
        if (!alivePods.length) return null;
        const chosen = alivePods[node.podChoiceIndex % alivePods.length];
        node.podChoiceIndex++;
        return chosen;
    };

    const step = useCallback((S, dt, now) => {
        const running = cfg.current.mode === "sim";

        let rate = 0;
        if (running) {
            rate = 44 + 24 * Math.sin(now / 23000);
            S.rate = Math.max(6, Math.round(rate));
        } else {
            S.rate = 0;
        }

        // Particle generation with uniform spacing
        if (running) {
            const per = 60000 / Math.max(rate, 1);
            S.spawnAcc += dt;
            while (S.spawnAcc > per) {
                S.spawnAcc -= per;
                if (S.particles.length < 120) {
                    // Assign which lane/pod the particle will pass for each stage
                    const stagePods = S.nodes.map((node) => assignPod(node));
                    const failed = Math.random() < 0.16; // 16% escalation rate

                    S.particles.push({
                        x: S.inX - 10,
                        speed: BASE_SPEED,
                        failed,
                        stagePods, // pre-assigned active pods
                        lastX: null,
                        lastY: null,
                        jit: (Math.random() - 0.5) * 2,
                    });
                }
            }
        } else {
            S.spawnAcc = 0;
        }

        // Reset active pod counters
        for (const n of S.nodes) {
            for (const pod of n.pods) {
                pod.activeCount = 0;
                pod.beat += dt;
            }
        }

        // Advance particles with STRICT CONSTANT VELOCITY (px = speed * dt)
        for (let i = S.particles.length - 1; i >= 0; i--) {
            const p = S.particles[i];
            p.x += dt * p.speed;

            // Recheck assigned pods dynamically if a pod dies mid-flight
            for (let sIdx = 0; sIdx < S.nodes.length; sIdx++) {
                const node = S.nodes[sIdx];
                let pod = p.stagePods[sIdx];
                if (!pod || !pod.alive) {
                    // Reassign to available alive pod
                    const alive = node.pods.filter((p) => p.alive);
                    p.stagePods[sIdx] = alive.length ? alive[0] : null;
                }

                // Check if particle is currently inside this pod
                if (pod && p.x >= pod.left && p.x <= pod.right) {
                    pod.activeCount = Math.min(node.cap, pod.activeCount + 1);

                    // Trigger subagent pulses when passing Enrichment
                    if (node.sub && node.calls.length < 2 && Math.random() < 0.08) {
                        const k = node.sub.seats.length;
                        const idx = (Math.random() * k) | 0;
                        node.calls.push({
                            phase: 0,
                            t: 0,
                            idx,
                        });
                    }
                }
            }

            // Exit stage
            if (p.x >= S.outX + 10) {
                if (p.failed) S.escalated++;
                else S.closed++;
                S.particles.splice(i, 1);
            }
        }

        // Subagent animations
        for (const n of S.nodes) {
            if (!n.sub) continue;
            for (let k = n.calls.length - 1; k >= 0; k--) {
                const c = n.calls[k];
                c.t += dt * 0.0035;
                if (c.phase === 0) {
                    if (c.t >= 1) {
                        c.phase = 1;
                        c.t = 0;
                        n.sub.seats[c.idx].flash = 1;
                        n.sub.flash = 1;
                    }
                } else if (c.phase === 1) {
                    if (c.t >= 1) {
                        c.phase = 2;
                        c.t = 0;
                    }
                } else {
                    if (c.t >= 1) {
                        n.calls.splice(k, 1);
                    }
                }
            }
            n.sub.flash = Math.max(0, n.sub.flash - dt * 0.0025);
            for (const s of n.sub.seats) {
                s.flash = Math.max(0, s.flash - dt * 0.002);
            }
        }
    }, []);

    /* Pure continuous spatial position calculator with ZERO velocity alteration */
    const getParticlePos = (S, p) => {
        const x = p.x;
        const { spineY, splitX, outX, nodes } = S;
        let y = spineY;

        // Check if inside any stage's branch zone
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            const pod = p.stagePods[i];
            const targetPodY = pod ? pod.pos.y : spineY;

            if (x >= node.fork && x <= node.merge) {
                if (x < node.pods[0].left) {
                    // Branch in: from spineY to targetPodY
                    const progress = (x - node.fork) / (node.pods[0].left - node.fork);
                    y = lerp(spineY, targetPodY, smoothstep(progress));
                } else if (x <= node.pods[0].right) {
                    // Inside Pod: exact targetPodY
                    y = targetPodY;
                } else {
                    // Branch out: from targetPodY back to spineY
                    const progress = (x - node.pods[0].right) / (node.merge - node.pods[0].right);
                    y = lerp(targetPodY, spineY, smoothstep(progress));
                }
                return { x, y: y + p.jit, inPod: x >= node.pods[0].left && x <= node.pods[0].right };
            }
        }

        // Exit Fork branching
        if (x > splitX) {
            const progress = (x - splitX) / (outX - splitX);
            const targetExitY = spineY + (p.failed ? 1 : -1) * FORK_DY;
            y = lerp(spineY, targetExitY, smoothstep(progress));
        }

        return { x, y: y + p.jit, inPod: false };
    };

    const draw = useCallback((S, now) => {
        const cv = canvasRef.current;
        if (!cv) return;
        const g = cv.getContext("2d");
        const { w, h, spineY, inX, outX, splitX, nodes } = S;
        const idle = cfg.current.mode !== "sim";
        const k = idle ? 0.4 : 1;

        g.fillStyle = "rgba(10,14,20,0.3)";
        g.fillRect(0, 0, w, h);

        /* ---------- Main Spine Guide ---------- */
        g.lineWidth = 1;
        for (let i = 0; i < nodes.length; i++) {
            const segStart = i === 0 ? inX : nodes[i - 1].merge;
            const segEnd = nodes[i].fork;
            g.strokeStyle = `rgba(56,189,248,${0.18 * k})`;
            g.beginPath();
            g.moveTo(segStart, spineY);
            g.lineTo(segEnd, spineY);
            g.stroke();
        }

        /* ---------- Twin-Core Branch Guides ---------- */
        for (const n of nodes) {
            for (const pod of n.pods) {
                const col = pod.alive
                    ? `rgba(56,189,248,${0.14 * k})`
                    : `rgba(244,63,94,${0.12 * k})`;
                g.strokeStyle = col;
                g.lineWidth = 1;

                // Smooth cubic guide into pod
                g.beginPath();
                g.moveTo(n.fork, spineY);
                g.bezierCurveTo(
                    n.fork + 14,
                    spineY,
                    pod.left - 10,
                    pod.pos.y,
                    pod.left,
                    pod.pos.y
                );
                g.stroke();

                // Smooth cubic guide out of pod
                g.beginPath();
                g.moveTo(pod.right, pod.pos.y);
                g.bezierCurveTo(
                    pod.right + 10,
                    pod.pos.y,
                    n.merge - 14,
                    spineY,
                    n.merge,
                    spineY
                );
                g.stroke();
            }
        }

        /* ---------- Exit Curves ---------- */
        const lastMerge = nodes[nodes.length - 1].merge;
        g.strokeStyle = `rgba(56,189,248,${0.18 * k})`;
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
                outX - 20,
                spineY + dir * FORK_DY,
                outX,
                spineY + dir * FORK_DY
            );
            g.stroke();
        };
        mkExit(-1, `rgba(34,197,94,${0.4 * k})`);
        mkExit(1, `rgba(244,63,94,${0.4 * k})`);

        /* ---------- Subagent (Enrichment Only) ---------- */
        for (const n of nodes) {
            if (!n.sub) continue;
            const sub = n.sub;

            g.lineWidth = 1;
            g.strokeStyle = `rgba(56,189,248,${(0.18 + sub.flash * 0.3) * k})`;
            g.beginPath();
            g.moveTo(n.x, spineY + POD_OFFSET_Y + POD_H / 2);
            g.lineTo(sub.x, sub.y - SUB_R);
            g.stroke();

            for (const s of sub.seats) {
                const dx = s.x - sub.x;
                const dy = s.y - sub.y;
                const len = Math.hypot(dx, dy) || 1;
                g.strokeStyle = `rgba(148,163,184,${(0.16 + s.flash * 0.28) * k})`;
                g.beginPath();
                g.moveTo(sub.x + (dx / len) * SUB_R, sub.y + (dy / len) * SUB_R);
                g.lineTo(s.x - (dx / len) * 4, s.y - (dy / len) * 4);
                g.stroke();
            }

            for (const s of sub.seats) {
                const lit = s.flash > 0.02;
                g.fillStyle = lit ? C.flow : `rgba(148,163,184,${0.35 * k})`;
                g.beginPath();
                g.arc(s.x, s.y, 2 + (lit ? 0.8 : 0), 0, Math.PI * 2);
                g.fill();
            }

            g.lineWidth = 1.2;
            g.strokeStyle = `rgba(56,189,248,${(0.45 + sub.flash * 0.4) * k})`;
            hexPath(g, sub.x, sub.y, SUB_R);
            g.fillStyle = C.void;
            g.fill();
            g.stroke();

            g.fillStyle = `rgba(56,189,248,${(0.55 + sub.flash * 0.4) * k})`;
            g.beginPath();
            g.arc(sub.x, sub.y, 2.2, 0, Math.PI * 2);
            g.fill();

            for (const c of n.calls) {
                const s = sub.seats[c.idx];
                if (c.phase === 0) {
                    const py = lerp(spineY + POD_OFFSET_Y + POD_H / 2, sub.y - SUB_R, c.t);
                    g.fillStyle = "rgba(56,189,248,0.9)";
                    g.beginPath();
                    g.arc(n.x, py, 1.8, 0, Math.PI * 2);
                    g.fill();
                } else if (c.phase === 1) {
                    const px = lerp(sub.x, s.x, c.t);
                    const py = lerp(sub.y, s.y, c.t);
                    g.fillStyle = "rgba(56,189,248,0.9)";
                    g.beginPath();
                    g.arc(px, py, 1.6, 0, Math.PI * 2);
                    g.fill();
                } else {
                    const px = lerp(s.x, sub.x, c.t);
                    const py = lerp(s.y, sub.y, c.t);
                    g.fillStyle = "rgba(241,245,249,0.9)";
                    g.beginPath();
                    g.arc(px, py, 1.6, 0, Math.PI * 2);
                    g.fill();
                }
            }
        }

        /* ---------- Particles with Uniform Motion ---------- */
        for (const p of S.particles) {
            const pos = getParticlePos(S, p);
            let sprite = S.sprites.flow;
            let rgb = "56,189,248";
            if (p.failed) {
                sprite = S.sprites.alert;
                rgb = "244,63,94";
            }

            // Continuous trail
            if (p.lastX != null && Math.abs(pos.x - p.lastX) < 20) {
                g.strokeStyle = `rgba(${rgb},0.35)`;
                g.lineWidth = 1.2;
                g.beginPath();
                g.moveTo(p.lastX, p.lastY);
                g.lineTo(pos.x, pos.y);
                g.stroke();
            }

            const s = 10;
            g.drawImage(sprite, pos.x - s / 2, pos.y - s / 2, s, s);
            p.lastX = pos.x;
            p.lastY = pos.y;
        }

        /* ---------- Pure Twin-Core Pods (Zero Text Clutter) ---------- */
        for (const n of nodes) {
            const totalCap = n.cap * n.pods.filter((p) => p.alive).length;
            const totalBusy = n.pods.reduce((acc, p) => acc + p.activeCount, 0);

            // Stage Label & Capacity
            const headerY = spineY - POD_OFFSET_Y - POD_H / 2 - 14;
            g.textAlign = "center";
            g.font = `600 9px ${MONO}`;
            LS(g, "0.14em");
            g.fillStyle = `rgba(100,116,139,${k})`;
            g.fillText(n.label, n.x, headerY - 10);

            g.font = `600 10.5px ${MONO}`;
            LS(g, "0.04em");
            g.fillStyle = `rgba(226,232,240,${0.9 * k})`;
            g.fillText(
                idle ? `—/${n.cap * 2}` : `${totalBusy}/${totalCap || n.cap * 2}`,
                n.x,
                headerY + 4
            );
            LS(g, "0px");

            // Render Upper & Lower Pods
            n.pods.forEach((pod) => {
                const isHovered =
                    hoverRef.current &&
                    hoverRef.current.node === n &&
                    hoverRef.current.pod === pod;
                const px = pod.pos.x;
                const py = pod.pos.y;

                // Pill Background
                g.fillStyle = "rgba(16, 22, 34, 0.85)";
                rr(g, px - POD_W / 2, py - POD_H / 2, POD_W, POD_H, POD_R);
                g.fill();

                // Active glowing interior
                if (pod.alive && pod.activeCount > 0) {
                    const ratio = pod.activeCount / n.cap;
                    g.fillStyle = `rgba(56,189,248,${0.15 * ratio * k})`;
                    rr(g, px - POD_W / 2, py - POD_H / 2, POD_W, POD_H, POD_R);
                    g.fill();
                }

                // Border
                g.lineWidth = isHovered ? 1.4 : 1;
                if (pod.alive) {
                    g.strokeStyle = isHovered
                        ? "rgba(56,189,248,0.85)"
                        : `rgba(100,116,139,${0.24 * k})`;
                    rr(g, px - POD_W / 2, py - POD_H / 2, POD_W, POD_H, POD_R);
                    g.stroke();
                } else {
                    g.strokeStyle = "rgba(244,63,94,0.55)";
                    g.setLineDash([2.5, 2.5]);
                    rr(g, px - POD_W / 2, py - POD_H / 2, POD_W, POD_H, POD_R);
                    g.stroke();
                    g.setLineDash([]);
                }

                // Inside the pod: Left pulsing light + Right minimalist capacity dots
                if (pod.alive) {
                    const pulse = 0.5 + 0.5 * Math.sin(pod.beat / 600);
                    const isBusy = pod.activeCount > 0;

                    g.fillStyle = `rgba(56,189,248,${(isBusy ? 0.8 : 0.4) + pulse * 0.2})`;
                    g.beginPath();
                    g.arc(px - POD_W / 2 + 8, py, 2.3 + (isBusy ? pulse * 0.5 : 0), 0, Math.PI * 2);
                    g.fill();

                    // Capacity indicator dots
                    const dotCount = n.cap;
                    const dotR = 1.6;
                    const dotGap = 4.5;
                    const totalDotsW = (dotCount - 1) * dotGap;
                    const dotsStartX = px + POD_W / 2 - 8 - totalDotsW;

                    for (let dIdx = 0; dIdx < dotCount; dIdx++) {
                        const isOccupied = dIdx < pod.activeCount;
                        g.fillStyle = isOccupied ? C.flow : `rgba(100,116,139,${0.25 * k})`;
                        g.beginPath();
                        g.arc(dotsStartX + dIdx * dotGap, py, dotR, 0, Math.PI * 2);
                        g.fill();
                    }
                } else {
                    // Offline red dot
                    g.fillStyle = "rgba(244,63,94,0.85)";
                    g.beginPath();
                    g.arc(px, py, 2.2, 0, Math.PI * 2);
                    g.fill();
                }
            });
        }

        /* ---------- Ingest ---------- */
        const feedX = inX - 52;
        const feed = (dir) => {
            g.strokeStyle = `rgba(56,189,248,${0.18 * k})`;
            g.lineWidth = 1;
            g.beginPath();
            g.moveTo(feedX, spineY + dir * 22);
            g.bezierCurveTo(
                feedX + 20,
                spineY + dir * 22,
                inX - 24,
                spineY,
                inX,
                spineY
            );
            g.stroke();
            g.fillStyle = `rgba(56,189,248,${0.35 * k})`;
            g.beginPath();
            g.arc(feedX, spineY + dir * 22, 1.5, 0, Math.PI * 2);
            g.fill();
        };
        feed(-1);
        feed(0);
        feed(1);

        g.textAlign = "left";
        g.font = `600 8.5px ${MONO}`;
        LS(g, "0.1em");
        g.fillStyle = `rgba(100,116,139,${k})`;
        g.fillText("ALERT INGEST", feedX, spineY + 42);
        LS(g, "0px");
        g.font = `600 16px ${MONO}`;
        g.fillStyle = idle ? "rgba(226,232,240,0.4)" : "rgba(226,232,240,0.92)";
        g.fillText(idle ? "—" : `${S.rate}`, feedX, spineY + 61);
        if (!idle) {
            const rw = g.measureText(`${S.rate}`).width;
            g.font = `600 8.5px ${MONO}`;
            g.fillStyle = `rgba(100,116,139,${k})`;
            g.fillText("/MIN", feedX + rw + 4, spineY + 61);
        }

        /* ---------- Exit Readouts ---------- */
        const ex = outX + 12;
        const win = (label, color, x, y) => {
            g.font = `600 8.5px ${MONO}`;
            LS(g, "0.08em");
            g.fillStyle = color;
            g.fillText(label, x, y);
            const lw = g.measureText(label).width;
            const tag = " · 24H";
            g.fillStyle = `rgba(100,116,139,${k})`;
            g.fillText(tag, x + lw, y);
            LS(g, "0px");
        };

        const closedY = spineY - FORK_DY;
        win("AUTO-CLOSED", `rgba(34,197,94,${0.9 * k})`, ex, closedY - 18);
        g.font = `600 16px ${MONO}`;
        g.fillStyle = idle ? "rgba(34,197,94,0.45)" : C.ok;
        g.fillText(idle ? "—" : S.closed.toLocaleString(), ex, closedY + 4);

        const escY = spineY + FORK_DY;
        win("ESCALATED", `rgba(244,63,94,${0.9 * k})`, ex, escY - 10);
        g.font = `600 16px ${MONO}`;
        g.fillStyle = idle ? "rgba(244,63,94,0.45)" : C.alert;
        g.fillText(idle ? "—" : S.escalated.toLocaleString(), ex, escY + 12);

        if (idle) {
            g.textAlign = "center";
            g.font = `600 9px ${MONO}`;
            LS(g, "0.08em");
            g.fillStyle = "rgba(100,116,139,0.9)";
            g.fillText("NO LIVE FEED", w / 2, spineY + STATUS_DY - 14);
            LS(g, "0px");
        }
    }, []);

    const getPodAt = useCallback((clientX, clientY) => {
        const cv = canvasRef.current;
        const S = stateRef.current;
        if (!cv || !S) return null;
        const rect = cv.getBoundingClientRect();
        const mx = clientX - rect.left;
        const my = clientY - rect.top;

        for (const node of S.nodes) {
            for (const pod of node.pods) {
                if (
                    mx >= pod.pos.x - POD_W / 2 - 4 &&
                    mx <= pod.pos.x + POD_W / 2 + 4 &&
                    my >= pod.pos.y - POD_H / 2 - 4 &&
                    my <= pod.pos.y + POD_H / 2 + 4
                ) {
                    return { node, pod };
                }
            }
        }
        return null;
    }, []);

    const handlePointerMove = useCallback(
        (e) => {
            const hit = getPodAt(e.clientX, e.clientY);
            hoverRef.current = hit;
            if (canvasRef.current) {
                canvasRef.current.style.cursor = hit ? "pointer" : "default";
            }
        },
        [getPodAt]
    );

    const handlePointerLeave = useCallback(() => {
        hoverRef.current = null;
        if (canvasRef.current) {
            canvasRef.current.style.cursor = "default";
        }
    }, []);

    const handleClick = useCallback(
        (e) => {
            const hit = getPodAt(e.clientX, e.clientY);
            if (!hit) return;
            const { pod } = hit;
            pod.alive = !pod.alive;
        },
        [getPodAt]
    );

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
                stateRef.current.nodes.forEach((n, ni) => {
                    if (prev.nodes[ni]) {
                        n.pods.forEach((p, pi) => {
                            if (prev.nodes[ni].pods[pi]) {
                                p.alive = prev.nodes[ni].pods[pi].alive;
                            }
                        });
                    }
                });
            }
            g.fillStyle = C.void;
            g.fillRect(0, 0, r.width, r.height);
        };

        size();
        const ro = new ResizeObserver(size);
        ro.observe(wrap);

        if (reduced) {
            if (stateRef.current) draw(stateRef.current, performance.now());
            return () => {
                alive = false;
                ro.disconnect();
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
            const dt = Math.min(now - S.last, 40);
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
        };
    }, [init, step, draw, reduced]);

    const isHealthy = counts.podsUp === counts.podsTotal;

    return (
        <div
            className="min-h-screen w-full p-4 sm:p-6"
            style={{ background: C.void, fontFamily: SANS }}
        >
            <div className="mx-auto" style={{ maxWidth: 1120 }}>
                {/* Hero Panel */}
                <div
                    className="relative overflow-hidden rounded-2xl border"
                    style={{ borderColor: C.line, background: C.void }}
                >
                    <div ref={wrapRef} className="relative w-full" style={{ height: 275 }}>
                        <canvas
                            ref={canvasRef}
                            className="block h-full w-full"
                            onPointerMove={handlePointerMove}
                            onPointerLeave={handlePointerLeave}
                            onClick={handleClick}
                        />

                        {/* Top Left Title & Status */}
                        <div className="pointer-events-none absolute left-6 top-5">
                            <div
                                style={{
                                    fontFamily: MONO,
                                    fontSize: 9,
                                    fontWeight: 600,
                                    letterSpacing: "0.2em",
                                    color: C.dim,
                                }}
                            >
                                AI SOC PIPELINE
                            </div>
                            <div
                                className="mt-1"
                                style={{
                                    fontSize: 18,
                                    fontWeight: 650,
                                    color: C.text,
                                    letterSpacing: "-0.01em",
                                }}
                            >
                                Operation Overview
                            </div>
                            <div
                                className="mt-2 flex items-center gap-2"
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
                                        <span style={{ opacity: 0.4 }}>·</span>
                                        <span>
                                            {counts.podsUp}/{counts.podsTotal} PODS
                                        </span>
                                        <span style={{ opacity: 0.4 }}>·</span>
                                        <span>{counts.inFlight} IN FLIGHT</span>
                                    </>
                                ) : (
                                    <span style={{ opacity: 0.8 }}>○ AWAITING DATA</span>
                                )}
                            </div>
                        </div>

                        {/* Mode Toggle */}
                        <div className="absolute right-6 top-5">
                            <ModeToggle mode={mode} onChange={setMode} />
                        </div>

                        {/* Minimal Hint */}
                        <div className="pointer-events-none absolute bottom-3 left-6 font-mono text-[8.5px] tracking-wider text-[#64748B]/50">
                            Click pod nodes to toggle downtime simulation
                        </div>
                    </div>
                </div>

                {/* Minimal KPI Cards */}
                <div className="mt-4 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
                    {[
                        [
                            "SYSTEM STATUS",
                            isHealthy ? "Healthy" : "Degraded",
                            `${counts.podsUp}/${counts.podsTotal} active pods`,
                            isHealthy ? C.ok : C.warn,
                        ],
                        [
                            "ARCHITECTURE",
                            "Dual Core",
                            "3 stages · 2 pods / stage",
                            C.flow,
                        ],
                        [
                            "ANALYSIS PIPELINE",
                            String(counts.inFlight),
                            `${counts.closed.toLocaleString()} closed · ${counts.escalated} escalated`,
                            C.text,
                        ],
                        ["AVG LATENCY", "164s", "end-to-end resolution", C.text],
                    ].map(([k, v, sub, col]) => (
                        <div
                            key={k}
                            className="rounded-xl px-4 py-3.5 border"
                            style={{
                                background: C.cardBg,
                                borderColor: C.line,
                            }}
                        >
                            <div
                                style={{
                                    fontFamily: MONO,
                                    fontSize: 8.5,
                                    fontWeight: 600,
                                    letterSpacing: "0.12em",
                                    color: C.dim,
                                }}
                            >
                                {k}
                            </div>
                            <div
                                className="mt-1.5"
                                style={{ fontSize: 22, fontWeight: 650, color: col }}
                            >
                                {v}
                            </div>
                            <div
                                className="mt-0.5"
                                style={{ fontSize: 11, color: "rgba(148,163,184,0.8)" }}
                            >
                                {sub}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Ultra Minimal Legend */}
                <div
                    className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-2 px-1"
                    style={{ fontFamily: MONO, fontSize: 9.5, color: "rgba(148,163,184,0.75)" }}
                >
                    <Legend mark="core">Twin Core Pods</Legend>
                    <Legend mark="hex">Subagent Dispatcher</Legend>
                    <Legend mark="down">Pod Offline</Legend>
                </div>
            </div>
        </div>
    );
}

function ModeToggle({ mode, onChange }) {
    const base = {
        fontFamily: MONO,
        fontSize: 8.5,
        fontWeight: 600,
        letterSpacing: "0.1em",
        padding: "4.5px 10px",
        borderRadius: 5,
        lineHeight: 1,
        transition: "background 140ms, color 140ms",
    };
    return (
        <div
            className="flex"
            style={{
                border: `1px solid ${C.line}`,
                borderRadius: 7,
                padding: 2,
                background: "rgba(16,22,34,0.8)",
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
                        background: mode === id ? "rgba(56,189,248,0.15)" : "transparent",
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
    const s = 8;
    return (
        <span className="flex items-center gap-1.5">
            <svg width={s + 4} height={s + 4} viewBox="0 0 12 12">
                {mark === "core" && (
                    <rect x="1.5" y="3" width="9" height="6" rx="3" fill="none" stroke={C.flow} strokeWidth="1.2" />
                )}
                {mark === "hex" && (
                    <polygon
                        points="6,1.5 10,3.75 10,8.25 6,10.5 2,8.25 2,3.75"
                        fill="none"
                        stroke={C.flow}
                        strokeWidth="1.1"
                    />
                )}
                {mark === "down" && (
                    <circle cx="6" cy="6" r="2.5" fill={C.alert} />
                )}
            </svg>
            {children}
        </span>
    );
}
