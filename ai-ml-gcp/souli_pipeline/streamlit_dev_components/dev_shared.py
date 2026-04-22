"""
streamlit_dev_components/dev_shared.py

Shared helpers used by ALL components:
  - PATH / CONFIG constants
  - Session state init
  - get_engine()
  - _active_collection(), _kb_label(), _reset_all()
  - CSS injection
  - Phase / node label maps
"""
from __future__ import annotations
from dotenv import load_dotenv
load_dotenv()
import os
import sys
from pathlib import Path
from typing import Any, Dict, Optional

import streamlit as st

# ── PATH FIX ─────────────────────────────────────────────────────────────────
_this_dir    = Path(__file__).resolve().parent          # streamlit_dev_components/
_project_root = _this_dir.parent.parent                 # project root (parent of souli_pipeline/)
if str(_project_root) not in sys.path:
    sys.path.insert(0, str(_project_root))

# ── Config paths (read from env or default) ───────────────────────────────────
CONFIG_PATH = os.environ.get("SOULI_CONFIG_PATH", "configs/pipeline.yaml")


def _find_latest_gold() -> str | None:
    outputs_dir = "outputs"
    if not os.path.exists(outputs_dir):
        return None
    for run_id in sorted(os.listdir(outputs_dir), reverse=True):
        gp = os.path.join(outputs_dir, run_id, "energy", "gold.xlsx")
        if os.path.exists(gp):
            return gp
    return None

GOLD_PATH  = os.environ.get("SOULI_GOLD_PATH") or _find_latest_gold()

_default_excel = str(_project_root / "data" / "Souli_EnergyFramework_PW (1).xlsx")
EXCEL_PATH = os.environ.get(
    "SOULI_EXCEL_PATH",
    _default_excel if os.path.exists(_default_excel) else None,
)

os.environ.setdefault("QDRANT_HOST", "localhost")

# ── Phase / Node label maps ───────────────────────────────────────────────────
PHASE_LABELS: Dict[str, str] = {
    "greeting":     "Greeting",
    "intake":       "Intake",
    "sharing":      "Sharing",
    "summary":      "Summary Check",
    "deepening":    "Deepening",
    "intent_check": "Intent Check",
    "venting":      "Venting",
    "solution":     "Solution",
}

NODE_COLORS: Dict[str, str] = {
    "blocked_energy":      "#ef4444",
    "depleted_energy":     "#f97316",
    "scattered_energy":    "#eab308",
    "outofcontrol_energy": "#a855f7",
    "normal_energy":       "#22c55e",
}

# chunk_type → badge colour (used in RAG panel)
CTYPE_COLORS: Dict[str, str] = {
    "healing":    "#6ee7b7",
    "activities": "#7dd3fc",
    "stories":    "#fdba74",
    "commitment": "#c4b5fd",
    "patterns":   "#fca5a5",
    "general":    "#94a3b8",
    "teaching":   "#94a3b8",
}

# ── Cached config loader ──────────────────────────────────────────────────────
@st.cache_resource(show_spinner="Loading config...")
def _load_config():
    from souli_pipeline.config_loader import load_config
    return load_config(CONFIG_PATH)


# ── KB helpers ────────────────────────────────────────────────────────────────
def _active_collection() -> str:
    return "souli_chunks_improved"

def _kb_label() -> str:
    return (
        "🚀 Improved Pipeline  (souli_chunks_improved)"
        if st.session_state.get("kb_mode", "improved") == "improved"
        else "📦 Original Pipeline  (souli_chunks)"
    )

def _reset_all():
    """Wipe both engine instances + message history."""
    for key in ("engine_original", "engine_improved", "messages", "voice_messages"):
        st.session_state.pop(key, None)


# ── Engine factory ────────────────────────────────────────────────────────────
def get_engine():
    """Return the ConversationEngine for the current KB mode.
    One engine per mode, each with its own conversation history.
    """
    key = f"engine_{st.session_state.get('kb_mode', 'improved')}"
    if key not in st.session_state:
        from souli_pipeline.conversation.engine import ConversationEngine
        cfg = _load_config()
        engine = ConversationEngine.from_config(cfg, gold_path=GOLD_PATH, excel_path=EXCEL_PATH)
        engine.qdrant_collection = _active_collection()

        # Multi-collection flag — read from config, default True
        engine.use_multi_collections = getattr(
            cfg.conversation, "use_multi_collections", True
        )

        # Debug storage (engine.py may not define these yet)
        if not hasattr(engine, "_debug_events"):
            engine._debug_events = []
        if not hasattr(engine, "latest_debug"):
            engine.latest_debug = None

        st.session_state[key] = engine
    return st.session_state[key]


# ── Session init ──────────────────────────────────────────────────────────────
def init_session():
    st.session_state.setdefault("kb_mode", "improved")
    st.session_state.setdefault("multi_rag_enabled", True)
    engine = get_engine()
    if "messages" not in st.session_state:
        greeting = engine.greeting()
        st.session_state.messages = [{"role": "assistant", "content": greeting}]

def _messages():
    return st.session_state.setdefault("messages", [])


# ── CSS ───────────────────────────────────────────────────────────────────────
DEV_CSS = """
<style>
/* badges */
.badge {
    display:inline-block; padding:3px 10px; border-radius:12px;
    font-size:0.76rem; font-weight:600; margin:2px;
}
.badge-phase { background:#dbeafe; color:#1d4ed8; }
.badge-warn  { background:#fef3c7; color:#92400e; }
.badge-node  { background:#dcfce7; color:#166534; }
.badge-red   { background:#fee2e2; color:#991b1b; }

/* info boxes */
.info-box {
    background:#f8fafc; border:1px solid #e2e8f0;
    border-radius:8px; padding:10px 14px;
    margin:6px 0; font-size:0.8rem; color:#334155;
}
.mono { font-family:'JetBrains Mono','Fira Code',monospace; font-size:0.74rem; color:#2563eb; }

/* RAG cards */
.rag-card {
    background:#0f172a; border:1px solid #1e293b;
    border-radius:8px; padding:10px 12px; margin:6px 0;
}
.rag-node   { color:#7dd3fc; font-size:0.72rem; font-weight:700; margin-right:6px; }
.rag-score  { font-size:0.72rem; font-weight:700; }
.rag-source { color:#64748b; font-size:0.7rem; margin-left:8px; }
.rag-text   { color:#cbd5e1; font-size:0.8rem; margin-top:6px; line-height:1.5; }

/* debug section headers */
.dbg-section-header {
    font-size:0.68rem; font-weight:700; letter-spacing:1.2px;
    text-transform:uppercase; color:#94a3b8 !important;
    margin:16px 0 5px 0; padding-bottom:4px;
    border-bottom:1px solid #e2e8f0;
}
.dbg-divider { border:none; border-top:1px solid #e2e8f0; margin:12px 0; }
</style>
"""

def inject_css():
    st.markdown(DEV_CSS, unsafe_allow_html=True)