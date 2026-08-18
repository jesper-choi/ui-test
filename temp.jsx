import React, { useRef, useEffect, useState, useCallback } from "react";

/* ------------------------------------------------------------------
   AI SOC — Pipeline Hero  (v6)

   · SIMULATION / REAL is one segmented control in the band itself.
     Simulation drives itself with tuned values that drift, so the
     congestion you see is emergent rather than scripted.
   · Exit totals are 24-hour aggregates and now say so.
   · Exit column re-spaced: each text block is centred on the curve
     endpoint it belongs to, not floating near it.
   · Subagent tree rebuilt. Solutions sit on a common baseline instead
     of a fan arc — with r18 nodes the arc read as a growth.
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
    { key: "orchestrator", label: "ORCHESTRATOR", cap: 4, service: 450, tools: 0 },
    { key: "enrichment", label: "ENRICHMENT", cap: 3, service: 1400, tools: 6 },
    { key: "triage", label: "TRIAGE", cap: 4, service: 800, tools: 0 },
];

const NODE_R = 18;
const QUEUE_HOT = 6;
const QUEUE_SLOTS = 14;
const QUEUE_GAP = 7;

const SUB_DY = 52; // hexagon below the spine
const SUB_R = 11;
const TOOL_DY = 40; // solution row below the hexagon
const TOOL_GAP = 17;
const STATUS_DY = 118;

const FORK_DY = 48; // exit curve endpoints, above / below the spine

/* Canvas letter-spacing lands in Chrome 99+; harmless where absent. */
const LS = (g, v) => {
    if ("letterSpacing" in g) g.letterSpacing = v;
};

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const lerp = (a, b, t) => a + (b - a) * t;

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

