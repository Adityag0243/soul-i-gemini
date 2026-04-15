"""
streamlit_dev_components/dev_debug_panels.py

Everything in the LEFT debug panel:
  - run_turn()               ← engine bridge (monkey-patches RAG + counselor to capture data)
  - phase_badge()
  - confidence_badge()
  - render_phase_flow()
  - render_turn_debug()      ← the big one: sections 1-8
  - render_turn_history_tab()
  - render_session_state_tab()
  - render_qdrant_inspector()
"""
from __future__ import annotations

import time
from collections import Counter
from typing import Any, Dict, List, Optional

import streamlit as st

from .dev_shared import (
    CTYPE_COLORS, PHASE_LABELS, NODE_COLORS,
    _active_collection, _load_config, get_engine,
)


# ── Badge helpers ─────────────────────────────────────────────────────────────

def phase_badge(phase: str) -> str:
    label = PHASE_LABELS.get(phase, phase)
    return (
        f'<span class="badge badge-phase">{label}</span>'
    )

def confidence_badge(conf: str) -> str:
    _MAP = {
        "high_confidence":   ("#dcfce7", "#15803d", "✅ High Confidence"),
        "tagger_confirmed":  ("#d1fae5", "#065f46", "🤖 Tagger Confirmed"),
        "tagger_only":       ("#ecfdf5", "#047857", "🤖 Tagger Only"),
        "embedding_match":   ("#dbeafe", "#1d4ed8", "🔢 Embedding Match"),
        "keyword_fallback":  ("#fee2e2", "#b91c1c", "⚠️ Keyword Fallback"),
        "unknown":           ("#f1f5f9", "#475569", "❓ Unknown"),
    }
    bg, fg, label = _MAP.get(conf, ("#f1f5f9", "#475569", conf or "—"))
    return (
        f'<span class="badge" style="background:{bg};color:{fg};'
        f'border:1px solid {fg}55;font-weight:700;padding:3px 10px;border-radius:12px;">'
        f'{label}</span>'
    )


# ── Engine bridge — captures RAG + prompt on every turn ──────────────────────

