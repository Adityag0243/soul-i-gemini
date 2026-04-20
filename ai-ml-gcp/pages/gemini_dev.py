<<<<<<< HEAD
"""
pages/gemini_dev.py

Gemini dev page — accessible on the same Streamlit app (port 8502) as a new page.
Shows up in the sidebar as "🤖 Gemini Dev" alongside existing dev pages.

Features:
  - Toggle to switch between Gemini and Ollama engine (top of page)
  - Chat panel that uses GeminiEngine when toggled on
  - Per-turn debug panel showing:
      - Phase decision (from Gemini JSON)
      - Energy node + reasoning
      - RAG chunks used in solution phase
      - MongoDB storage status
      - Response latency
  - MongoDB session inspector (recent sessions)
  - Full session JSON viewer

This page adds zero changes to existing pages.
"""
from __future__ import annotations

import os
import time
import traceback
from typing import Any, Dict, Optional

import streamlit as st

# ── Page config ───────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Souli — Gemini Dev",
    page_icon="🤖",
    layout="wide",
)

# ── CSS (minimal, matches existing dev page style) ────────────────────────────
st.markdown("""
<style>
.phase-badge {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 700;
    background: #e0f2fe;
    color: #0369a1;
    margin-right: 4px;
}
.energy-badge {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 700;
    background: #fef3c7;
    color: #92400e;
}
.step-card {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 10px 14px;
    margin: 6px 0;
    font-size: 0.82rem;
}
.mongo-ok { color: #16a34a; font-weight: 700; }
.mongo-err { color: #dc2626; font-weight: 700; }
</style>
""", unsafe_allow_html=True)

# ── Engine loader ─────────────────────────────────────────────────────────────

@st.cache_resource
def _load_gemini_engine():
    """Load GeminiEngine once, cache for session."""
    try:
        from souli_pipeline.config_loader import load_config
        from souli_pipeline.conversation.gemini_engine import GeminiEngine

        cfg_path = (
            "configs/pipeline.gcp.yaml"
            if os.path.exists("configs/pipeline.gcp.yaml")
            else "configs/pipeline.yaml"
        )
        cfg = load_config(cfg_path)
        engine = GeminiEngine.from_config(cfg)
        return engine, None
    except Exception as e:
        return None, str(e)


def get_gemini_engine():
    engine, err = _load_gemini_engine()
    if err:
        st.error(f"Failed to load GeminiEngine: {err}")
        st.code(traceback.format_exc())
        st.stop()
    return engine


# =============================================================================
# Header + Engine Toggle
# =============================================================================

st.markdown("## 🤖 Gemini Dev Panel")
st.caption(
    "Parallel Gemini version of Souli — same conversation, different engine. "
    "Ollama engine on other dev pages is untouched."
)

# ── Engine toggle (top, matching the multi-RAG toggle position) ───────────────
col_toggle, col_info = st.columns([2, 5])
with col_toggle:
    use_gemini = st.toggle(
        "🤖 Use Gemini Engine",
        value=True,
        key="gemini_engine_toggle",
        help=(
            "ON  → Gemini Flash/Pro handles the conversation\n"
            "OFF → Shows this page but uses Ollama (for A/B comparison)"
        ),
    )
with col_info:
    if use_gemini:
        flash = os.environ.get("GEMINI_FLASH_MODEL", "gemini-2.5-flash-preview-05-20")
        pro   = os.environ.get("GEMINI_PRO_MODEL",   "gemini-2.5-pro-preview-05-06")
        key_set = bool(os.environ.get("GEMINI_API_KEY", "").strip())
        st.markdown(
            f"**Flash:** `{flash}`  &nbsp;&nbsp; **Pro:** `{pro}`  &nbsp;&nbsp; "
            f"**API Key:** {'✅ Set' if key_set else '❌ Not set — add GEMINI_API_KEY to .env'}"
        )
    else:
        st.info("Gemini toggle is OFF — turn it ON to use Gemini engine.")

# ── MongoDB status (top right) ────────────────────────────────────────────────
try:
    from souli_pipeline.storage import mongo_store
    mongo_ok = mongo_store.is_connected()
    mongo_label = "🟢 MongoDB connected" if mongo_ok else "🔴 MongoDB not connected"
    mongo_class = "mongo-ok" if mongo_ok else "mongo-err"
    st.markdown(
        f'<span class="{mongo_class}">{mongo_label}</span>',
        unsafe_allow_html=True,
    )
