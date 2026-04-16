# #!/usr/bin/env python3
# """
# Standalone LiveKit worker entry point for Souli.

# This script is launched as a subprocess by `souli voice` so that
# livekit-agents can properly spawn/manage worker processes without
# conflicting with the souli CLI entrypoint.

# Usage (invoked automatically by cli.py voice_cmd):
#     python -m souli_pipeline.voice.run_worker start
# """
# from __future__ import annotations
# import asyncio
# import logging
# import os
# import sys

# logger = logging.getLogger(__name__)


# def _load_agent():
#     config_path = os.environ.get("SOULI_CONFIG_PATH") or os.environ.get(
#         "SOULI_CONFIG", "configs/pipeline.gcp.yaml"
#     )
#     gold_path = os.environ.get("SOULI_GOLD_PATH")
#     excel_path = os.environ.get("SOULI_EXCEL_PATH")

#     from souli_pipeline.config_loader import load_config
#     from souli_pipeline.voice.livekit_agent import SouliVoiceAgent

#     cfg = load_config(config_path)
#     return SouliVoiceAgent(cfg, gold_path=gold_path, excel_path=excel_path)


# async def entrypoint(ctx):
#     from livekit.agents import AutoSubscribe
#     from livekit import rtc
#     from souli_pipeline.voice.livekit_agent import _handle_audio_track, _publish_audio

#     agent = _load_agent()
#     engine = agent._get_engine()
#     stt = agent._get_stt()
#     tts = agent._get_tts()

#     await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

#     greeting = engine.greeting()
#     logger.info("Greeting: %s", greeting)
#     audio_bytes = tts.synthesize(greeting)
#     await _publish_audio(ctx.room, audio_bytes)

#     @ctx.room.on("track_subscribed")
#     def on_track(track, publication, participant):
#         if track.kind == rtc.TrackKind.KIND_AUDIO:
#             asyncio.ensure_future(
#                 _handle_audio_track(track, engine, stt, tts, ctx.room)
#             )


# if __name__ == "__main__":
#     from livekit.agents import WorkerOptions, cli
#     from souli_pipeline.config_loader import load_config

#     config_path = os.environ.get("SOULI_CONFIG_PATH") or os.environ.get(
#         "SOULI_CONFIG", "configs/pipeline.gcp.yaml"
#     )
#     cfg = load_config(config_path)
#     v = cfg.voice

#     cli.run_app(
#         WorkerOptions(
#             entrypoint_fnc=entrypoint,
#             api_key=v.livekit_api_key or os.environ.get("LIVEKIT_API_KEY", ""),
#             api_secret=v.livekit_api_secret or os.environ.get("LIVEKIT_API_SECRET", ""),
#             ws_url=v.livekit_url or os.environ.get("LIVEKIT_URL", ""),
#         )
#     )



#!/usr/bin/env python3
"""
Standalone LiveKit worker entry point for Souli.

This script is launched as a subprocess by `souli voice` so that
livekit-agents can properly spawn/manage worker processes without
conflicting with the souli CLI entrypoint.

Usage (invoked automatically by cli.py voice_cmd):
    python -m souli_pipeline.voice.run_worker start

Or directly:
    SOULI_CONFIG_PATH=configs/pipeline.aws.yaml python -m souli_pipeline.voice.run_worker start
"""
from __future__ import annotations
import asyncio
import logging
import os
import sys

logger = logging.getLogger(__name__)


def _load_agent():
    config_path = os.environ.get("SOULI_CONFIG_PATH") or os.environ.get(
        "SOULI_CONFIG", "configs/pipeline.aws.yaml"
    )
    gold_path = os.environ.get("SOULI_GOLD_PATH")
    excel_path = os.environ.get("SOULI_EXCEL_PATH")

    logger.info("[WORKER] Loading config from: %s", config_path)

    from souli_pipeline.config_loader import load_config
    from souli_pipeline.voice.livekit_agent import SouliVoiceAgent

    cfg = load_config(config_path)
    return SouliVoiceAgent(cfg, gold_path=gold_path, excel_path=excel_path)


async def entrypoint(ctx):
    import souli_pipeline.voice.livekit_agent as _agent_module
    from livekit.agents import AutoSubscribe
    from livekit import rtc
    from souli_pipeline.voice.livekit_agent import _handle_audio_track, _publish_audio

    # Reset track state for this room connection [FIX-2 complement]
    _agent_module._audio_source = None
    _agent_module._audio_track_published = False

    agent = _load_agent()
    engine = agent._get_engine()
    stt = agent._get_stt()
    tts = agent._get_tts()

    logger.info("[WORKER] Connecting to room: %s", ctx.room.name)
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    greeting = engine.greeting()
    logger.info("[WORKER] Greeting: %s", greeting)

    # ── KEY FIX: await the async version directly ──────────────────────────
    # tts.synthesize() calls asyncio.run() internally — that crashes inside
    # LiveKit's event loop. synthesize_async() is the coroutine we can await.
    audio_bytes = await tts.synthesize_async(greeting)

    await _publish_audio(ctx.room, audio_bytes)

    @ctx.room.on("track_subscribed")
    def on_track(track, publication, participant):
        if track.kind == rtc.TrackKind.KIND_AUDIO:
            logger.info(
                "[WORKER] Audio track from participant: %s",
                participant.identity,
            )
            asyncio.ensure_future(
                _handle_audio_track(track, engine, stt, tts, ctx.room)
            )


if __name__ == "__main__":
    # Set up logging so you see all pipeline steps in terminal
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
        datefmt="%H:%M:%S",
    )

    from livekit.agents import WorkerOptions, cli
    from souli_pipeline.config_loader import load_config

    config_path = os.environ.get("SOULI_CONFIG_PATH") or os.environ.get(
        "SOULI_CONFIG", "configs/pipeline.aws.yaml"
    )
    cfg = load_config(config_path)
    v = cfg.voice

    livekit_url = v.livekit_url or os.environ.get("LIVEKIT_URL", "")
    livekit_key = v.livekit_api_key or os.environ.get("LIVEKIT_API_KEY", "")
    livekit_secret = v.livekit_api_secret or os.environ.get("LIVEKIT_API_SECRET", "")

    logger.info("[WORKER] LiveKit URL: %s", livekit_url)
    logger.info("[WORKER] API Key:     %s", livekit_key[:6] + "..." if livekit_key else "NOT SET")

    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            api_key=livekit_key,
            api_secret=livekit_secret,
            ws_url=livekit_url,
        )
    )