def run_turn(user_input: str):
    """
    Run one engine turn and return (response_text, debug_event).
    Monkey-patches _rag_retrieve and counselor functions to capture
    what actually gets sent to Ollama.
    """
    engine = get_engine()

    # ── Capture RAG chunks ────────────────────────────────────────────────
    rag_captured: list = []
    _orig_rag = engine._rag_retrieve

    def _capturing_rag(query, energy_node):
        chunks = _orig_rag(query, energy_node)
        rag_captured.extend(chunks)
        return chunks

    engine._rag_retrieve = _capturing_rag

    # ── Capture the exact prompt sent to Ollama ───────────────────────────
    prompt_captured: Dict[str, Any] = {"system": None, "messages": None, "type": "counselor"}
    patched_counselor = False

    try:
        import souli_pipeline.conversation.counselor as _counselor_mod
        _orig_generate = _counselor_mod.generate_counselor_response
        _orig_solution = _counselor_mod.generate_solution_response

        def _capturing_counselor(history, user_message, rag_chunks, **kwargs):
            from souli_pipeline.conversation.counselor import (
                _build_chat_messages, _build_counselor_system,
            )
            msgs = _build_chat_messages(history, user_message, rag_chunks,
                                        energy_node=kwargs.get("energy_node"))
            sys_p = _build_counselor_system(
                user_name=kwargs.get("user_name"),
                phase=kwargs.get("phase"),
                asked_topics=kwargs.get("asked_topics"),
            )
            prompt_captured["system"]   = sys_p
            prompt_captured["messages"] = msgs
            prompt_captured["type"]     = "counselor"
            return _orig_generate(history, user_message, rag_chunks, **kwargs)

        def _capturing_solution(energy_node, framework_solution, user_context, **kwargs):
            from souli_pipeline.conversation.counselor import (
                _build_solution_prompt, _SOLUTION_SYSTEM,
            )
            p = _build_solution_prompt(energy_node, framework_solution, user_context)
            prompt_captured["system"]             = _SOLUTION_SYSTEM
            prompt_captured["messages"]           = [{"role": "user", "content": p}]
            prompt_captured["type"]               = "solution"
            prompt_captured["framework_solution"] = framework_solution
            prompt_captured["energy_node"]        = energy_node
            prompt_captured["user_context"]       = user_context[:400]
            return _orig_solution(energy_node, framework_solution, user_context, **kwargs)

        _counselor_mod.generate_counselor_response = _capturing_counselor
        _counselor_mod.generate_solution_response  = _capturing_solution
        patched_counselor = True
    except Exception:
        pass

    # ── Run the turn ──────────────────────────────────────────────────────
    phase_before = engine.state.phase
    t_start = time.perf_counter()
    full_response = ""
    source = "llm"

    try:
        for chunk in engine.turn_stream(user_input):
            full_response += chunk
    except Exception:
        try:
            full_response = engine.turn(user_input)
        except Exception as e:
            full_response = f"[Engine error: {e}]"
            source = "fallback"

    elapsed_ms = int((time.perf_counter() - t_start) * 1000)

    # ── Restore patches ───────────────────────────────────────────────────
    engine._rag_retrieve = _orig_rag
    if patched_counselor:
        _counselor_mod.generate_counselor_response = _orig_generate
        _counselor_mod.generate_solution_response  = _orig_solution

    phase_after = engine.state.phase
    diag        = engine.diagnosis_summary
    diag_detail = getattr(engine.state, "_last_diagnosis_detail", None) or {}

    # ── Build debug event ─────────────────────────────────────────────────
    debug_ev = {
        "turn":         engine.state.turn_count,
        "user_text":    user_input,
        "phase_before": phase_before,
        "phase_after":  phase_after,
        "kb_mode":      st.session_state.get("kb_mode", "improved"),
        "collection":   _active_collection(),

        "diagnosis": {
            "ran":         True,
            "energy_node": diag.get("energy_node"),
            "confidence":  diag.get("confidence", "unknown"),
            "detail":      diag_detail,
            "is_fallback": diag.get("confidence", "") == "keyword_fallback",
        },

        "rag": {
            "ran":                True,
            "query":              user_input,
            "energy_node_filter": diag.get("energy_node"),
            "results_count":      len(rag_captured),
            "results":            rag_captured[:5],
        },

        "llm": {
            "ran":               True,
            "model":             engine.chat_model,
            "used_fallback":     source == "fallback",
            "phase":             phase_before,
            "history_length":    len(engine.state.messages),
            "rag_chunks_injected": len(rag_captured),
            "latency_ms":        elapsed_ms,
            "prompt_type":       prompt_captured.get("type", "counselor"),
            "prompt_system":     prompt_captured.get("system"),
            "prompt_messages":   prompt_captured.get("messages"),
        },

        "solution": (
            {
                "active":             True,
                "framework_solution": prompt_captured.get("framework_solution"),
                "energy_node":        prompt_captured.get("energy_node"),
                "user_context":       prompt_captured.get("user_context"),
            }
            if prompt_captured.get("type") == "solution"
            else {"active": False}
        ),

        "state_after": {
            "phase":             engine.state.phase,
            "energy_node":       engine.state.energy_node,
            "turn_count":        engine.state.turn_count,
            "intent":            engine.state.intent,
            "user_name":         engine.state.user_name,
            "summary_attempted": engine.state.summary_attempted,
        },
    }

    if not hasattr(engine, "_debug_events"):
        engine._debug_events = []
    engine._debug_events.append(debug_ev)
    engine.latest_debug = debug_ev

    return full_response, debug_ev


# ── Phase flow (mini timeline at top of debug panel) ─────────────────────────

def render_phase_flow():
    engine = get_engine()
    events = getattr(engine, "_debug_events", [])
    if not events:
        st.markdown('<span style="color:#94a3b8;font-size:0.78rem;">No turns yet.</span>',
                    unsafe_allow_html=True)
        return
    parts = []
    for ev in events:
        pb = ev.get("phase_before", "?")
        pa = ev.get("phase_after", "?")
        if pb == pa:
            parts.append(
                f'<span class="badge badge-phase" style="font-size:0.65rem;">'
                f'{PHASE_LABELS.get(pb, pb)}</span>'
            )
        else:
            parts.append(
                f'<span class="badge badge-phase" style="font-size:0.65rem;">{PHASE_LABELS.get(pb, pb)}</span>'
                f'<span style="color:#16a34a;margin:0 3px;">→</span>'
                f'<span class="badge badge-warn" style="font-size:0.65rem;">{PHASE_LABELS.get(pa, pa)}</span>'
            )
    st.markdown(
        '<div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;">'
        + "".join(parts) + "</div>",
        unsafe_allow_html=True,
    )