except Exception as e:
    st.markdown('<span class="mongo-err">🔴 MongoDB error</span>', unsafe_allow_html=True)

st.divider()

# =============================================================================
# Main layout: Chat (left) | Debug (right)
# =============================================================================

chat_col, debug_col = st.columns([3, 4], gap="large")

# ── Session init ──────────────────────────────────────────────────────────────
if "gemini_turns" not in st.session_state:
    st.session_state.gemini_turns = []

if "gemini_session_started" not in st.session_state:
    st.session_state.gemini_session_started = False


# =============================================================================
# LEFT: Chat Panel
# =============================================================================

with chat_col:
    st.subheader("💬 Gemini Chat")

    # ── Start / Reset session ─────────────────────────────────────────────────
    c1, c2 = st.columns([3, 1])
    with c1:
        session_id_input = st.text_input(
            "Session ID",
            value=st.session_state.get("gemini_session_id", "dev-gemini-001"),
            key="gemini_sid_input",
        )
    with c2:
        st.write("")
        st.write("")
        if st.button("🔄 New Session", key="gemini_new_session"):
            engine = get_gemini_engine()
            engine.new_session(session_id_input)
            greeting = engine.greeting()
            st.session_state.gemini_turns = [{
                "user":     None,
                "response": greeting,
                "state":    engine.diagnosis_summary,
                "extra":    {"phase": "greeting"},
                "elapsed_ms": 0,
            }]
            st.session_state.gemini_session_id = session_id_input
            st.session_state.gemini_session_started = True
            st.rerun()

    # ── Auto-start on first load ──────────────────────────────────────────────
    if not st.session_state.gemini_session_started and use_gemini:
        engine = get_gemini_engine()
        engine.new_session(session_id_input)
        greeting = engine.greeting()
        st.session_state.gemini_turns = [{
            "user":     None,
            "response": greeting,
            "state":    engine.diagnosis_summary,
            "extra":    {"phase": "greeting"},
            "elapsed_ms": 0,
        }]
        st.session_state.gemini_session_id = session_id_input
        st.session_state.gemini_session_started = True

    # ── Chat history ──────────────────────────────────────────────────────────
    chat_box = st.container(height=380, border=False)
    with chat_box:
        for turn in st.session_state.gemini_turns:
            if turn["user"]:
                with st.chat_message("user"):
                    st.write(turn["user"])
            with st.chat_message("assistant"):
                st.write(turn["response"])

    # ── Input ─────────────────────────────────────────────────────────────────
    user_input = st.chat_input("Share what's on your mind…", key="gemini_chat_input")

    if user_input and use_gemini:
        engine = get_gemini_engine()

        # Ensure session is started
        if not st.session_state.gemini_session_started:
            engine.new_session(st.session_state.get("gemini_session_id", "dev-gemini-001"))
            st.session_state.gemini_session_started = True

        t0 = time.perf_counter()
        try:
            response = engine.turn(user_input)
            elapsed  = round((time.perf_counter() - t0) * 1000)
            diag     = engine.diagnosis_summary

            turn_data = {
                "user":       user_input,
                "response":   response,
                "state":      diag,
                "extra":      {},   # debug extra not easily captured here — see debug panel
                "elapsed_ms": elapsed,
            }
            st.session_state.gemini_turns.append(turn_data)
            st.session_state.gemini_last_turn = turn_data
        except Exception as e:
            st.error(f"Gemini turn failed: {e}")
            st.code(traceback.format_exc())

        st.rerun()


# =============================================================================
# RIGHT: Debug Panel
# =============================================================================

