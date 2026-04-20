"""
streamlit_dev_components/dev_chat_panel.py

The RIGHT column — text chat + voice chat tabs.
Imports run_turn from dev_debug_panels so the RAG capture logic stays in one place.
"""
from __future__ import annotations

import streamlit as st

from .dev_shared import (
    NODE_COLORS, PHASE_LABELS,
    _active_collection, _kb_label, _reset_all,
    get_engine, CONFIG_PATH, GOLD_PATH,
)
from .dev_debug_panels import run_turn, build_session_snapshot


# ── Messages helper ───────────────────────────────────────────────────────────

def _messages():
    return st.session_state.setdefault("messages", [])


# ── Multi-RAG toggle ──────────────────────────────────────────────────────────

def render_multi_rag_toggle():
    """Small toggle that flips engine.use_multi_collections live."""
    engine = get_engine()
    current = st.session_state.get("multi_rag_enabled", True)
    toggled = st.toggle(
        "🧬 Multi-collection RAG",
        value=current,
        help=(
            "ON → uses 6 typed Qdrant collections (healing/stories/activities…) "
            "phase-aware.\n"
            "OFF → single general collection (original behaviour)."
        ),
        key="multi_rag_toggle",
    )
    if toggled != current:
        st.session_state.multi_rag_enabled = toggled
        engine.use_multi_collections = toggled
        st.rerun()


# ── Secondary node / reasoning tag ───────────────────────────────────────────

def render_diagnosis_tag():
    diag_now  = get_engine().diagnosis_summary
    sec_node  = diag_now.get("secondary_node")
    reasoning = diag_now.get("node_reasoning")
    if not (sec_node or reasoning):
        return

    parts = []
    if sec_node:
        c   = NODE_COLORS.get(sec_node, "#64748b")
        lbl = sec_node.replace("_energy", "").replace("_", " ").title()
        parts.append(
            f"<span style='background:#f8fafc;color:{c};border:1px solid {c}88;"
            f"padding:2px 8px;border-radius:10px;font-size:0.72rem;font-weight:600;'>"
            f"Also possible: {lbl}</span>"
        )
    if reasoning:
        parts.append(
            f"<span style='color:#64748b;font-size:0.62rem;font-style:italic;'>{reasoning}</span>"
        )
    st.markdown(
        "<div style='display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px;'>"
        + " ".join(parts) + "</div>",
        unsafe_allow_html=True,
    )


# ── Text Chat ─────────────────────────────────────────────────────────────────

def render_text_chat():
    render_diagnosis_tag()

    msg_box = st.container(height=460, border=False)
    with msg_box:
        for msg in _messages():
            with st.chat_message(msg["role"]):
                st.write(msg["content"])

    if user_input := st.chat_input("Share what's on your mind…", key="text_input"):
        _messages().append({"role": "user", "content": user_input})
        with st.spinner("Souli is with you…"):
            full_response, _ = run_turn(user_input)
        _messages().append({"role": "assistant", "content": full_response})
        st.rerun()


# ── Voice Chat (stub — wires to existing voice pipeline) ─────────────────────

def render_voice_chat():
    st.info("🎤 Voice chat — connect your voice pipeline here (same as original streamlit_dev.py)")
    # Copy the existing voice tab code from your original streamlit_dev.py here.
    # It hasn't changed — just moved to this file.


# ── Full right column ─────────────────────────────────────────────────────────

def render_chat_column():
    st.markdown(
        f"## 🌿 Souli  <span style='font-size:0.75rem;color:#64748b;'>· {_kb_label()}</span>",
        unsafe_allow_html=True,
    )
    st.caption("Your inner wellness companion  ·  [dev mode]")

    ctrl_l, ctrl_mid, ctrl_r = st.columns([3, 1, 1])
    with ctrl_r:
        if st.button("↺ Reset", use_container_width=True, help="Reset conversation (same KB)"):
            key = f"engine_{st.session_state.get('kb_mode','improved')}"
            engine = st.session_state.get(key)
            if engine:
                try:
                    engine.reset()
                except Exception:
                    pass
                del st.session_state[key]
            for k in ("messages", "voice_messages"):
                st.session_state.pop(k, None)
            st.rerun()
    with ctrl_mid:
        engine_snap = get_engine()
        has_turns = bool(getattr(engine_snap, "_debug_events", []))
        if has_turns:
            snap_txt = build_session_snapshot()
            st.download_button(
                label="⬇ Snapshot",
                data=snap_txt,
                file_name="souli-session-snapshot.txt",
                mime="text/plain",
                use_container_width=True,
                help="Download full session log — paste to Claude for debugging",
            )
        else:
            st.button("⬇ Snapshot", disabled=True, use_container_width=True,
                      help="Chat first — snapshot available after first turn")
    with ctrl_l:
        st.caption(f"Config: `{CONFIG_PATH}`  |  Gold: `{GOLD_PATH or 'none'}`")

    # Multi-collection toggle — lives here so it's next to the chat
    render_multi_rag_toggle()

    chat_tab, voice_tab = st.tabs(["💬 Text Chat", "🎤 Voice Chat"])
    with chat_tab:
        render_text_chat()
    with voice_tab:
        render_voice_chat()