# ── Main per-turn debug renderer ──────────────────────────────────────────────

def render_turn_debug(ev: Dict[str, Any]):
    """Render the full debug panel for one conversation turn (sections 1-8)."""
    if not ev:
        return

    # 1. Phase Transition
    st.markdown('<div class="dbg-section-header">Phase Transition</div>', unsafe_allow_html=True)
    pb, pa = ev.get("phase_before", "?"), ev.get("phase_after", "?")
    if pb == pa:
        st.markdown(phase_badge(pb) + ' <span style="color:#94a3b8;">no change</span>',
                    unsafe_allow_html=True)
    else:
        st.markdown(
            phase_badge(pb) + ' <span style="color:#16a34a;font-size:1rem;">→</span> ' + phase_badge(pa),
            unsafe_allow_html=True,
        )

    # 2. KB Mode
    kb    = ev.get("kb_mode", "?")
    coll  = ev.get("collection", "?")
    color = "#2563eb" if kb == "improved" else "#ca8a04"
    st.markdown(
        f'<div class="dbg-section-header">Knowledge Base Used</div>'
        f'<span class="badge" style="background:#eff6ff;color:{color};border-left:3px solid {color};">'
        f'{"🚀 Improved" if kb == "improved" else "📦 Original"}  ·  {coll}</span>',
        unsafe_allow_html=True,
    )

    # 3. User Input
    st.markdown('<div class="dbg-section-header">User Input</div>', unsafe_allow_html=True)
    st.markdown(f'<div class="info-box mono">{ev.get("user_text","")[:400]}</div>',
                unsafe_allow_html=True)

    # 4. Diagnosis
    diag   = ev.get("diagnosis", {})
    detail = diag.get("detail", {})
    st.markdown('<div class="dbg-section-header">🧠 Diagnosis</div>', unsafe_allow_html=True)
    node   = diag.get("energy_node", "—")
    conf   = diag.get("confidence", "unknown")
    nc     = NODE_COLORS.get(node, "#94a3b8")
    st.markdown(
        f'<span style="background:{nc}22;color:{nc};border:1px solid {nc}88;'
        f'border-radius:10px;padding:2px 10px;font-weight:700;font-size:0.82rem;">'
        f'{node}</span>&nbsp;&nbsp;{confidence_badge(conf)}',
        unsafe_allow_html=True,
    )
    if detail:
        with st.expander("Triple-hybrid breakdown", expanded=False):
            kw  = detail.get("keyword",   {})
            emb = detail.get("embedding", {})
            tag = detail.get("tagger",    {})
            st.json({
                "keyword":   kw,
                "embedding": emb,
                "tagger":    tag,
                "scores":    detail.get("scores", {}),
            })

    # 5. RAG — UPDATED: shows chunk_type badges
    rag        = ev.get("rag", {})
    rag_count  = rag.get("results_count", 0)
    results    = rag.get("results", [])
    diag_node  = rag.get("energy_node_filter", "")

    with st.expander(
        f"🗄️ Qdrant — {rag_count} chunks  [filter: {diag_node or 'none'}]",
        expanded=True,
    ):
        if not results:
            st.markdown(
                '<div class="info-box" style="color:#dc2626;border-left:3px solid #fca5a5;">'
                '⚠️ No chunks retrieved. LLM has ZERO teaching context.</div>',
                unsafe_allow_html=True,
            )
        else:
            # Summary: how many from each collection type
            type_counts = Counter(r.get("chunk_type", "general") for r in results)
            type_str = "  ·  ".join(
                f'<span style="color:{CTYPE_COLORS.get(k,"#94a3b8")};font-weight:700;">'
                f'{k}: {v}</span>'
                for k, v in sorted(type_counts.items())
            )
            st.markdown(
                f'<div style="font-size:0.7rem;margin-bottom:8px;">{type_str}</div>',
                unsafe_allow_html=True,
            )

            for i, r in enumerate(results, 1):
                score      = r.get("score", 0)
                chunk_node = r.get("energy_node", "")
                chunk_type = r.get("chunk_type", "general")
                node_mismatch = chunk_node and diag_node and chunk_node != diag_node
                score_color   = "#16a34a" if score > 0.7 else "#d97706" if score > 0.45 else "#dc2626"
                ctype_color   = CTYPE_COLORS.get(chunk_type, "#94a3b8")
                mismatch_html = (
                    '<span style="color:#ef4444;font-size:0.7rem;"> ⚠️ node mismatch!</span>'
                    if node_mismatch else ""
                )
                st.markdown(
                    f'<div class="rag-card">'
                    f'<span style="background:{ctype_color}22;color:{ctype_color};'
                    f'border:1px solid {ctype_color}66;border-radius:8px;'
                    f'padding:1px 7px;font-size:0.65rem;font-weight:700;margin-right:6px;">'
                    f'{chunk_type.upper()}</span>'
                    f'<span class="rag-node">[{chunk_node}]</span>{mismatch_html}'
                    f'<span class="rag-score" style="color:{score_color};">score: {score:.4f}</span>'
                    f'<span class="rag-source">{r.get("source_video","")}</span>'
                    f'<div class="rag-text">{r.get("text","")[:350]}</div>'
                    f'</div>',
                    unsafe_allow_html=True,
                )

    # 6. LLM Call
    llm          = ev.get("llm", {})
    fallback_flag = llm.get("used_fallback", False)
    latency      = llm.get("latency_ms", 0)
    st.markdown('<div class="dbg-section-header">🤖 LLM Call</div>', unsafe_allow_html=True)
    c1, c2, c3 = st.columns(3)
    c1.markdown(f'<span style="font-size:0.78rem;">Model: <b>{llm.get("model","?")}</b></span>', unsafe_allow_html=True)
    c2.markdown(f'<span style="font-size:0.78rem;">RAG injected: <b>{llm.get("rag_chunks_injected",0)}</b></span>', unsafe_allow_html=True)
    c3.markdown(f'<span style="font-size:0.78rem;">Latency: <b>{latency} ms</b></span>', unsafe_allow_html=True)

    if fallback_flag:
        st.error("⚠️ Ollama was unavailable — response came from hardcoded fallback, NOT the LLM.")

    prompt_type = llm.get("prompt_type", "counselor")
    sys_p       = llm.get("prompt_system")
    msgs_p      = llm.get("prompt_messages")

    if sys_p:
        with st.expander("System Prompt", expanded=False):
            st.code(sys_p, language="text")
    if msgs_p:
        with st.expander(f"Messages array ({len(msgs_p)} msgs)", expanded=False):
            for i, m in enumerate(msgs_p):
                role    = m.get("role", "?")
                content = m.get("content", "")
                is_rag  = "[CONTEXT" in content or "[HEALING" in content or "[STORY" in content
                rc      = "#2563eb" if role == "user" else "#16a34a"
                border  = "2px solid #d97706" if is_rag else "1px solid #334155"
                label   = f"[{i}] {role}" + (" ← RAG injection" if is_rag else "")
                st.markdown(
                    f'<div style="border:{border};border-radius:6px;padding:8px;margin:4px 0;">'
                    f'<div style="color:{rc};font-size:0.72rem;font-weight:700;">{label}</div>'
                    f'<div style="color:#cbd5e1;font-size:0.8rem;margin-top:4px;white-space:pre-wrap;">'
                    f'{content[:600]}{"..." if len(content)>600 else ""}'
                    f'</div></div>',
                    unsafe_allow_html=True,
                )

    # 7. Solution Phase Inspector
    sol = ev.get("solution", {})
    if sol.get("active"):
        fw       = sol.get("framework_solution") or {}
        sol_node = sol.get("energy_node", "")
        user_ctx = sol.get("user_context", "")
        with st.expander("💊 Solution Phase — framework content used", expanded=True):
            if not fw:
                st.warning("No framework solution found for this node.")
            else:
                st.markdown(f"**Node:** `{sol_node}`")
                if user_ctx:
                    st.markdown("**User context used:**")
                    st.markdown(f'<div class="info-box">{user_ctx}</div>', unsafe_allow_html=True)
                for k, v in fw.items():
                    if v:
                        with st.expander(k, expanded=False):
                            st.write(v)

    # 8. Fallback warning
    if diag.get("is_fallback"):
        st.markdown(
            '<div class="info-box" style="border-left:4px solid #f97316;background:#fff7ed;">'
            '⚠️ <b>Keyword Fallback Active</b> — Qwen tagger + embedding both failed. '
            'Node was chosen by keyword matching only. May be inaccurate.</div>',
            unsafe_allow_html=True,
        )