with debug_col:
    tabs = st.tabs(["🔍 Current Turn", "📜 Turn History", "🗄️ MongoDB Sessions"])

    # ── Tab 1: Current Turn Debug ─────────────────────────────────────────────
    with tabs[0]:
        st.markdown("#### Last Turn Debug")

        if not st.session_state.gemini_turns:
            st.info("Start a conversation to see debug info.")
        else:
            last = st.session_state.gemini_turns[-1]
            state = last.get("state", {})

            # Phase + Energy Node
            phase = state.get("phase", "—")
            node  = state.get("energy_node", "—")
            sec   = state.get("secondary_node", "—")
            rsn   = state.get("node_reasoning", "—")

            st.markdown(
                f'<span class="phase-badge">Phase: {phase}</span>'
                + (f'<span class="energy-badge">Node: {node}</span>' if node and node != "—" else ""),
                unsafe_allow_html=True,
            )

            if node and node != "—":
                st.markdown(f"**Secondary node:** {sec}")
                st.markdown(f"**Reasoning:** _{rsn}_")

            # Metrics
            c1, c2, c3 = st.columns(3)
            c1.metric("Turn count",    state.get("turn_count", 0))
            c2.metric("Elapsed",       f"{last.get('elapsed_ms', 0)}ms")
            c3.metric("Session",       (state.get("session_id") or "")[-8:])

            # Commitment status
            intent = state.get("intent")
            if intent:
                st.markdown(f"**Commitment:** `{intent}`")

            # Solution phase step tracking
            engine = get_gemini_engine()
            if engine.state and engine.state.solution_active:
                st.divider()
                st.markdown("##### 🧘 Solution Phase")
                st.metric("Current step", engine.state.solution_step - 1)
                st.metric("RAG chunks",   len(engine.state.solution_rag_chunks))

                if engine.state.solution_steps_history:
                    st.markdown("**Steps so far:**")
                    for step in engine.state.solution_steps_history:
                        with st.expander(
                            f"{step.get('step_id', '?')} — {step.get('content', '')[:60]}...",
                            expanded=False,
                        ):
                            st.markdown(f"**Content:** {step.get('content', '')}")
                            st.markdown(f"**User reply:** {step.get('user_reply') or '_waiting_'}")
                            st.markdown(f"**Decision basis:** _{step.get('decision_basis', '')}_")
                            if step.get("conclusion_task"):
                                st.success(f"**Task:** {step['conclusion_task']}")
                            if step.get("motivation"):
                                st.info(f"**Closing:** {step['motivation']}")

                # RAG chunks used
                if engine.state.solution_rag_chunks:
                    st.markdown("**RAG chunks for solution:**")
                    for i, c in enumerate(engine.state.solution_rag_chunks[:4], 1):
                        with st.expander(
                            f"Chunk {i} — [{c.get('chunk_type','?').upper()}] score={c.get('score','?')}",
                            expanded=False,
                        ):
                            st.write(c.get("text", "")[:400])
                            st.caption(f"Source: {c.get('source_video', 'unknown')}")

            # Full state JSON
            with st.expander("📦 Full state JSON", expanded=False):
                st.json(state)

    # ── Tab 2: Turn History ───────────────────────────────────────────────────
    with tabs[1]:
        st.markdown("#### Turn History")
        turns = st.session_state.gemini_turns
        if not turns:
            st.info("No turns yet.")
        else:
            for i, turn in enumerate(reversed(turns), 1):
                turn_state = turn.get("state", {})
                label = (
                    f"Turn {len(turns) - i + 1}"
                    + (f": {turn['user'][:50]}" if turn.get("user") else ": [greeting]")
                )
                with st.expander(label, expanded=(i == 1)):
                    if turn.get("user"):
                        st.markdown(f"**User:** {turn['user']}")
                    st.markdown(f"**Souli:** {turn['response']}")
                    st.caption(
                        f"Phase: {turn_state.get('phase', '?')} | "
                        f"Node: {turn_state.get('energy_node', '?')} | "
                        f"Elapsed: {turn.get('elapsed_ms', 0)}ms"
                    )

    # ── Tab 3: MongoDB Session Inspector ──────────────────────────────────────
    with tabs[2]:
        st.markdown("#### Recent Gemini Sessions")
        st.caption("Pulled live from MongoDB Atlas — these are real benchmark sessions.")

        try:
            from souli_pipeline.storage import mongo_store
            sessions = mongo_store.list_recent_sessions(limit=10)

            if not sessions:
                st.info("No sessions in MongoDB yet. Start a conversation first.")
            else:
                for sess in sessions:
                    meta = sess.get("session_metadata", {})
                    sid  = meta.get("session_id", "?")
                    node = meta.get("energy_node_assigned", "—")
                    turns_count = meta.get("total_turns", 0)
                    commitment  = meta.get("commitment_status", "—")
                    updated     = sess.get("_last_updated", "?")[:19]  # trim microseconds

                    with st.expander(
                        f"`{sid[-20:]}` | {node} | {turns_count} turns | {updated}",
                        expanded=False,
                    ):
                        st.json(meta)

                        # Show full session JSON button
                        if st.button(f"Load full session JSON", key=f"load_{sid}"):
                            full = mongo_store.get_session(sid)
                            st.json(full)

                        # Show feedback if available
                        feedback = sess.get("user_feedback")
                        if feedback:
                            st.markdown("**User feedback:**")
                            st.json(feedback)

        except Exception as e:
=======
"""
pages/gemini_dev.py

Gemini dev page — accessible on the same Streamlit app (port 8502) as a new page.
Shows up in the sidebar as "🤖 Gemini Dev" alongside existing dev pages.

Features:
  - Toggle to switch between Gemini and Ollama engine (top of page)
  - Chat panel that uses GeminiEngine when toggled on
  - Per-turn debug panel showing:
      - Phase decision (from Gemini JSON)
      - Energy node + reasoning
      - RAG chunks used in solution phase
      - MongoDB storage status
      - Response latency
  - MongoDB session inspector (recent sessions)
  - Full session JSON viewer

This page adds zero changes to existing pages.
"""
from __future__ import annotations

import os
import time
import traceback
from typing import Any, Dict, Optional

import streamlit as st

# ── Page config ───────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Souli — Gemini Dev",
    page_icon="🤖",
    layout="wide",
)

# ── CSS (minimal, matches existing dev page style) ────────────────────────────
st.markdown("""
<style>
.phase-badge {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 700;
    background: #e0f2fe;
    color: #0369a1;
    margin-right: 4px;
}
.energy-badge {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 700;
    background: #fef3c7;
    color: #92400e;
}
.step-card {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 10px 14px;
    margin: 6px 0;
    font-size: 0.82rem;
}
.mongo-ok { color: #16a34a; font-weight: 700; }
.mongo-err { color: #dc2626; font-weight: 700; }
</style>
""", unsafe_allow_html=True)

# ── Engine loader ─────────────────────────────────────────────────────────────

@st.cache_resource
def _load_gemini_engine():
    """Load GeminiEngine once, cache for session."""
    try:
        from souli_pipeline.config_loader import load_config
        from souli_pipeline.conversation.gemini_engine import GeminiEngine

        cfg_path = (
            "configs/pipeline.gcp.yaml"
            if os.path.exists("configs/pipeline.gcp.yaml")
            else "configs/pipeline.yaml"
        )
        cfg = load_config(cfg_path)
        engine = GeminiEngine.from_config(cfg)
        return engine, None
    except Exception as e:
        return None, str(e)


def get_gemini_engine():
    engine, err = _load_gemini_engine()
    if err:
        st.error(f"Failed to load GeminiEngine: {err}")
        st.code(traceback.format_exc())
        st.stop()
    return engine


# =============================================================================
# Header + Engine Toggle
# =============================================================================

st.markdown("## 🤖 Gemini Dev Panel")
st.caption(
    "Parallel Gemini version of Souli — same conversation, different engine. "
    "Ollama engine on other dev pages is untouched."
)

# ── Engine toggle (top, matching the multi-RAG toggle position) ───────────────
col_toggle, col_info = st.columns([2, 5])
with col_toggle:
    use_gemini = st.toggle(
        "🤖 Use Gemini Engine",
        value=True,
        key="gemini_engine_toggle",
        help=(
            "ON  → Gemini Flash/Pro handles the conversation\n"
            "OFF → Shows this page but uses Ollama (for A/B comparison)"
        ),
    )
with col_info:
    if use_gemini:
        flash = os.environ.get("GEMINI_FLASH_MODEL", "gemini-2.5-flash-preview-05-20")
        pro   = os.environ.get("GEMINI_PRO_MODEL",   "gemini-2.5-pro-preview-05-06")
        key_set = bool(os.environ.get("GEMINI_API_KEY", "").strip())
        st.markdown(
            f"**Flash:** `{flash}`  &nbsp;&nbsp; **Pro:** `{pro}`  &nbsp;&nbsp; "
            f"**API Key:** {'✅ Set' if key_set else '❌ Not set — add GEMINI_API_KEY to .env'}"
        )
    else:
        st.info("Gemini toggle is OFF — turn it ON to use Gemini engine.")

# ── MongoDB status (top right) ────────────────────────────────────────────────
try:
    from souli_pipeline.storage import mongo_store
    mongo_ok = mongo_store.is_connected()
    mongo_label = "🟢 MongoDB connected" if mongo_ok else "🔴 MongoDB not connected"
    mongo_class = "mongo-ok" if mongo_ok else "mongo-err"
    st.markdown(
        f'<span class="{mongo_class}">{mongo_label}</span>',
        unsafe_allow_html=True,
    )
except Exception as e:
    st.markdown('<span class="mongo-err">🔴 MongoDB error</span>', unsafe_allow_html=True)

st.divider()