/* Where the live numbers would come from. Swap the body for a real
   fetch and the band drives itself off production data. */
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
                // const r = await fetch("/api/pipeline/live");
                // if (alive) setData(await r.json());
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

    const [mode, setMode] = useState("sim");
    const [counts, setCounts] = useState({ closed: 0, escalated: 0, inFlight: 0, rate: 0 });
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
        const spineY = Math.round(h * 0.472);
        const padL = Math.max(206, w * 0.175);
        const padR = Math.max(214, w * 0.2);
        const span = w - padL - padR;

        const nodes = STAGES.map((s, i) => {
            const x = padL + (span * (i + 0.5)) / STAGES.length;
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
            return { ...s, x, sub, inService: [], queue: [], ring: 0, heat: 0, calls: [] };
        });

        return {
            w,
            h,
            spineY,
            padL,
            padR,
            gap: span / STAGES.length,
            inX: padL - Math.min(118, padL - 88),
            outX: w - padR + Math.min(56, padR - 112),
            nodes,
            particles: [],
            linkLoad: new Array(STAGES.length + 1).fill(0),
            closed: 1284,
            escalated: 37,
            acc: 0,
            rate: 44,
            last: performance.now(),
            sprites: {
                flow: makeSprite(C.flow, 30),
                warn: makeSprite(C.warn, 30),
                alert: makeSprite(C.alert, 30),
            },
        };
    }, []);

    const step = useCallback((S, dt, now) => {
        const running = cfg.current.mode === "sim";

        /* Tuned simulation. Two drifts on different periods: when they
           align, Enrichment falls behind and a queue forms on its own. */
        let rate = 0;
        if (running) {
            rate = 48 + 34 * Math.sin(now / 23000);
            S.nodes[1].service = 1200 + 1300 * (0.5 + 0.5 * Math.sin(now / 31000));
            S.rate = Math.max(6, Math.round(rate));
        } else {
            S.rate = 0;
        }

        if (running) {
            const per = 60000 / Math.max(rate, 1);
            S.acc += dt;
            while (S.acc > per) {
                S.acc -= per;
                if (S.particles.length < 260) {
                    S.particles.push({
                        seg: -1,
                        t: Math.random() * 0.25,
                        lane: (Math.random() - 0.5) * 16,
                        sev: 0.7 + Math.random() * 0.55,
                        state: "travel",
                        failed: false,
                        qi: 0,
                        jit: Math.random() * 6.28,
                        px: null,
                        py: null,
                    });
                }
            }
        } else {
            S.acc = 0;
        }

        const speed = 0.00052;
        const load = new Array(S.linkLoad.length).fill(0);

        for (let i = S.particles.length - 1; i >= 0; i--) {
            const p = S.particles[i];
            if (p.state !== "travel") continue;
            load[p.seg + 1]++;
            p.t += dt * speed * (0.88 + p.sev * 0.2);
            if (p.t >= 1) {
                const next = p.seg + 1;
                if (next >= S.nodes.length) {
                    if (p.failed) S.escalated++;
                    else S.closed++;
                    S.particles.splice(i, 1);
                    continue;
                }
                p.state = "queued";
                p.seg = next;
                p.t = 0;
                S.nodes[next].queue.push(p);
            }
        }
        for (let i = 0; i < load.length; i++)
            S.linkLoad[i] += (load[i] - S.linkLoad[i]) * Math.min(dt * 0.006, 1);

        for (const n of S.nodes) {
            while (n.inService.length < n.cap && n.queue.length) {
                const p = n.queue.shift();
                p.state = "service";
                p.doneAt = now + n.service * (0.7 + Math.random() * 0.6);
                n.inService.push(p);
                n.ring = 1;
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
            for (let k = n.inService.length - 1; k >= 0; k--) {
                const p = n.inService[k];
                if (now >= p.doneAt) {
                    n.inService.splice(k, 1);
                    p.state = "travel";
                    p.t = 0;
                    p.lane = (Math.random() - 0.5) * 16;
                    if (n.key === "triage" && Math.random() < 0.16) p.failed = true;
                }
            }

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

            if (n.sub) {
                n.sub.flash = Math.max(0, n.sub.flash - dt * 0.0022);
                n.sub.busy +=
                    (Math.min(n.calls.length / 3, 1) - n.sub.busy) * Math.min(dt * 0.005, 1);
                for (const s of n.sub.seats) s.flash = Math.max(0, s.flash - dt * 0.0019);
            }

            n.queue.forEach((p, qi) => (p.qi = qi));
            n.ring = Math.max(0, n.ring - dt * 0.0026);
            const target = Math.min(n.queue.length / (QUEUE_HOT * 1.6), 1);
            n.heat += (target - n.heat) * Math.min(dt * 0.004, 1);
        }
    }, []);

    const posOf = useCallback((S, p, now) => {
        const { spineY, inX, outX } = S;
        const N = S.nodes;
        if (p.state === "queued") {
            const n = N[p.seg];
            const slot = Math.min(p.qi, QUEUE_SLOTS);
            return {
                x: n.x - NODE_R - 8 - slot * QUEUE_GAP,
                y: spineY + Math.sin(p.jit) * 1.6,
                q: true,
                deep: p.qi / QUEUE_SLOTS,
            };
        }
        if (p.state === "service") {
            const n = N[p.seg];
            const a = now * 0.0032 + p.jit;
            return { x: n.x + Math.cos(a) * 6, y: spineY + Math.sin(a) * 6, svc: true };
        }
        const from = p.seg < 0 ? inX : N[p.seg].x;
        const last = p.seg + 1 >= N.length;
        const to = last ? outX : N[p.seg + 1].x;
        const e = easeInOut(p.t);
        const x = from + (to - from) * e;
        let y = spineY + p.lane * (1 - e);
        if (last) y = spineY + (p.failed ? 1 : -1) * e * e * FORK_DY;
        const fadeIn = p.seg < 0 ? Math.min(p.t * 3.5, 1) : 1;
        const fadeOut = last ? 1 - Math.max(0, (p.t - 0.76) * 4.2) : 1;
        return { x, y, a: fadeIn * fadeOut };
    }, []);

    const draw = useCallback(
        (S, now) => {
            const cv = canvasRef.current;
            if (!cv) return;
            const g = cv.getContext("2d");
            const { w, h, spineY, inX, outX, nodes, gap } = S;
            const idle = cfg.current.mode !== "sim";
            const k = idle ? 0.45 : 1; // dim the whole structure when not running

            g.fillStyle = "rgba(10,14,20,0.28)";
            g.fillRect(0, 0, w, h);

            /* ---------- spine ---------- */
            g.lineWidth = 1;
            const pts = [inX, ...nodes.map((n) => n.x), outX];
            for (let i = 0; i < pts.length - 2; i++) {
                const lit = Math.min(S.linkLoad[i] / 6, 1);
                g.strokeStyle = `rgba(56,189,248,${(0.16 + lit * 0.3) * k})`;
                g.beginPath();
                g.moveTo(pts[i] + (i === 0 ? 0 : NODE_R), spineY);
                g.lineTo(pts[i + 1] - NODE_R, spineY);
                g.stroke();
            }

            /* ---------- exit: one stem, one split ---------- */
            const forkX = nodes[nodes.length - 1].x + NODE_R;
            const splitX = forkX + (outX - forkX) * 0.28;
            g.strokeStyle = `rgba(56,189,248,${(0.16 + Math.min(S.linkLoad[S.linkLoad.length - 1] / 6, 1) * 0.3) * k
                })`;
            g.beginPath();
            g.moveTo(forkX, spineY);
            g.lineTo(splitX, spineY);
            g.stroke();
            const mk = (dir, col) => {
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
            mk(-1, `rgba(34,197,94,${0.42 * k})`);
            mk(1, `rgba(244,63,94,${0.42 * k})`);

            /* ---------- subagent trees ---------- */
            for (const n of nodes) {
                if (!n.sub) continue;
                const sub = n.sub;

                // trunk: node → hexagon
                g.lineWidth = 1;
                g.strokeStyle = `rgba(56,189,248,${(0.22 + sub.busy * 0.3) * k})`;
                g.beginPath();
                g.moveTo(n.x, spineY + NODE_R);
                g.lineTo(sub.x, sub.y - SUB_R);
                g.stroke();

                // hexagon → solutions, all landing on one baseline
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

                // solution baseline rule — anchors the row
                g.strokeStyle = `rgba(148,163,184,${0.14 * k})`;
                g.beginPath();
                g.moveTo(sub.seats[0].x - 7, sub.rowY + 7);
                g.lineTo(sub.seats[sub.seats.length - 1].x + 7, sub.rowY + 7);
                g.stroke();

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

                for (const c of n.calls) {
                    if (c.phase === 0) {
                        const e = easeInOut(c.t);
                        g.fillStyle = "rgba(125,211,252,1)";
                        g.beginPath();
                        g.arc(lerp(n.x, sub.x, e), lerp(spineY + NODE_R, sub.y - SUB_R, e), 2, 0, 6.2832);
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
                        g.arc(lerp(sub.x, n.x, e), lerp(sub.y - SUB_R, spineY + NODE_R, e), 2, 0, 6.2832);
                        g.fill();
                    }
                }

                if (!idle) {
                    g.font = `600 9px ${MONO}`;
                    LS(g, "0.06em");
                    g.textAlign = "center";
                    const full = "SUBAGENT CONNECTED";
                    const txt = g.measureText(full).width + 34 < gap ? full : "SUBAGENT";
                    const tw = g.measureText(txt).width;
                    const ty = spineY + STATUS_DY;
                    g.fillStyle = "rgba(34,197,94,0.9)";
                    g.beginPath();
                    g.arc(sub.x - tw / 2 - 4, ty - 3, 2.2, 0, 6.2832);
                    g.fill();
                    g.fillStyle = "rgba(124,140,161,1)";
                    g.fillText(txt, sub.x + 5, ty);
                    LS(g, "0px");
                }
            }

            /* ---------- alert particles ---------- */
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
                if (p.px != null && !pos.q && !pos.svc) {
                    g.strokeStyle = `rgba(${rgb},${0.34 * alpha})`;
                    g.lineWidth = 1.2 * p.sev;
                    g.beginPath();
                    g.moveTo(p.px, p.py);
                    g.lineTo(pos.x, pos.y);
                    g.stroke();
                }
                const s = (pos.q ? 8.5 : 12) * p.sev;
                g.globalAlpha = alpha;
                g.drawImage(sprite, pos.x - s / 2, pos.y - s / 2, s, s);
                g.globalAlpha = 1;
                p.px = pos.x;
                p.py = pos.y;
            }

            /* ---------- nodes ---------- */
            g.textAlign = "center";
            for (const n of nodes) {
                const hot = n.queue.length > QUEUE_HOT;
                const accent = hot ? C.alert : C.flow;

                if (n.ring > 0) {
                    g.strokeStyle = `rgba(56,189,248,${n.ring * 0.45})`;
                    g.lineWidth = 1;
                    g.beginPath();
                    g.arc(n.x, spineY, NODE_R + (1 - n.ring) * 12, 0, 6.2832);
                    g.stroke();
                }

                g.strokeStyle = `rgba(148,163,184,${0.26 * k})`;
                g.lineWidth = 3;
                g.beginPath();
                g.arc(n.x, spineY, NODE_R, 0, 6.2832);
                g.stroke();

                const fill = n.inService.length / n.cap;
                if (fill > 0) {
                    g.strokeStyle = accent;
                    g.lineWidth = 3;
                    g.lineCap = "round";
                    g.beginPath();
                    g.arc(n.x, spineY, NODE_R, -Math.PI / 2, -Math.PI / 2 + fill * 6.2832);
                    g.stroke();
                    g.lineCap = "butt";
                }

                g.fillStyle = C.void;
                g.beginPath();
                g.arc(n.x, spineY, NODE_R - 3.5, 0, 6.2832);
                g.fill();

                g.font = `600 11px ${MONO}`;
                g.fillStyle = hot ? C.alert : `rgba(226,232,240,${0.92 * k})`;
                g.fillText(idle ? `—/${n.cap}` : `${n.inService.length}/${n.cap}`, n.x, spineY + 4);

                g.font = `600 9px ${MONO}`;
                LS(g, "0.1em");
                g.fillStyle = hot ? C.alert : `rgba(124,140,161,${k})`;
                g.fillText(n.label, n.x, spineY - NODE_R - 18);
                LS(g, "0px");
            }

            /* ---------- ingest ---------- */
            /* ---------- entry ----------
               Mirror of the exit: feeder curves converge into the spine,
               and the label block is anchored to the merge point. */
            const feedX = inX - 58;
            const feed = (dir) => {
                g.strokeStyle = `rgba(56,189,248,${0.2 * k})`;
                g.lineWidth = 1;
                g.beginPath();
                g.moveTo(feedX, spineY + dir * 26);
                g.bezierCurveTo(
                    feedX + 24,
                    spineY + dir * 26,
                    inX - 30,
                    spineY,
                    inX,
                    spineY
                );
                g.stroke();
                g.fillStyle = `rgba(56,189,248,${0.4 * k})`;
                g.beginPath();
                g.arc(feedX, spineY + dir * 26, 1.8, 0, 6.2832);
                g.fill();
            };
            feed(-1);
            feed(0);
            feed(1);

            g.textAlign = "left";
            g.font = `600 9px ${MONO}`;
            LS(g, "0.1em");
            g.fillStyle = `rgba(124,140,161,${k})`;
            g.fillText("ALERT INGEST", feedX, spineY + 46);
            LS(g, "0px");
            g.font = `600 17px ${MONO}`;
            g.fillStyle = idle ? "rgba(226,232,240,0.4)" : "rgba(226,232,240,0.92)";
            g.fillText(idle ? "—" : `${S.rate}`, feedX, spineY + 66);
            if (!idle) {
                const rw = g.measureText(`${S.rate}`).width;
                g.font = `600 9px ${MONO}`;
                g.fillStyle = `rgba(124,140,161,${k})`;
                g.fillText("/MIN", feedX + rw + 4, spineY + 66);
            }

            /* ---------- exit column ----------
               Each block is centred on its own curve endpoint. */
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

            /* ---------- idle notice ---------- */
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
            const dt = Math.min(now - S.last, 60);
            S.last = now;
            step(S, dt, now);
            draw(S, now);
            if (now - uiTick > 500) {
                uiTick = now;
                setCounts({
                    closed: S.closed,
                    escalated: S.escalated,
                    inFlight: S.particles.length,
                    rate: S.rate,
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
                    <div ref={wrapRef} className="relative w-full" style={{ height: 292 }}>
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
                                AI SOC
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
                                        <span style={{ color: C.ok }}>● HEALTHY</span>
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

                <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
                    {[
                        ["SYSTEM STATUS", "Healthy", "3/3 agents · 1/1 subagent", C.ok],
                        ["QUEUE WORKER", "Running", "0 done · 0 failed · 2 pods", C.ok],
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
                            <div className="mt-2" style={{ fontSize: 26, fontWeight: 650, color: col }}>
                                {v}
                            </div>
                            <div className="mt-1" style={{ fontSize: 11, color: "rgba(160,175,192,0.85)" }}>
                                {sub}
                            </div>
                        </div>
                    ))}
                </div>

                <div
                    className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 px-1"
                    style={{ fontFamily: MONO, fontSize: 10, color: "rgba(160,175,192,0.8)" }}
                >
                    <Legend mark="ring">처리 슬롯 점유</Legend>
                    <Legend mark="hex">서브에이전트</Legend>
                    <Legend mark="sq">솔루션</Legend>
                    <Legend mark="warn">대기 적체</Legend>
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
            <svg width={s + 3} height={s + 3} viewBox="0 0 12 12">
                {mark === "ring" && (
                    <circle cx="6" cy="6" r="4.2" fill="none" stroke={C.flow} strokeWidth="1.8" />
                )}
                {mark === "hex" && (
                    <polygon
                        points="6,1.5 10,3.75 10,8.25 6,10.5 2,8.25 2,3.75"
                        fill="none"
                        stroke={C.flow}
                        strokeWidth="1.2"
                    />
                )}
                {mark === "sq" && <rect x="3" y="3" width="6" height="6" fill="#94A3B8" />}
                {mark === "warn" && <circle cx="6" cy="6" r="3.4" fill={C.warn} />}
            </svg>
            {children}
        </span>
    );
}