# ── Tab: Turn History ─────────────────────────────────────────────────────────

def render_turn_history_tab():
    engine = get_engine()
    events = getattr(engine, "_debug_events", [])
    if not events:
        st.markdown('<span style="color:#94a3b8;">No turns yet.</span>', unsafe_allow_html=True)
        return
    st.markdown(f"### {len(events)} turns recorded")
    for ev in reversed(events):
        turn_n  = ev.get("turn", "?")
        pb      = PHASE_LABELS.get(ev.get("phase_before", ""), ev.get("phase_before", "?"))
        pa      = PHASE_LABELS.get(ev.get("phase_after",  ""), ev.get("phase_after",  "?"))
        node    = ev.get("state_after", {}).get("energy_node") or ev.get("diagnosis", {}).get("energy_node")
        rag_n   = ev.get("rag", {}).get("results_count", 0)
        fallback= ev.get("llm", {}).get("used_fallback", False)
        kb      = ev.get("kb_mode", "?")
        snippet = ev.get("user_text", "")[:60]
        label   = (
            f"Turn #{turn_n} | {pb}"
            + (f" → {pa}" if pb != pa else "")
            + f" | {node or '?'} | RAG: {rag_n} | KB: {kb}"
            + (" | ⚠ FALLBACK" if fallback else "")
        )
        with st.expander(label, expanded=False):
            st.caption(f'User: "{snippet}"')
            render_turn_debug(ev)


