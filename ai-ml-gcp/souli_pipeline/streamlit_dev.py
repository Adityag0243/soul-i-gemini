"""
souli_pipeline/streamlit_dev.py

Souli — Developer / Tester Debug UI
Run from project root:
    streamlit run souli_pipeline/streamlit_dev.py

Split into components under streamlit_dev_components/ (same directory):
  dev_shared.py        — config, engine factory, CSS, shared constants
  dev_debug_panels.py  — run_turn(), all debug panel renderers
  dev_chat_panel.py    — right column chat UI
  dev_kb_bar.py        — KB toggle bar
"""
from __future__ import annotations

# ── PATH FIX — must be first ──────────────────────────────────────────────────
import sys
import os
from pathlib import Path

_this_file    = Path(__file__).resolve()
_project_root = _this_file.parent.parent   # parent of souli_pipeline/
if str(_project_root) not in sys.path:
    sys.path.insert(0, str(_project_root))

# ── Streamlit page config — must be before any st calls ──────────────────────
import streamlit as st

st.set_page_config(
    page_title="Souli Dev",
    page_icon="🔬",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# ── Import components ─────────────────────────────────────────────────────────
# The folder is next to this file, so we add the parent to path
_pkg_parent = _this_file.parent   # souli_pipeline/
if str(_pkg_parent) not in sys.path:
    sys.path.insert(0, str(_pkg_parent))

from streamlit_dev_components.dev_shared import (
    inject_css, init_session, get_engine,
    PHASE_LABELS, _active_collection, _load_config,
)
from streamlit_dev_components.dev_debug_panels import (
    render_phase_flow, render_turn_debug,
    render_turn_history_tab, render_qdrant_inspector, render_session_state_tab,
)
from streamlit_dev_components.dev_chat_panel import render_chat_column
from streamlit_dev_components.dev_kb_bar import render_kb_bar

# ── Bootstrap ─────────────────────────────────────────────────────────────────
inject_css()
init_session()


# ── TOP BAR ───────────────────────────────────────────────────────────────────
top_left, top_right = st.columns([1, 2])
with top_left:
    st.markdown("## 🔬 Souli Dev")
    st.caption("Developer debug interface")
with top_right:
    engine_ref = get_engine()
    diag = engine_ref.diagnosis_summary
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Turn",       diag.get("turn_count", 0))
    c2.metric("Phase",      PHASE_LABELS.get(diag.get("phase", ""), "—"))
    c3.metric("Node",       (diag.get("energy_node") or "—").replace("_energy","").replace("_"," ").title())
    c4.metric("Confidence", diag.get("confidence", "—"))

# ── KB Toggle Bar ─────────────────────────────────────────────────────────────
render_kb_bar()

# ── TWO-COLUMN LAYOUT ─────────────────────────────────────────────────────────
left_col, right_col = st.columns([4, 5], gap="medium")

# LEFT: Debug Panel
with left_col:
    cfg_obj = _load_config()

    st.markdown('<div class="dbg-section-header">Phase Flow (all turns)</div>',
                unsafe_allow_html=True)
    render_phase_flow()
    st.markdown('<hr class="dbg-divider"/>', unsafe_allow_html=True)

    tab_current, tab_history, tab_qdrant, tab_session = st.tabs([
        "📍 Current Turn",
        "🕑 Turn History",
        "🗄️ Qdrant Inspector",
        "🗃️ Session State",
    ])

    with tab_current:
        latest = getattr(get_engine(), "latest_debug", None)
        if not latest:
            st.markdown(
                '<div style="color:#94a3b8;padding:20px 0;">No turns yet. Send a message to start.</div>',
                unsafe_allow_html=True,
            )
        else:
            st.markdown(
                f'<div class="dbg-section-header">Turn #{latest.get("turn","?")} details</div>',
                unsafe_allow_html=True,
            )
            render_turn_debug(latest)

    with tab_history:
        render_turn_history_tab()

    with tab_qdrant:
        render_qdrant_inspector(cfg_obj)

    with tab_session:
        render_session_state_tab()

# RIGHT: Chat
with right_col:
    render_chat_column()