# =============================================================================
# Main layout: Chat (left) | Debug (right)
# =============================================================================

chat_col, debug_col = st.columns([3, 4], gap="large")

# ── Session init ──────────────────────────────────────────────────────────────
if "gemini_turns" not in st.session_state:
    st.session_state.gemini_turns = []

if "gemini_session_started" not in st.session_state:
    st.session_state.gemini_session_started = False


# =============================================================================
# LEFT: Chat Panel
# =============================================================================

with chat_col:
    st.subheader("💬 Gemini Chat")

    # ── Start / Reset session ─────────────────────────────────────────────────
    c1, c2 = st.columns([3, 1])
    with c1:
        session_id_input = st.text_input(
            "Session ID",
            value=st.session_state.get("gemini_session_id", "dev-gemini-001"),
            key="gemini_sid_input",
        )
    with c2:
        st.write("")
        st.write("")
        if st.button("🔄 New Session", key="gemini_new_session"):
            engine = get_gemini_engine()
            engine.new_session(session_id_input)
            greeting = engine.greeting()
            st.session_state.gemini_turns = [{
                "user":     None,
                "response": greeting,
                "state":    engine.diagnosis_summary,
                "extra":    {"phase": "greeting"},
                "elapsed_ms": 0,
            }]
            st.session_state.gemini_session_id = session_id_input
            st.session_state.gemini_session_started = True
            st.rerun()

    # ── Auto-start on first load ──────────────────────────────────────────────
    if not st.session_state.gemini_session_started and use_gemini:
        engine = get_gemini_engine()
        engine.new_session(session_id_input)
        greeting = engine.greeting()
        st.session_state.gemini_turns = [{
            "user":     None,
            "response": greeting,
            "state":    engine.diagnosis_summary,
            "extra":    {"phase": "greeting"},
            "elapsed_ms": 0,
        }]
        st.session_state.gemini_session_id = session_id_input
        st.session_state.gemini_session_started = True

    # ── Chat history ──────────────────────────────────────────────────────────
    chat_box = st.container(height=380, border=False)
    with chat_box:
        for turn in st.session_state.gemini_turns:
            if turn["user"]:
                with st.chat_message("user"):
                    st.write(turn["user"])
            with st.chat_message("assistant"):
                st.write(turn["response"])

    # ── Input ─────────────────────────────────────────────────────────────────
    user_input = st.chat_input("Share what's on your mind…", key="gemini_chat_input")

    if user_input and use_gemini:
        engine = get_gemini_engine()

        # Ensure session is started
        if not st.session_state.gemini_session_started:
            engine.new_session(st.session_state.get("gemini_session_id", "dev-gemini-001"))
            st.session_state.gemini_session_started = True

        t0 = time.perf_counter()
        try:
            response = engine.turn(user_input)
            elapsed  = round((time.perf_counter() - t0) * 1000)
            diag     = engine.diagnosis_summary

            turn_data = {
                "user":       user_input,
                "response":   response,
                "state":      diag,
                "extra":      {},   # debug extra not easily captured here — see debug panel
                "elapsed_ms": elapsed,
            }
            st.session_state.gemini_turns.append(turn_data)
            st.session_state.gemini_last_turn = turn_data
        except Exception as e:
            st.error(f"Gemini turn failed: {e}")
            st.code(traceback.format_exc())

        st.rerun()


# =============================================================================
# RIGHT: Debug Panel
# =============================================================================