# ── Tab: Qdrant Inspector ─────────────────────────────────────────────────────

def render_qdrant_inspector(cfg_obj=None):
    st.markdown("### 🗄️ Qdrant Inspector")
    cfg = cfg_obj or _load_config()

    host = getattr(getattr(cfg, "retrieval", None), "qdrant_host", "localhost")
    port = getattr(getattr(cfg, "retrieval", None), "qdrant_port", 6333)

    try:
        from qdrant_client import QdrantClient
        client      = QdrantClient(host=host, port=port, timeout=3)
        collections = [c.name for c in client.get_collections().collections]
        st.success(f"✅ Qdrant connected at {host}:{port}")
        st.caption(f"Collections: {', '.join(collections) if collections else 'none'}")
    except Exception as e:
        st.error(f"Qdrant unreachable: {e}")
        return

    target = st.selectbox("Collection to inspect", collections or ["(none)"], key="qdrant_insp_coll")
    query  = st.text_input("Test query", value="I feel exhausted and stuck", key="qdrant_insp_query")
    node_f = st.selectbox(
        "Energy node filter (optional)",
        ["(none)", "blocked_energy", "depleted_energy", "scattered_energy",
         "outofcontrol_energy", "normal_energy"],
        key="qdrant_insp_node",
    )
    top_k  = st.slider("Top K", 1, 5, 3, key="qdrant_insp_topk")

    if st.button("Run query", key="qdrant_insp_run"):
        node = None if node_f == "(none)" else node_f
        try:
            from souli_pipeline.retrieval.qdrant_store_improved import query_improved_chunks
            t0      = time.perf_counter()
            results = query_improved_chunks(
                user_text=query, collection=target,
                energy_node=node, top_k=top_k,
                host=host, port=port,
            )
            latency = (time.perf_counter() - t0) * 1000
            st.caption(f"{len(results)} results in {latency:.0f} ms")
            for i, r in enumerate(results, 1):
                score = r.get("score", 0)
                sc    = "#16a34a" if score > 0.7 else "#d97706" if score > 0.45 else "#dc2626"
                with st.expander(
                    f"#{i}  score={score:.4f}  [{r.get('energy_node','')}]  "
                    f"{r.get('source_video','')[:50]}",
                    expanded=(i <= 2),
                ):
                    st.markdown(
                        f'<span class="rag-score" style="color:{sc};">Score: {score:.4f}</span>  '
                        f'<span class="rag-node">[{r.get("energy_node","")}]</span>  '
                        f'<span class="rag-source">{r.get("source_video","")}</span>',
                        unsafe_allow_html=True,
                    )
                    st.markdown(r.get("text", ""))
                    st.caption(f"chunk_type: {r.get('chunk_type','—')}  |  URL: {r.get('youtube_url','—')}")
        except Exception as exc:
            import traceback
            st.error(f"Query failed: {exc}")
            st.code(traceback.format_exc())


