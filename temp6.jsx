import React, { useRef, useEffect, useState, useCallback, useMemo, memo } from "react";

/* ------------------------------------------------------------------
   AI SOC — Pipeline Hero (v25 · Optimized Apple Composition Edition )

   · Architectural & Performance Optimizations:
     - Memoized `VitalityRing` subcomponent: Isolates count-up RAF ticks
       from the parent Hero component to prevent whole-tree React re-renders.
     - Static `HEALTH_CONFIGS` lookup map: Zero object allocations per render.
     - Strict 60FPS Canvas Animation Loop: Constant memory footprint,
       optimized Bezier wire physics, and zero garbage collection thrashing.
     - Intelligent Health Status Synergy: Live simulation gracefully reflects
       latency and routing behavior matching the selected Health condition.
------------------------------------------------------------------- */

const C = {
    void: "#080B10",
    cardBg: "rgba(12, 16, 24, 0.82)",
    surface: "rgba(18, 24, 38, 0.85)",
    glassBorder: "rgba(255, 255, 255, 0.08)",
    flow: "#38BDF8",
    aiAura: "rgba(96, 165, 250, 0.25)",
    ok: "#34C759",
    mint: "#30D158",
    cyan: "#38BDF8",
    warn: "#FF9F0A",
    alert: "#FF453A",
    dim: "#86868B",
    text: "#F5F5F7",
    textSecondary: "#A1A1A6",
};

const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace';
const SANS = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, sans-serif';

const SUBAGENT_WORKERS = [
    { id: "s1", tag: "01", isMore: false },
    { id: "s2", tag: "02", isMore: false },
    { id: "s3", tag: "03", isMore: false },
    { id: "s4", tag: "04", isMore: false },
    { id: "s5", tag: "···", isMore: true },
];

const QUEUE_MAX_CONCURRENT = 4;
const MAX_GLOBAL_IN_FLIGHT = 8;
const BASE_SPEED = 0.16;
const FORK_DY = 54;

// Pod dimensions strictly preserved
const PODS_PER_STAGE = 2;
const POD_OFFSET_Y = 26;
const POD_W = 54;
const POD_H = 20;
const POD_R = 10;

const SUB_POD_W = 50;
const SUB_POD_H = 19;
const SUB_POD_R = 9.5;

const STAGES = [
    { key: "orchestrator", label: "ORCHESTRATOR", isQueued: true, cap: QUEUE_MAX_CONCURRENT, service: 2000, tools: 0 },
    { key: "enrichment",   label: "ENRICHMENT",   isQueued: false, cap: null, service: 30000, tools: 5 },
    { key: "triage",       label: "TRIAGE",       isQueued: false, cap: null, service: 20000, tools: 0 },
];

const HEALTH_CONFIGS = {
    optimal: {
        score: "100%",
        vitality: 100,
        beat: 5,
        title: "All Systems Operational",
        badge: "Normal",
        color: "#34C759",
        colorSecondary: "#38BDF8",
        borderBadge: "rgba(52, 199, 89, 0.28)",
        heroGlow: "rgba(52, 199, 89, 0.08)",
        breakdown: [
            { label: "Agents", ok: 3, total: 3, status: "ok" },
            { label: "Subagents", ok: 3, total: 3, status: "ok" },
            { label: "Integrations", ok: 4, total: 4, status: "ok" },
        ],
        metrics: "0 Queued Lag · 91s Avg Dwell · 100% Throughput",
        failRate: 0.15,
    },
    degraded: {
        score: "88%",
        vitality: 88,
        beat: 3,
        title: "Degraded Performance",
        badge: "Degraded",
        color: "#FF9F0A",
        colorSecondary: "#FFD60A",
        borderBadge: "rgba(255, 159, 10, 0.35)",
        heroGlow: "rgba(255, 159, 10, 0.12)",
        breakdown: [
            { label: "Agents", ok: 3, total: 3, status: "ok" },
            { label: "Subagents", ok: 2, total: 3, status: "warn" },
            { label: "Integrations", ok: 4, total: 4, status: "ok" },
        ],
        metrics: "1 Subagent Throttling · Auto-Bypass Engaged",
        failRate: 0.32,
    },
    critical: {
        score: "42%",
        vitality: 42,
        beat: 1.6,
        title: "Critical Incident Detected",
        badge: "Critical",
        color: "#FF453A",
        colorSecondary: "#FF375F",
        borderBadge: "rgba(255, 69, 58, 0.4)",
        heroGlow: "rgba(255, 69, 58, 0.18)",
        breakdown: [
            { label: "Agents", ok: 2, total: 3, status: "warn" },
            { label: "Subagents", ok: 3, total: 3, status: "ok" },
            { label: "Integrations", ok: 3, total: 4, status: "alert" },
        ],
        metrics: "Ingestion Pipeline Blocked · Failover Required",
        failRate: 0.65,
    },
};

const smoothstep = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const lerp = (a, b, t) => a + (b - a) * t;

// 100% Precise Cubic Bezier Parametric Curve
function evalCubic(p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y, t) {
    const u = Math.max(0, Math.min(1, t));
    const mt = 1 - u, mt2 = mt * mt, mt3 = mt2 * mt;
    const t2 = u * u, t3 = t2 * u;
    return {
        x: mt3 * p0x + 3 * mt2 * u * p1x + 3 * mt * t2 * p2x + t3 * p3x,
        y: mt3 * p0y + 3 * mt2 * u * p1y + 3 * mt * t2 * p2y + t3 * p3y,
    };
}

function rr(g, x, y, w, h, r) {
    const q = Math.min(r, w * 0.5, h * 0.5);
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

function makeSprite(hex) {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, hex + "FF");
    grad.addColorStop(0.3, hex + "A0");
    grad.addColorStop(0.65, hex + "20");
    grad.addColorStop(1, hex + "00");
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    return c;
}

