"""
streamlit_dev_components/dev_kb_bar.py

The KB toggle bar shown between the top metrics and the two-column layout.
Lets the user switch between original / improved collections.
"""
from __future__ import annotations

import streamlit as st

from .dev_shared import _active_collection, _reset_all, get_engine


def render_kb_bar():
    st.markdown("---")
    st.markdown("### 🗄️ Knowledge Base")
    st.caption(
        "Switch which Qdrant collection the conversation engine queries for RAG. "
        "Each mode keeps its own independent conversation history."
    )

    kb_col1, kb_col2, kb_col3 = st.columns([2, 2, 3])

    with kb_col1:
        orig_active = st.session_state.get("kb_mode") == "original"
        if st.button(
            f"{'✅ ' if orig_active else ''}📦 Original Pipeline\nsouli_chunks",
            key="btn_original",
            type="primary" if orig_active else "secondary",
            use_container_width=True,
            disabled=orig_active,
        ):
            st.session_state.kb_mode = "original"
            _reset_all()
            st.rerun()

    with kb_col2:
        impr_active = st.session_state.get("kb_mode") == "improved"
        if st.button(
            f"{'✅ ' if impr_active else ''}🚀 Improved Pipeline\nsouli_chunks_improved",
            key="btn_improved",
            type="primary" if impr_active else "secondary",
            use_container_width=True,
            disabled=impr_active,
        ):
            st.session_state.kb_mode = "improved"
            _reset_all()
            st.rerun()

    with kb_col3:
        mode_color = "#2563eb" if st.session_state.get("kb_mode") == "improved" else "#ca8a04"
        mode_icon  = "🚀"      if st.session_state.get("kb_mode") == "improved" else "📦"
        st.markdown(
            f'<div style="background:#f0f7ff;border:1px solid {mode_color};border-radius:10px;'
            f'padding:12px 16px;margin-top:4px;">'
            f'<span style="color:{mode_color};font-weight:700;font-size:0.9rem;">'
            f'{mode_icon} Active: {_active_collection()}</span><br>'
            f'<span style="color:#64748b;font-size:0.75rem;">'
            f'Switching resets conversation — fresh start with the new KB</span>'
            f'</div>',
            unsafe_allow_html=True,
        )

    st.markdown("---")