# ── Tab: Session State ────────────────────────────────────────────────────────

def render_session_state_tab():
    engine = get_engine()
    s      = engine.state
    st.markdown("### 🗃️ Full ConversationState")
    st.json({
        "phase":               s.phase,
        "turn_count":          s.turn_count,
        "user_name":           s.user_name,
        "energy_node":         s.energy_node,
        "node_confidence":     s.node_confidence,
        "intent":              s.intent,
        "summary_attempted":   s.summary_attempted,
        "summary_confirmed":   getattr(s, "summary_confirmed", None),
        "rich_opening":        getattr(s, "rich_opening", None),
        "short_answer_count":  s.short_answer_count,
        "user_text_buffer_words": len(s.user_text_buffer.split()),
        "messages_count":      len(s.messages),
        "active_collection":   _active_collection(),
        "multi_rag_enabled":   st.session_state.get("multi_rag_enabled", True),
    })
    st.markdown("### 💬 Message History")
    for i, msg in enumerate(s.messages):
        role  = msg["role"]
        color = "#2563eb" if role == "user" else "#16a34a"
        icon  = "👤" if role == "user" else "🌿"
        with st.expander(f"{icon} [{i}] {role}", expanded=False):
            st.markdown(
                f'<div class="info-box" style="color:{color};">{msg["content"]}</div>',
                unsafe_allow_html=True,
            )


# ── Session snapshot builder ──────────────────────────────────────────────────