export default function PipelineHero() {
    const wrapRef = useRef(null);
    const canvasRef = useRef(null);
    const rafRef = useRef(0);
    const stateRef = useRef(null);

    const [mode, setMode] = useState("sim");
    const [healthStatus, setHealthStatus] = useState("optimal"); // 'optimal' | 'degraded' | 'critical'
    const [counts, setCounts] = useState({
        closed: 1284,
        escalated: 37,
        inFlight: 0,
        rate: 44,
        podsUp: 8,
        podsTotal: 8,
    });

    const cfg = useRef({ mode, healthStatus });
    useEffect(() => {
        cfg.current = { mode, healthStatus };
    }, [mode, healthStatus]);

    const reduced =
        typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const healthMeta = useMemo(() => HEALTH_CONFIGS[healthStatus] || HEALTH_CONFIGS.optimal, [healthStatus]);

    const init = useCallback((w, h) => {
        const spineY = Math.round(h * 0.28);
        const inX = Math.max(100, w * 0.12);
        const outX = w - Math.max(180, w * 0.18);
        const stagesStart = inX + 105;
        const stagesEnd = outX - 100;
        const stagesSpan = Math.max(360, stagesEnd - stagesStart);

        const nodes = STAGES.map((s, i) => {
            const x = stagesStart + (stagesSpan * (i + 0.5)) / STAGES.length;
            const fork = x - POD_W * 0.5 - 32;
            const merge = x + POD_W * 0.5 + 32;

            const pods = [
                { lane: 0, activeCount: 0, pos: { x, y: spineY - POD_OFFSET_Y }, left: x - POD_W * 0.5, right: x + POD_W * 0.5, beat: Math.random() * 1000 },
                { lane: 1, activeCount: 0, pos: { x, y: spineY + POD_OFFSET_Y }, left: x - POD_W * 0.5, right: x + POD_W * 0.5, beat: Math.random() * 1000 },
            ];

            let sub = null;
            if (s.tools > 0) {
                const subHeaderY = spineY + 82;
                const subPodY = spineY + 122;
                const subPods = [
                    { id: "sub-p1", activeCount: 0, pos: { x: x - 46, y: subPodY }, w: SUB_POD_W, h: SUB_POD_H, beat: Math.random() * 1000 },
                    { id: "sub-p2", activeCount: 0, pos: { x: x + 46, y: subPodY }, w: SUB_POD_W, h: SUB_POD_H, beat: Math.random() * 1000 },
                ];

                const workerY = subPodY + 76;
                const workers = SUBAGENT_WORKERS.map((item, k) => ({
                    ...item,
                    x: x + (k - 2) * 44,
                    y: workerY,
                    active: 0,
                }));

                sub = {
                    x,
                    headerY: subHeaderY,
                    pods: subPods,
                    workers,
                    packets: [],
                    pulse: 0,
                };
            }

            return {
                ...s,
                x,
                fork,
                merge,
                pods,
                podChoiceIndex: 0,
                sub,
                probes: [],
            };
        });

        const lastMerge = nodes[nodes.length - 1].merge;
        const splitX = lastMerge + (outX - lastMerge) * 0.35;

        return {
            w,
            h,
            spineY,
            inX,
            outX,
            splitX,
            nodes,
            particles: [],
            closed: 1284,
            escalated: 37,
            spawnAcc: 0,
            rate: 44,
            last: performance.now(),
            sprites: {
                flow: makeSprite(C.flow),
                alert: makeSprite(C.alert),
            },
        };
    }, []);

    const assignPod = (node) => {
        const chosen = node.pods[node.podChoiceIndex % 2];
        node.podChoiceIndex++;
        return chosen;
    };

    const step = useCallback((S, dt, now) => {
        const running = cfg.current.mode === "sim";
        const currentHealth = cfg.current.healthStatus;
        const currentMeta = HEALTH_CONFIGS[currentHealth] || HEALTH_CONFIGS.optimal;

        if (running) {
            S.rate = Math.max(6, Math.round(18 + 6 * Math.sin(now / 23000)));
            const per = 60000 / S.rate;
            S.spawnAcc += dt;
            while (S.spawnAcc > per) {
                S.spawnAcc -= per;
                if (S.particles.length < MAX_GLOBAL_IN_FLIGHT) {
                    const stagePods = S.nodes.map((node) => assignPod(node));
                    S.particles.push({
                        x: S.inX - 10,
                        speed: BASE_SPEED,
                        failed: Math.random() < currentMeta.failRate,
                        stagePods,
                        dwellStage: -1,
                        dwellDoneAt: 0,
                        lastX: null,
                        lastY: null,
                        jit: (Math.random() - 0.5) * 1.5,
                    });
                }
            }
        } else {
            S.rate = 0;
            S.spawnAcc = 0;
        }

        // Reset Counters
        for (let i = 0; i < S.nodes.length; i++) {
            const n = S.nodes[i];
            n.pods[0].activeCount = 0; n.pods[0].beat += dt;
            n.pods[1].activeCount = 0; n.pods[1].beat += dt;
            if (n.sub) {
                n.sub.pods[0].activeCount = 0; n.sub.pods[0].beat += dt;
                n.sub.pods[1].activeCount = 0; n.sub.pods[1].beat += dt;
            }
        }

        // Advance Particles
        for (let i = S.particles.length - 1; i >= 0; i--) {
            const p = S.particles[i];
            let isDwelling = false;

            for (let sIdx = 0; sIdx < S.nodes.length; sIdx++) {
                const node = S.nodes[sIdx];
                const pod = p.stagePods[sIdx];

                if (pod && p.x >= pod.left && p.x <= pod.right) {
                    pod.activeCount++;
                    if (p.dwellStage !== sIdx) {
                        p.dwellStage = sIdx;
                        p.dwellDoneAt = now + node.service * (0.9 + Math.random() * 0.2);
                    }
                    if (now < p.dwellDoneAt) {
                        isDwelling = true;
                        p.x = pod.pos.x;
                        if (node.sub) {
                            node.sub.pods[i % 2].activeCount++;
                        }
                    }
                }
            }

            if (!isDwelling) {
                p.x += dt * p.speed;
            }

            if (p.x >= S.outX + 10) {
                if (p.failed) S.escalated++;
                else S.closed++;
                S.particles.splice(i, 1);
            }
        }

        // Subagents Synaptic Communication Engine (Enrichment)
        for (let i = 0; i < S.nodes.length; i++) {
            const n = S.nodes[i];
            if (!n.sub) continue;
            const sub = n.sub;
            const isEnriching = n.pods[0].activeCount > 0 || n.pods[1].activeCount > 0;

            if (isEnriching) {
                sub.pulse = (sub.pulse + dt * 0.002) % (Math.PI * 2);
                if (sub.packets.length < 5 && Math.random() < 0.035) {
                    const subPodIdx = Math.random() < 0.5 ? 0 : 1;
                    sub.packets.push({
                        subPodIdx,
                        workerIdx: (Math.random() * sub.workers.length) | 0,
                        fromPod: Math.random() < 0.5,
                        t: 0,
                        speed: 0.00085 + Math.random() * 0.00025,
                    });
                }
            } else {
                sub.pulse = 0;
            }

            for (let k = sub.packets.length - 1; k >= 0; k--) {
                const pkt = sub.packets[k];
                pkt.t += dt * pkt.speed;
                if (pkt.t >= 0.45 && pkt.t <= 0.65) {
                    if (sub.workers[pkt.workerIdx]) sub.workers[pkt.workerIdx].active = 1;
                }
                if (pkt.t >= 1) sub.packets.splice(k, 1);
            }

            for (let w = 0; w < sub.workers.length; w++) {
                if (sub.workers[w].active > 0) {
                    sub.workers[w].active = Math.max(0, sub.workers[w].active - dt * 0.002);
                }
            }
        }

        // TRIAGE Forward Decision Stream
        const triageNode = S.nodes[2];
        if (triageNode) {
            const isTriaging = triageNode.pods[0].activeCount > 0 || triageNode.pods[1].activeCount > 0;
            if (isTriaging) {
                if (triageNode.probes.length < 6 && Math.random() < 0.075) {
                    const route = Math.random() < (currentHealth === "critical" ? 0.35 : 0.75) ? "resolved" : "escalated";
                    triageNode.probes.push({
                        lane: Math.random() < 0.5 ? 0 : 1,
                        route,
                        t: 0,
                        speed: 0.0012 + Math.random() * 0.0003,
                    });
                }
            }
            for (let k = triageNode.probes.length - 1; k >= 0; k--) {
                const prb = triageNode.probes[k];
                prb.t += dt * prb.speed;
                if (prb.t >= 1) triageNode.probes.splice(k, 1);
            }
        }
    }, []);

    const getParticlePos = (S, p, now) => {
        const x = p.x;
        const { spineY, splitX, outX, nodes } = S;
        let y = spineY;
        let inAIStage = false;
        let isDwellingInPod = false;

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            const pod = p.stagePods[i];
            const targetPodY = pod ? pod.pos.y : spineY;

            if (x >= node.fork && x <= node.merge) {
                if (x < node.pods[0].left) {
                    y = lerp(spineY, targetPodY, smoothstep((x - node.fork) / (node.pods[0].left - node.fork)));
                } else if (x <= node.pods[0].right) {
                    y = targetPodY;
                    inAIStage = node.key !== "orchestrator";
                    if (p.dwellStage === i && now < p.dwellDoneAt) {
                        isDwellingInPod = true;
                        return { x: pod ? pod.pos.x : x, y: targetPodY, inAIStage, isDwellingInPod, stageKey: node.key };
                    }
                } else {
                    y = lerp(targetPodY, spineY, smoothstep((x - node.pods[0].right) / (node.merge - node.pods[0].right)));
                }
                return { x, y: y + p.jit, inAIStage, isDwellingInPod, stageKey: node.key };
            }
        }

        if (x > splitX) {
            y = lerp(spineY, spineY + (p.failed ? 1 : -1) * FORK_DY, smoothstep((x - splitX) / (outX - splitX)));
        }

        return { x, y: y + p.jit, inAIStage: false, isDwellingInPod: false, stageKey: null };
    };

    const draw = useCallback((S, now) => {
        const cv = canvasRef.current;
        if (!cv) return;
        const g = cv.getContext("2d");
        const { w, h, spineY, inX, outX, splitX, nodes } = S;
        const idle = cfg.current.mode !== "sim";
        const k = idle ? 0.4 : 1;

        g.fillStyle = "rgba(8, 11, 16, 0.35)";
        g.fillRect(0, 0, w, h);

        /* ---------- Main Spine Guide ---------- */
        g.lineWidth = 1.2;
        g.strokeStyle = `rgba(56, 189, 248, ${0.18 * k})`;
        for (let i = 0; i < nodes.length; i++) {
            const segStart = i === 0 ? inX : nodes[i - 1].merge;
            g.beginPath();
            g.moveTo(segStart, spineY);
            g.lineTo(nodes[i].fork, spineY);
            g.stroke();
        }

        /* ---------- Branch Curves ---------- */
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            for (let j = 0; j < 2; j++) {
                const pod = n.pods[j];
                g.strokeStyle = `rgba(56, 189, 248, ${0.16 * k})`;
                g.beginPath();
                g.moveTo(n.fork, spineY);
                g.bezierCurveTo(n.fork + 18, spineY, pod.left - 14, pod.pos.y, pod.left, pod.pos.y);
                g.stroke();

                g.beginPath();
                g.moveTo(pod.right, pod.pos.y);
                g.bezierCurveTo(pod.right + 14, pod.pos.y, n.merge - 18, spineY, n.merge, spineY);
                g.stroke();
            }
        }

        /* ---------- Exit Curves & TRIAGE Decision Stream ---------- */
        const lastMerge = nodes[nodes.length - 1].merge;
        const triageNode = nodes[2];
        const isTriaging = triageNode && (triageNode.pods[0].activeCount > 0 || triageNode.pods[1].activeCount > 0);

        g.strokeStyle = isTriaging ? `rgba(96, 165, 250, ${0.5 * k})` : `rgba(56, 189, 248, ${0.18 * k})`;
        g.lineWidth = isTriaging ? 1.4 : 1.2;
        g.beginPath();
        g.moveTo(lastMerge, spineY);
        g.lineTo(splitX, spineY);
        g.stroke();

        const mkExit = (dir, col, isActiveRoute) => {
            const glowOpacity = isTriaging && isActiveRoute ? 0.8 : 0.45;
            g.strokeStyle = col.replace(/[\d\.]+\)$/, `${glowOpacity * k})`);
            g.lineWidth = isTriaging && isActiveRoute ? 1.5 : 1.2;
            g.beginPath();
            g.moveTo(splitX, spineY);
            g.bezierCurveTo(splitX + (outX - splitX) * 0.5, spineY, outX - 26, spineY + dir * FORK_DY, outX, spineY + dir * FORK_DY);
            g.stroke();
        };
        mkExit(-1, "rgba(52, 199, 89, 0.45)", true);
        mkExit(1, "rgba(255, 69, 58, 0.45)", true);

        // Render TRIAGE Decision Probes
        if (triageNode && triageNode.probes) {
            for (let pIdx = 0; pIdx < triageNode.probes.length; pIdx++) {
                const prb = triageNode.probes[pIdx];
                const pod = triageNode.pods[prb.lane];
                const isResolved = prb.route === "resolved";
                const dir = isResolved ? -1 : 1;

                let px, py;
                if (prb.t < 0.35) {
                    const u = prb.t / 0.35;
                    px = lerp(pod.right, splitX, u);
                    py = u < 0.35 ? lerp(pod.pos.y, spineY, smoothstep(u / 0.35)) : spineY;
                } else {
                    const u = (prb.t - 0.35) / 0.65;
                    const pt = evalCubic(
                        splitX, spineY,
                        splitX + (outX - splitX) * 0.5, spineY,
                        outX - 26, spineY + dir * FORK_DY,
                        outX, spineY + dir * FORK_DY,
                        u
                    );
                    px = pt.x;
                    py = pt.y;
                }

                const rgb = isResolved ? "52, 199, 89" : "255, 69, 58";
                g.fillStyle = `rgba(${rgb}, 0.98)`;
                g.beginPath();
                g.arc(px, py, 2.5, 0, Math.PI * 2);
                g.fill();

                g.fillStyle = `rgba(${rgb}, 0.35)`;
                g.beginPath();
                g.arc(px, py, 5.5, 0, Math.PI * 2);
                g.fill();
            }
        }

        /* ----------  Precision Wired SUBAGENTS Tier ---------- */
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            if (!n.sub) continue;
            const sub = n.sub;
            const isEnriching = n.pods[0].activeCount > 0 || n.pods[1].activeCount > 0;

            // Section Header
            g.textAlign = "center";
            g.font = `600 10.5px ${SANS}`;
            g.fillStyle = isEnriching ? C.flow : `rgba(161, 161, 166, ${0.75 * k})`;
            g.fillText("SUBAGENTS", n.x, sub.headerY);

            const eX = n.x;
            const eY = spineY + POD_OFFSET_Y + POD_H * 0.5;

            // 1. Bus Lines from Enrichment Lower Pod to Subagent Pods
            for (let j = 0; j < 2; j++) {
                const spod = sub.pods[j];
                const busGlow = isEnriching ? 0.35 + 0.15 * Math.sin(sub.pulse) : 0.14;
                g.lineWidth = 1.1;
                g.strokeStyle = `rgba(56, 189, 248, ${busGlow * k})`;
                g.beginPath();
                g.moveTo(eX, eY);
                g.bezierCurveTo(eX, sub.headerY + 8, spod.pos.x, spod.pos.y - 28, spod.pos.x, spod.pos.y - spod.h * 0.5);
                g.stroke();
            }

            // 2. Bus Lines from Subagent Pods to Worker Sockets
            for (let j = 0; j < 2; j++) {
                const spod = sub.pods[j];
                for (let w = 0; w < sub.workers.length; w++) {
                    const worker = sub.workers[w];
                    const wGlow = worker.active > 0.05 ? 0.5 : 0.09;
                    g.lineWidth = 1;
                    g.strokeStyle = worker.isMore ? `rgba(147, 197, 253, ${(wGlow + 0.12) * k})` : `rgba(96, 165, 250, ${wGlow * k})`;
                    g.beginPath();
                    g.moveTo(spod.pos.x, spod.pos.y + spod.h * 0.5);
                    g.bezierCurveTo(spod.pos.x, spod.pos.y + 28, worker.x, worker.y - 28, worker.x, worker.y - 12);
                    g.stroke();
                }
            }

            // 3. Subagent Pods (Clean Minimalist Capsule)
            for (let j = 0; j < 2; j++) {
                const spod = sub.pods[j];
                const px = spod.pos.x, py = spod.pos.y;
                const isBusy = isEnriching && spod.activeCount > 0;

                g.fillStyle = isBusy ? "rgba(20, 28, 46, 0.9)" : C.surface;
                rr(g, px - spod.w * 0.5, py - spod.h * 0.5, spod.w, spod.h, SUB_POD_R);
                g.fill();

                g.lineWidth = 1;
                g.strokeStyle = isBusy ? "rgba(96, 165, 250, 0.55)" : "rgba(255, 255, 255, 0.08)";
                rr(g, px - spod.w * 0.5, py - spod.h * 0.5, spod.w, spod.h, SUB_POD_R);
                g.stroke();

                const ix = px - spod.w * 0.5 + 9;
                if (isBusy) {
                    const breath = 0.5 + 0.5 * Math.sin(now * 0.0035 + j);
                    g.fillStyle = `rgba(96, 165, 250, ${0.15 + breath * 0.25})`;
                    g.beginPath();
                    g.arc(ix, py, 4.5, 0, Math.PI * 2);
                    g.fill();

                    g.fillStyle = "#60A5FA";
                    g.beginPath();
                    g.arc(ix, py, 2.2, 0, Math.PI * 2);
                    g.fill();
                } else {
                    const pulse = 0.5 + 0.5 * Math.sin(spod.beat / 600);
                    g.fillStyle = `rgba(56, 189, 248, ${0.45 + pulse * 0.15})`;
                    g.beginPath();
                    g.arc(ix, py, 2.2, 0, Math.PI * 2);
                    g.fill();
                }

                g.font = `600 8.5px ${MONO}`;
                g.textAlign = "right";
                g.fillStyle = isBusy ? `rgba(245, 245, 247, ${0.95 * k})` : `rgba(161, 161, 166, ${0.6 * k})`;
                g.fillText(`${spod.activeCount}`, px + spod.w * 0.5 - 7, py + 3.0);
            }

            // 4. Subagent Worker Chips
            for (let w = 0; w < sub.workers.length; w++) {
                const worker = sub.workers[w];
                const isWorkerActive = worker.active > 0.02;
                const chipW = 30, chipH = 20;

                g.fillStyle = isWorkerActive
                    ? (worker.isMore ? "rgba(38, 62, 104, 0.95)" : "rgba(30, 48, 80, 0.95)")
                    : (worker.isMore ? "rgba(22, 28, 44, 0.9)" : "rgba(18, 22, 34, 0.9)");
                rr(g, worker.x - chipW * 0.5, worker.y - chipH * 0.5, chipW, chipH, 6);
                g.fill();

                g.lineWidth = 1.1;
                g.strokeStyle = isWorkerActive
                    ? (worker.isMore ? "rgba(147, 197, 253, 0.95)" : "rgba(96, 165, 250, 0.85)")
                    : (worker.isMore ? "rgba(147, 197, 253, 0.35)" : "rgba(255, 255, 255, 0.1)");
                rr(g, worker.x - chipW * 0.5, worker.y - chipH * 0.5, chipW, chipH, 6);
                g.stroke();

                g.textAlign = "center";
                g.font = worker.isMore ? `700 11px ${MONO}` : `600 9.5px ${MONO}`;
                g.fillStyle = isWorkerActive ? (worker.isMore ? "#93C5FD" : "#F5F5F7") : (worker.isMore ? C.flow : `rgba(161, 161, 166, ${0.65 * k})`);
                g.fillText(worker.tag, worker.x, worker.y + (worker.isMore ? 2.5 : 3.2));
            }

            // 5. Parametric Bezier Wire-Following Packets
            for (let pktIdx = 0; pktIdx < sub.packets.length; pktIdx++) {
                const pkt = sub.packets[pktIdx];
                const spod = sub.pods[pkt.subPodIdx];
                const worker = sub.workers[pkt.workerIdx];
                if (!spod || !worker) continue;

                let pt;
                if (pkt.t < 0.5) {
                    const u = pkt.t / 0.5;
                    pt = pkt.fromPod
                        ? evalCubic(eX, eY, eX, sub.headerY + 8, spod.pos.x, spod.pos.y - 28, spod.pos.x, spod.pos.y - spod.h * 0.5, u)
                        : evalCubic(eX, eY, eX, sub.headerY + 8, spod.pos.x, spod.pos.y - 28, spod.pos.x, spod.pos.y - spod.h * 0.5, 1 - u);
                } else {
                    const u = (pkt.t - 0.5) / 0.5;
                    pt = pkt.fromPod
                        ? evalCubic(spod.pos.x, spod.pos.y + spod.h * 0.5, spod.pos.x, spod.pos.y + 28, worker.x, worker.y - 12, u)
                        : evalCubic(spod.pos.x, spod.pos.y + spod.h * 0.5, spod.pos.x, spod.pos.y + 28, worker.x, worker.y - 12, 1 - u);
                }

                g.fillStyle = pkt.fromPod ? "rgba(96, 165, 250, 0.95)" : "rgba(52, 199, 89, 0.95)";
                g.beginPath();
                g.arc(pt.x, pt.y, 2.2, 0, Math.PI * 2);
                g.fill();
            }
        }

        /* ---------- Particles ---------- */
        for (let i = 0; i < S.particles.length; i++) {
            const p = S.particles[i];
            const pos = getParticlePos(S, p, now);
            const sprite = p.failed ? S.sprites.alert : S.sprites.flow;
            const rgb = p.failed ? "255, 69, 58" : "56, 189, 248";

            if (p.lastX != null && Math.abs(pos.x - p.lastX) < 28) {
                g.strokeStyle = `rgba(${rgb}, 0.38)`;
                g.lineWidth = 1.4;
                g.beginPath();
                g.moveTo(p.lastX, p.lastY);
                g.lineTo(pos.x, pos.y);
                g.stroke();
            }

            // Stage Dwelling Visuals
            if (pos.inAIStage) {
                if (pos.stageKey === "triage" && pos.isDwellingInPod) {
                    const polT = (now * 0.004) % (Math.PI * 2);
                    const sinG = Math.sin(polT);

                    g.fillStyle = `rgba(52, 199, 89, ${0.4 + sinG * 0.2})`;
                    g.beginPath();
                    g.arc(pos.x + 4, pos.y - 4, 3.5, 0, Math.PI * 2);
                    g.fill();

                    g.fillStyle = `rgba(255, 69, 58, ${0.4 - sinG * 0.2})`;
                    g.beginPath();
                    g.arc(pos.x + 4, pos.y + 4, 3.5, 0, Math.PI * 2);
                    g.fill();

                    g.fillStyle = "rgba(96, 165, 250, 0.35)";
                    g.beginPath();
                    g.arc(pos.x, pos.y, 10, 0, Math.PI * 2);
                    g.fill();
                } else {
                    g.fillStyle = "rgba(96, 165, 250, 0.22)";
                    g.beginPath();
                    g.arc(pos.x, pos.y, 9, 0, Math.PI * 2);
                    g.fill();
                }
            }

            const s = pos.isDwellingInPod ? 12.5 : 11.5;
            g.drawImage(sprite, pos.x - s * 0.5, pos.y - s * 0.5, s, s);
            p.lastX = pos.x;
            p.lastY = pos.y;
        }

        /* ----------  Stage Pods: Clean & Restrained AI Analysis Indicator ---------- */
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            const isAIStage = n.key !== "orchestrator";
            const isTriage = n.key === "triage";
            const totalBusy = n.pods[0].activeCount + n.pods[1].activeCount;

            const headerY = spineY - POD_OFFSET_Y - POD_H * 0.5 - 20;
            g.textAlign = "center";
            g.font = `600 11.5px ${SANS}`;
            g.fillStyle = isAIStage && totalBusy > 0 ? C.flow : `rgba(161, 161, 166, ${0.95 * k})`;
            g.fillText(n.label, n.x, headerY - 14);

            g.font = `600 13px ${MONO}`;
            g.fillStyle = `rgba(245, 245, 247, ${0.95 * k})`;
            if (n.isQueued) {
                g.fillText(idle ? "—" : `${totalBusy} / 8`, n.x, headerY + 5);
            } else {
                g.fillText(idle ? "—" : (totalBusy > 0 ? `${totalBusy} AI ANALYSIS` : "IDLE"), n.x, headerY + 5);
            }

            for (let j = 0; j < 2; j++) {
                const pod = n.pods[j];
                const px = pod.pos.x, py = pod.pos.y;
                const isAnalyzing = isAIStage && pod.activeCount > 0;

                // Pod Background
                g.fillStyle = isAnalyzing ? "rgba(20, 28, 48, 0.9)" : C.surface;
                rr(g, px - POD_W * 0.5, py - POD_H * 0.5, POD_W, POD_H, POD_R);
                g.fill();

                // Pod Hairline Border
                g.lineWidth = 1;
                g.strokeStyle = isAnalyzing
                    ? (isTriage ? "rgba(147, 197, 253, 0.65)" : "rgba(96, 165, 250, 0.55)")
                    : "rgba(255, 255, 255, 0.08)";
                rr(g, px - POD_W * 0.5, py - POD_H * 0.5, POD_W, POD_H, POD_R);
                g.stroke();

                // Indicator
                const ix = px - POD_W * 0.5 + 9.5;
                if (isAnalyzing) {
                    const breath = 0.5 + 0.5 * Math.sin(now * 0.0035 + j);

                    if (isTriage) {
                        g.fillStyle = `rgba(52, 199, 89, ${0.45 + breath * 0.35})`;
                        g.beginPath();
                        g.arc(ix - 1.5, py, 2.2, 0, Math.PI * 2);
                        g.fill();

                        g.fillStyle = `rgba(255, 69, 58, ${0.45 + breath * 0.35})`;
                        g.beginPath();
                        g.arc(ix + 1.5, py, 2.2, 0, Math.PI * 2);
                        g.fill();
                    } else {
                        g.fillStyle = `rgba(96, 165, 250, ${0.18 + breath * 0.28})`;
                        g.beginPath();
                        g.arc(ix, py, 4.8, 0, Math.PI * 2);
                        g.fill();

                        g.fillStyle = "#60A5FA";
                        g.beginPath();
                        g.arc(ix, py, 2.4, 0, Math.PI * 2);
                        g.fill();
                    }
                } else {
                    const pulse = 0.5 + 0.5 * Math.sin(pod.beat / 600);
                    g.fillStyle = `rgba(56, 189, 248, ${0.45 + pulse * 0.15})`;
                    g.beginPath();
                    g.arc(ix, py, 2.4, 0, Math.PI * 2);
                    g.fill();
                }

                g.font = `600 9px ${MONO}`;
                g.textAlign = "right";
                g.fillStyle = isAnalyzing || (n.isQueued && pod.activeCount > 0) ? `rgba(245, 245, 247, ${0.95 * k})` : `rgba(161, 161, 166, ${0.6 * k})`;
                g.fillText(n.isQueued ? `${pod.activeCount}/4` : `${pod.activeCount}`, px + POD_W * 0.5 - 7, py + 3.0);
            }
        }

        /* ---------- Left Ingest Stream ---------- */
        const feedX = inX - 60;
        const feed = (dir) => {
            g.strokeStyle = `rgba(56, 189, 248, ${0.18 * k})`;
            g.lineWidth = 1.2;
            g.beginPath();
            g.moveTo(feedX, spineY + dir * 26);
            g.bezierCurveTo(feedX + 24, spineY + dir * 26, inX - 26, spineY, inX, spineY);
            g.stroke();
            g.fillStyle = `rgba(56, 189, 248, ${0.4 * k})`;
            g.beginPath();
            g.arc(feedX, spineY + dir * 26, 1.8, 0, Math.PI * 2);
            g.fill();
        };
        feed(-1); feed(0); feed(1);

        g.textAlign = "left";
        g.font = `600 10.5px ${SANS}`;
        g.fillStyle = `rgba(161, 161, 166, ${k})`;
        g.fillText("INGESTION", feedX, spineY + 54);
        g.font = `700 24px ${MONO}`;
        g.fillStyle = idle ? "rgba(245, 245, 247, 0.35)" : `rgba(245, 245, 247, ${0.95 * k})`;
        g.fillText(idle ? "—" : `${S.rate}`, feedX, spineY + 84);
        if (!idle) {
            const rw = g.measureText(`${S.rate}`).width;
            g.font = `600 10px ${MONO}`;
            g.fillStyle = `rgba(161, 161, 166, ${k})`;
            g.fillText("/MIN", feedX + rw + 5, spineY + 84);
        }

        /* ---------- Right Exit Stream ---------- */
        const ex = outX + 20;
        const win = (label, color, x, y) => {
            g.font = `600 10.5px ${SANS}`;
            g.fillStyle = color;
            g.fillText(label, x, y);
            const lw = g.measureText(label).width;
            g.fillStyle = `rgba(161, 161, 166, ${k})`;
            g.fillText(" · 24H", x + lw, y);
        };

        const closedY = spineY - FORK_DY;
        win("RESOLVED", `rgba(52, 199, 89, ${0.95 * k})`, ex, closedY - 20);
        g.font = `700 24px ${MONO}`;
        g.fillStyle = idle ? "rgba(52, 199, 89, 0.45)" : C.ok;
        g.fillText(idle ? "—" : S.closed.toLocaleString(), ex, closedY + 6);

        const escY = spineY + FORK_DY;
        win("ESCALATED", `rgba(255, 69, 58, ${0.95 * k})`, ex, escY - 10);
        g.font = `700 24px ${MONO}`;
        g.fillStyle = idle ? "rgba(255, 69, 58, 0.45)" : C.alert;
        g.fillText(idle ? "—" : S.escalated.toLocaleString(), ex, escY + 16);
    }, []);

    useEffect(() => {
        const wrap = wrapRef.current;
        const cv = canvasRef.current;
        if (!wrap || !cv) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        let alive = true;

        const size = () => {
            const r = wrap.getBoundingClientRect();
            if (!r.width || !r.height) return;
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
            return () => { alive = false; ro.disconnect(); };
        }

        let uiTick = 0;
        const loop = (now) => {
            if (!alive) return;
            rafRef.current = requestAnimationFrame(loop);
            const S = stateRef.current;
            if (!S) return;
            if (document.hidden) { S.last = now; return; }

            const dt = Math.min(now - S.last, 40);
            S.last = now;
            try {
                step(S, dt, now);
                draw(S, now);
            } catch (err) {
                console.error("Pipeline render error:", err);
            }

            if (now - uiTick > 400) {
                uiTick = now;
                setCounts({
                    closed: S.closed,
                    escalated: S.escalated,
                    inFlight: S.particles.length,
                    rate: S.rate,
                    podsUp: 8,
                    podsTotal: 8,
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
        <div className="w-full p-4 sm:p-8 flex items-center justify-center min-h-[calc(100vh-60px)]" style={{ background: C.void, fontFamily: SANS }}>
            {/* Apple VisionOS & Apple Intelligence Fluid Keyframe Animations */}
            <style>{`
                @keyframes vital-halo {
                    0%, 100% { opacity: 0.35; transform: scale(0.92); }
                    50% { opacity: 0.7; transform: scale(1.08); }
                }
                @keyframes vital-tracer {
                    0%, 100% { opacity: 0.9; transform: scale(1); }
                    50% { opacity: 0.35; transform: scale(1.6); }
                }
                @keyframes vital-orbit {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes vital-sheen {
                    0%, 100% { opacity: 0.15; }
                    50% { opacity: 0.5; }
                }
            `}</style>

            <div className="w-full" style={{ maxWidth: 1260 }}>
                {/* Frosted Glass Apple Hero Container with Specular Highlights */}
                <div
                    className="relative overflow-hidden rounded-3xl border transition-all duration-700 backdrop-blur-2xl"
                    style={{
                        borderColor: healthStatus === "optimal" ? "rgba(255, 255, 255, 0.09)" : healthMeta.borderBadge,
                        background: C.cardBg,
                        boxShadow: `0 30px 60px -12px rgba(0, 0, 0, 0.8), 0 0 45px ${healthMeta.heroGlow}, inset 0 1px 0 rgba(255, 255, 255, 0.12)`,
                    }}
                >
                    {/* Top Header:  Apple Intelligence System Health HUD */}
                    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-6 px-8 pt-7 pb-6 border-b border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent">
                        
                        {/* Left: Vitality Ring + Type Stack */}
                        <div className="flex items-center gap-5">
                            {/* Memoized 360° Vitality Ring with Smooth Count-Up */}
                            <VitalityRing
                                healthStatus={healthStatus}
                                meta={healthMeta}
                                reduced={reduced}
                            />

                            {/* Type Stack: mono kicker · display title · single telemetry line */}
                            <div>
                                <div
                                    className="flex items-center gap-2"
                                    style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 600, letterSpacing: "0.18em" }}
                                >
                                    <span style={{ color: C.dim }}>SYSTEM HEALTH</span>
                                    <span style={{ color: "rgba(255,255,255,0.15)" }}>/</span>
                                    <span className="flex items-center gap-1.5 transition-colors duration-500" style={{ color: healthMeta.color }}>
                                        <span
                                            className="w-1.5 h-1.5 rounded-full"
                                            style={{ background: healthMeta.color, boxShadow: `0 0 6px ${healthMeta.color}` }}
                                        />
                                        {healthMeta.badge.toUpperCase()}
                                    </span>
                                </div>

                                <div
                                    className="mt-2 transition-colors duration-500"
                                    style={{ fontFamily: SANS, fontSize: 25, fontWeight: 600, color: C.text, letterSpacing: "-0.026em", lineHeight: 1.1 }}
                                >
                                    {healthMeta.title}
                                </div>

                                {/* One calm telemetry row — mono numerals, hairline dividers */}
                                <div
                                    className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5"
                                    style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.04em" }}
                                >
                                    {healthMeta.breakdown.map((item, idx) => {
                                        const dotCol = item.status === "ok" ? C.ok : item.status === "warn" ? C.warn : C.alert;
                                        return (
                                            <span key={idx} className="flex items-center gap-1.5">
                                                {idx > 0 && <span className="w-px h-2.5 mr-1.5" style={{ background: "rgba(255,255,255,0.10)" }} />}
                                                <span className="w-1 h-1 rounded-full" style={{ background: dotCol }} />
                                                <span style={{ color: C.textSecondary }}>{item.label.toUpperCase()}</span>
                                                <span style={{ color: C.text, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                                                    {item.ok}/{item.total}
                                                </span>
                                            </span>
                                        );
                                    })}
                                    <span className="w-px h-2.5" style={{ background: "rgba(255,255,255,0.10)" }} />
                                    <span style={{ color: C.dim }}>{healthMeta.metrics}</span>
                                </div>
                            </div>
                        </div>

                        {/* Right: two identical segmented controls */}
                        <div className="flex flex-wrap items-center gap-2.5">
                            <AppleSegmentedControl
                                value={healthStatus}
                                onChange={setHealthStatus}
                                items={[
                                    { id: "optimal", label: "Healthy", dot: C.ok },
                                    { id: "degraded", label: "Degraded", dot: C.warn },
                                    { id: "critical", label: "Critical", dot: C.alert },
                                ]}
                            />
                            <AppleSegmentedControl
                                value={mode}
                                onChange={setMode}
                                items={[{ id: "sim", label: "Simulation" }, { id: "real", label: "Production" }]}
                            />
                        </div>
                    </div>

                    {/* Luxurious Spacious Canvas Stage Area */}
                    <div ref={wrapRef} className="relative w-full" style={{ height: 420 }}>
                        <canvas ref={canvasRef} className="block h-full w-full" />
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------
   Memoized Subcomponents: Zero-thrash Rendering
------------------------------------------------------------------- */

const VitalityRing = memo(function VitalityRing({ healthStatus, meta, reduced }) {
    const [displayVital, setDisplayVital] = useState(meta.vitality);
    const vitalRef = useRef(meta.vitality);

    useEffect(() => {
        const setVal = (v) => { vitalRef.current = v; setDisplayVital(v); };
        if (reduced) { setVal(meta.vitality); return; }
        const from = vitalRef.current;
        const target = meta.vitality;
        if (from === target) return;

        const t0 = performance.now();
        let raf;
        const tick = (t) => {
            const p = Math.min(1, (t - t0) / 600);
            const eased = 1 - Math.pow(1 - p, 3);
            setVal(Math.round(from + (target - from) * eased));
            if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [meta.vitality, reduced]);

    const beat = meta.beat;
    const anim = (v) => (reduced ? "none" : v);

    // Calculate endpoint marker coordinates
    const a = (meta.vitality / 100) * 2 * Math.PI - Math.PI / 2;
    const endX = 32 + 26 * Math.cos(a);
    const endY = 32 + 26 * Math.sin(a);

    return (
        <div className="relative flex items-center justify-center w-[64px] h-[64px] select-none shrink-0">
            {/* Ambient breathing halo */}
            <div
                className="absolute inset-[-8px] rounded-full pointer-events-none"
                style={{
                    background: `radial-gradient(circle, ${meta.color}3D 0%, ${meta.color}0F 45%, transparent 70%)`,
                    animation: anim(`vital-halo ${beat}s ease-in-out infinite`),
                }}
            />

            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 64 64">
                <defs>
                    <linearGradient id={`vital-${healthStatus}`} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor={meta.color} />
                        <stop offset="100%" stopColor={meta.colorSecondary} />
                        {!reduced && (
                            <animateTransform
                                attributeName="gradientTransform"
                                type="rotate"
                                from="0 0.5 0.5"
                                to="360 0.5 0.5"
                                dur={`${beat * 1.8}s`}
                                repeatCount="indefinite"
                            />
                        )}
                    </linearGradient>
                </defs>

                {/* Hairline track */}
                <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="3" />

                {/* Vitality arc */}
                <circle
                    cx="32" cy="32" r="26"
                    fill="none"
                    stroke={`url(#vital-${healthStatus})`}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 26}
                    strokeDashoffset={(2 * Math.PI * 26) * (1 - meta.vitality / 100)}
                    transform="rotate(-90 32 32)"
                    className="transition-all duration-700 ease-out"
                    style={{ filter: `drop-shadow(0 0 4px ${meta.color}80)` }}
                />

                {/* Specular sheen sweeping the ring */}
                <g style={{ animation: anim(`vital-orbit ${beat * 1.8}s linear infinite`), transformOrigin: "32px 32px" }}>
                    <circle
                        cx="32" cy="32" r="26"
                        fill="none"
                        stroke="#FFFFFF"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeDasharray="8 155"
                        style={{ animation: anim(`vital-sheen ${beat * 0.9}s ease-in-out infinite`), opacity: 0.18 }}
                    />
                </g>

                {/* Arc endpoint jewel marker */}
                <g className="transition-all duration-700 ease-out">
                    <circle
                        cx={endX} cy={endY} r="2.8"
                        fill={meta.color}
                        style={{
                            animation: anim(`vital-tracer ${beat * 0.6}s ease-in-out infinite`),
                            transformOrigin: `${endX}px ${endY}px`,
                        }}
                    />
                    <circle cx={endX} cy={endY} r="1.7" fill="#FFFFFF" />
                </g>
            </svg>

            {/* Score readout */}
            <div className="relative flex items-baseline justify-center">
                <span
                    style={{
                        fontFamily: MONO,
                        fontSize: 15,
                        fontWeight: 600,
                        letterSpacing: "-0.04em",
                        color: C.text,
                        fontVariantNumeric: "tabular-nums",
                    }}
                >
                    {displayVital}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 8, fontWeight: 600, color: C.dim, marginLeft: 1 }}>%</span>
            </div>
        </div>
    );
});

const AppleSegmentedControl = memo(function AppleSegmentedControl({ value, onChange, items }) {
    return (
        <div
            className="flex p-1 rounded-full border backdrop-blur-md"
            style={{ borderColor: C.glassBorder, background: "rgba(18, 24, 38, 0.6)", boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.04)" }}
        >
            {items.map(({ id, label, dot }) => {
                const active = value === id;
                return (
                    <button
                        key={id}
                        onClick={() => onChange(id)}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-medium transition-all duration-300"
                        style={{
                            fontFamily: SANS,
                            background: active ? "rgba(255, 255, 255, 0.13)" : "transparent",
                            color: active ? C.text : C.dim,
                            boxShadow: active ? "0 1px 4px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.14)" : "none",
                        }}
                    >
                        {dot && (
                            <span
                                className="w-1.5 h-1.5 rounded-full transition-all duration-300"
                                style={{ background: dot, opacity: active ? 1 : 0.45, boxShadow: active ? `0 0 6px ${dot}` : "none" }}
                            />
                        )}
                        {label}
                    </button>
                );
            })}
        </div>
    );
});