with debug_col:
    tabs = st.tabs(["🔍 Current Turn", "📜 Turn History", "🗄️ MongoDB Sessions"])

    # ── Tab 1: Current Turn Debug ─────────────────────────────────────────────
    with tabs[0]:
        st.markdown("#### Last Turn Debug")

        if not st.session_state.gemini_turns:
            st.info("Start a conversation to see debug info.")
        else:
            last = st.session_state.gemini_turns[-1]
            state = last.get("state", {})

            # Phase + Energy Node
            phase = state.get("phase", "—")
            node  = state.get("energy_node", "—")
            sec   = state.get("secondary_node", "—")
            rsn   = state.get("node_reasoning", "—")

            st.markdown(
                f'<span class="phase-badge">Phase: {phase}</span>'
                + (f'<span class="energy-badge">Node: {node}</span>' if node and node != "—" else ""),
                unsafe_allow_html=True,
            )

            if node and node != "—":
                st.markdown(f"**Secondary node:** {sec}")
                st.markdown(f"**Reasoning:** _{rsn}_")

            # Metrics
            c1, c2, c3 = st.columns(3)
            c1.metric("Turn count",    state.get("turn_count", 0))
            c2.metric("Elapsed",       f"{last.get('elapsed_ms', 0)}ms")
            c3.metric("Session",       (state.get("session_id") or "")[-8:])

            # Commitment status
            intent = state.get("intent")
            if intent:
                st.markdown(f"**Commitment:** `{intent}`")

            # Solution phase step tracking
            engine = get_gemini_engine()
            if engine.state and engine.state.solution_active:
                st.divider()
                st.markdown("##### 🧘 Solution Phase")
                st.metric("Current step", engine.state.solution_step - 1)
                st.metric("RAG chunks",   len(engine.state.solution_rag_chunks))

                if engine.state.solution_steps_history:
                    st.markdown("**Steps so far:**")
                    for step in engine.state.solution_steps_history:
                        with st.expander(
                            f"{step.get('step_id', '?')} — {step.get('content', '')[:60]}...",
                            expanded=False,
                        ):
                            st.markdown(f"**Content:** {step.get('content', '')}")
                            st.markdown(f"**User reply:** {step.get('user_reply') or '_waiting_'}")
                            st.markdown(f"**Decision basis:** _{step.get('decision_basis', '')}_")
                            if step.get("conclusion_task"):
                                st.success(f"**Task:** {step['conclusion_task']}")
                            if step.get("motivation"):
                                st.info(f"**Closing:** {step['motivation']}")

                # RAG chunks used
                if engine.state.solution_rag_chunks:
                    st.markdown("**RAG chunks for solution:**")
                    for i, c in enumerate(engine.state.solution_rag_chunks[:4], 1):
                        with st.expander(
                            f"Chunk {i} — [{c.get('chunk_type','?').upper()}] score={c.get('score','?')}",
                            expanded=False,
                        ):
                            st.write(c.get("text", "")[:400])
                            st.caption(f"Source: {c.get('source_video', 'unknown')}")

            # Full state JSON
            with st.expander("📦 Full state JSON", expanded=False):
                st.json(state)

    # ── Tab 2: Turn History ───────────────────────────────────────────────────
    with tabs[1]:
        st.markdown("#### Turn History")
        turns = st.session_state.gemini_turns
        if not turns:
            st.info("No turns yet.")
        else:
            for i, turn in enumerate(reversed(turns), 1):
                turn_state = turn.get("state", {})
                label = (
                    f"Turn {len(turns) - i + 1}"
                    + (f": {turn['user'][:50]}" if turn.get("user") else ": [greeting]")
                )
                with st.expander(label, expanded=(i == 1)):
                    if turn.get("user"):
                        st.markdown(f"**User:** {turn['user']}")
                    st.markdown(f"**Souli:** {turn['response']}")
                    st.caption(
                        f"Phase: {turn_state.get('phase', '?')} | "
                        f"Node: {turn_state.get('energy_node', '?')} | "
                        f"Elapsed: {turn.get('elapsed_ms', 0)}ms"
                    )

    # ── Tab 3: MongoDB Session Inspector ──────────────────────────────────────
    with tabs[2]:
        st.markdown("#### Recent Gemini Sessions")
        st.caption("Pulled live from MongoDB Atlas — these are real benchmark sessions.")

        try:
            from souli_pipeline.storage import mongo_store
            sessions = mongo_store.list_recent_sessions(limit=10)

            if not sessions:
                st.info("No sessions in MongoDB yet. Start a conversation first.")
            else:
                for sess in sessions:
                    meta = sess.get("session_metadata", {})
                    sid  = meta.get("session_id", "?")
                    node = meta.get("energy_node_assigned", "—")
                    turns_count = meta.get("total_turns", 0)
                    commitment  = meta.get("commitment_status", "—")
                    updated     = sess.get("_last_updated", "?")[:19]  # trim microseconds

                    with st.expander(
                        f"`{sid[-20:]}` | {node} | {turns_count} turns | {updated}",
                        expanded=False,
                    ):
                        st.json(meta)

                        # Show full session JSON button
                        if st.button(f"Load full session JSON", key=f"load_{sid}"):
                            full = mongo_store.get_session(sid)
                            st.json(full)

                        # Show feedback if available
                        feedback = sess.get("user_feedback")
                        if feedback:
                            st.markdown("**User feedback:**")
                            st.json(feedback)

        except Exception as e:
>>>>>>> 8a1cf2387017bb70210464c72dc7d4c14c378a47
            st.error(f"MongoDB query failed: {e}")