def build_session_snapshot() -> str:
    """
    Build a plain-text snapshot of the current session.
    Reads directly from engine._debug_events (already populated by run_turn).
    Returns a string ready to download or paste.
    """
    import datetime
    engine = get_engine()
    events = getattr(engine, "_debug_events", [])
    messages = st.session_state.get("messages", [])
    kb   = st.session_state.get("kb_mode", "unknown")
    now  = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    L = []
    L.append("═══════════════════════════════════════════════════════")
    L.append("SOULI SESSION SNAPSHOT")
    L.append("═══════════════════════════════════════════════════════")
    L.append(f"Generated  : {now}")
    L.append(f"KB mode    : {kb}  ({_active_collection()})")
    L.append(f"Turns      : {len(events)}")
    L.append(f"Multi-RAG  : {st.session_state.get('multi_rag_enabled', True)}")
    L.append("")

    if not events:
        L.append("(no turns recorded yet)")
        L.append("═══════════════════════════════════════════════════════")
        return "\n".join(L)

    # ── Phase journey ─────────────────────────────────────────────────────
    L.append("─── PHASE JOURNEY ──────────────────────────────────────")
    journey_parts = []
    for ev in events:
        pb = PHASE_LABELS.get(ev.get("phase_before", "?"), ev.get("phase_before", "?"))
        pa = PHASE_LABELS.get(ev.get("phase_after",  "?"), ev.get("phase_after",  "?"))
        journey_parts.append(pa if pb == pa else f"{pb}→{pa}")
    L.append("  ".join(f"#{i+1}:{p}" for i, p in enumerate(journey_parts)))
    L.append("")

    # ── Turn by turn ──────────────────────────────────────────────────────
    L.append("─── TURN BY TURN ───────────────────────────────────────")
    for ev in events:
        turn_n     = ev.get("turn", "?")
        phase_b    = PHASE_LABELS.get(ev.get("phase_before", "?"), ev.get("phase_before", "?"))
        phase_a    = PHASE_LABELS.get(ev.get("phase_after",  "?"), ev.get("phase_after",  "?"))
        user_text  = ev.get("user_text", "")[:120]
        diag       = ev.get("diagnosis", {})
        node       = diag.get("energy_node") or ev.get("state_after", {}).get("energy_node") or "—"
        conf       = diag.get("confidence", "—")
        rag_count  = ev.get("rag", {}).get("results_count", 0)
        fallback   = ev.get("llm", {}).get("used_fallback", False)
        latency    = ev.get("llm", {}).get("latency_ms", 0)
        solution   = ev.get("solution", {}).get("active", False)
        is_kw_fb   = diag.get("is_fallback", False)

        # Souli reply — messages list is [greeting, user, souli, user, souli …]
        # index = turn_n * 2  (greeting is index 0, then pairs after)
        try:
            souli_reply = messages[turn_n * 2]["content"][:150]
        except (IndexError, KeyError):
            souli_reply = ""

        L.append("")
        L.append(f"TURN #{turn_n}")
        phase_str = f"{phase_b}" if phase_b == phase_a else f"{phase_b} → {phase_a}"
        L.append(f"  Phase      : {phase_str}")
        L.append(f"  Node       : {node}")
        L.append(f"  Confidence : {conf}" + (" ⚠ KEYWORD FALLBACK" if is_kw_fb else ""))
        L.append(f"  RAG chunks : {rag_count}")
        L.append(f"  Latency    : {latency} ms")
        L.append(f"  Fallback   : {'YES ⚠' if fallback else 'no'}")
        L.append(f"  Solution   : {'YES' if solution else 'no'}")
        L.append(f"  User       : {user_text}")
        if souli_reply:
            L.append(f"  Souli      : {souli_reply}")

        # RAG chunk detail (top 3)
        rag_results = ev.get("rag", {}).get("results", [])
        if rag_results:
            L.append(f"  RAG hits   :")
            for i, chunk in enumerate(rag_results[:3], 1):
                score      = chunk.get("score", 0)
                cnode      = chunk.get("energy_node", "?")
                ctype      = chunk.get("chunk_type", "?")
                ctext      = (chunk.get("text") or "")[:80]
                L.append(f"    [{i}] score={score:.3f}  node={cnode}  type={ctype} | {ctext}…")

        # Solution framework snippet
        if solution:
            fw = ev.get("solution", {}).get("framework_solution") or {}
            if fw:
                # just show the keys so it's skimmable
                L.append(f"  Sol. keys  : {', '.join(str(k) for k in fw.keys())}")

    # ── Summary ───────────────────────────────────────────────────────────
    L.append("")
    L.append("─── SUMMARY ────────────────────────────────────────────")
    phase_counts = Counter(
        PHASE_LABELS.get(ev.get("phase_after", "?"), ev.get("phase_after", "?"))
        for ev in events
    )
    node_counts = Counter(
        ev.get("diagnosis", {}).get("energy_node") or ev.get("state_after", {}).get("energy_node")
        for ev in events
        if ev.get("diagnosis", {}).get("energy_node") or ev.get("state_after", {}).get("energy_node")
    )
    total_rag  = sum(ev.get("rag", {}).get("results_count", 0) for ev in events)
    fallbacks  = sum(1 for ev in events if ev.get("llm", {}).get("used_fallback", False))
    kw_fallbacks = sum(1 for ev in events if ev.get("diagnosis", {}).get("is_fallback", False))
    solutions  = sum(1 for ev in events if ev.get("solution", {}).get("active", False))
    avg_latency = sum(ev.get("llm", {}).get("latency_ms", 0) for ev in events) / len(events)

    L.append("Phase counts  : " + ", ".join(f"{k}={v}" for k, v in phase_counts.most_common()))
    L.append("Node counts   : " + (", ".join(f"{k}={v}" for k, v in node_counts.most_common()) or "none detected"))
    L.append(f"Total RAG     : {total_rag} chunks / {len(events)} turns  (avg {total_rag/len(events):.1f})")
    L.append(f"LLM fallbacks : {fallbacks}")
    L.append(f"KW fallbacks  : {kw_fallbacks}")
    L.append(f"Solution turns: {solutions}")
    L.append(f"Avg latency   : {avg_latency:.0f} ms")
    L.append("")
    L.append("═══════════════════════════════════════════════════════")
    return "\n".join(L)