"""
Souli Voice Agent — LiveKit-based real-time voice pipeline.

Flow:
    User speaks → STT (Whisper/Deepgram)
              → ConversationEngine (Ollama llama3.1 + Qdrant RAG)
              → TTS (Edge TTS / Piper)
              → Audio played back to user via LiveKit room

Fixes applied:
  [FIX-1] MP3 → PCM conversion before feeding to rtc.AudioFrame (was silent/noisy)
  [FIX-2] Audio source + track created ONCE and reused (was recreated per response)
  [FIX-3] silence_threshold reduced to 40 frames (~800ms) from 500 (~10s)
  [FIX-4] Full structured logging for every pipeline step (latency trackable)

Requirements:
    pip install livekit livekit-agents edge-tts faster-whisper pydub
    apt-get install -y ffmpeg   # needed by pydub for MP3 decoding

Usage:
    agent = SouliVoiceAgent(cfg, gold_path="outputs/.../gold.xlsx")
    agent.start()   # blocking — runs the LiveKit worker
"""
from __future__ import annotations

import asyncio
import io
import logging
import os
import time
from typing import Optional

logger = logging.getLogger(__name__)

# ── Module-level audio source so we publish ONE track and reuse it ──────────
_audio_source = None
_audio_track_published = False


# ---------------------------------------------------------------------------
# Helper: MP3 bytes → raw PCM bytes  [FIX-1]
# ---------------------------------------------------------------------------

def _mp3_to_pcm(audio_bytes: bytes, target_rate: int = 24000) -> bytes:
    """
    Decode MP3/WAV audio bytes → raw 16-bit signed PCM at target_rate, mono.

    Why this is needed:
        EdgeTTS returns MP3. LiveKit's AudioFrame expects raw PCM (sound samples).
        Feeding MP3 directly = silence or noise in the room.
    """
    try:
        from pydub import AudioSegment
    except ImportError:
        raise RuntimeError(
            "pydub is not installed. Run: pip install pydub\n"
            "Also ensure ffmpeg is installed: sudo apt-get install -y ffmpeg"
        )

    # Detect format from magic bytes
    if audio_bytes[:3] == b"ID3" or audio_bytes[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"):
        fmt = "mp3"
    elif audio_bytes[:4] == b"RIFF":
        fmt = "wav"
    else:
        fmt = "mp3"  # fallback

    seg = AudioSegment.from_file(io.BytesIO(audio_bytes), format=fmt)
    seg = seg.set_frame_rate(target_rate).set_channels(1).set_sample_width(2)  # 16-bit mono
    return seg.raw_data


# ---------------------------------------------------------------------------
# Publish audio — ONE track, reused across all turns  [FIX-2]
# ---------------------------------------------------------------------------

async def _publish_audio(room, audio_bytes: bytes):
    """
    Convert audio bytes to PCM and stream into the LiveKit room.

    Key design decisions:
    - AudioSource is created once at module level and reused
    - Track is published once per room connection, not per response
    - PCM conversion happens here, not in TTS
    """
    global _audio_source, _audio_track_published

    from livekit import rtc

    t0 = time.monotonic()

    try:
        pcm_bytes = _mp3_to_pcm(audio_bytes, target_rate=24000)
    except Exception as exc:
        logger.error("[AUDIO] PCM conversion failed: %s", exc)
        return

    logger.info(
        "[AUDIO] PCM ready — %d bytes (%.0f ms decode latency)",
        len(pcm_bytes),
        (time.monotonic() - t0) * 1000,
    )

    try:
        # Create source once per process
        if _audio_source is None:
            _audio_source = rtc.AudioSource(sample_rate=24000, num_channels=1)
            logger.info("[AUDIO] Created new AudioSource (24kHz mono)")

        # Publish track once per room
        if not _audio_track_published:
            track = rtc.LocalAudioTrack.create_audio_track("souli-voice", _audio_source)
            opts = rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE)
            await room.local_participant.publish_track(track, opts)
            _audio_track_published = True
            logger.info("[AUDIO] Track published to room: %s", room.name)

        # Send audio in chunks so streaming feels natural (not one big burst)
        CHUNK_SIZE = 2400 * 2  # 0.1 seconds of audio at 24kHz 16-bit
        total_chunks = (len(pcm_bytes) + CHUNK_SIZE - 1) // CHUNK_SIZE

        for i in range(0, len(pcm_bytes), CHUNK_SIZE):
            chunk = pcm_bytes[i : i + CHUNK_SIZE]
            samples = len(chunk) // 2  # 2 bytes per sample (16-bit)
            frame = rtc.AudioFrame(
                data=chunk,
                sample_rate=24000,
                num_channels=1,
                samples_per_channel=samples,
            )
            await _audio_source.capture_frame(frame)
            # Small yield so event loop stays responsive
            await asyncio.sleep(0)

        logger.info(
            "[AUDIO] Streamed %d chunks (%.0f ms total publish latency)",
            total_chunks,
            (time.monotonic() - t0) * 1000,
        )

    except Exception as exc:
        logger.error("[AUDIO] Publish failed: %s", exc, exc_info=True)


# ---------------------------------------------------------------------------
# Audio track handler — VAD + STT + LLM + TTS loop
# ---------------------------------------------------------------------------

async def _handle_audio_track(track, engine, stt, tts, room):
    """
    Continuously read audio frames from a LiveKit participant track.

    Pipeline per utterance:
        1. Collect PCM frames while voice is active (simple RMS-based VAD)
        2. On silence → transcribe with Whisper
        3. Feed transcript to ConversationEngine
        4. Synthesize TTS response
        5. Publish PCM back to LiveKit room

    Timing is logged at every step so you can trace latency in logs.
    """
    from livekit import rtc

    audio_buffer = bytearray()
    sample_rate = 16000

    # [FIX-3] Was 500 (~10s of silence). 40 frames ≈ 800ms — natural pause
    SILENCE_THRESHOLD = 40
    RMS_VOICE_THRESHOLD = 300  # tune up if mic is noisy, down if too quiet

    silence_count = 0
    is_speaking = False
    turn_count = 0

    logger.info("[VAD] Listening for audio on track: %s", track.sid if hasattr(track, "sid") else "unknown")

    async for frame_event in track:
        if not isinstance(frame_event, rtc.AudioFrame):
            continue

        frame: rtc.AudioFrame = frame_event
        pcm_data = bytes(frame.data)
        audio_buffer.extend(pcm_data)

        # ── Voice Activity Detection (RMS energy) ──────────────────────────
        import struct
        try:
            samples = struct.unpack(f"{len(pcm_data) // 2}h", pcm_data)
            rms = (sum(s * s for s in samples) / max(1, len(samples))) ** 0.5
        except struct.error:
            continue

        if rms > RMS_VOICE_THRESHOLD:
            if not is_speaking:
                logger.debug("[VAD] Voice started (RMS=%.0f)", rms)
            is_speaking = True
            silence_count = 0

        elif is_speaking:
            silence_count += 1

            if silence_count >= SILENCE_THRESHOLD:
                # ── End of utterance — run full pipeline ───────────────────
                turn_count += 1
                utterance_bytes = bytes(audio_buffer)
                audio_buffer.clear()
                is_speaking = False
                silence_count = 0

                logger.info(
                    "[TURN %d] Utterance captured — %d bytes (%.1f sec audio)",
                    turn_count,
                    len(utterance_bytes),
                    len(utterance_bytes) / (sample_rate * 2),
                )

                # Step 1: STT
                t_stt = time.monotonic()
                try:
                    user_text = stt.transcribe_bytes(utterance_bytes, sample_rate=sample_rate)
                except Exception as exc:
                    logger.error("[TURN %d] STT failed: %s", turn_count, exc)
                    continue

                stt_ms = (time.monotonic() - t_stt) * 1000
                logger.info("[TURN %d] STT done (%.0f ms) → '%s'", turn_count, stt_ms, user_text)

                if not user_text.strip():
                    logger.info("[TURN %d] Empty transcript — skipping", turn_count)
                    continue

                # Step 2: LLM
                t_llm = time.monotonic()
                try:
                    response = engine.turn(user_text)
                except Exception as exc:
                    logger.error("[TURN %d] LLM failed: %s", turn_count, exc)
                    continue

                llm_ms = (time.monotonic() - t_llm) * 1000
                logger.info("[TURN %d] LLM done (%.0f ms) → '%s'", turn_count, llm_ms, response[:80])

                # Step 3: TTS
                # Use synthesize_async directly — synthesize() calls asyncio.run()
                # which crashes inside LiveKit's already-running event loop
                t_tts = time.monotonic()
                try:
                    audio_bytes = await tts.synthesize_async(response)
                except Exception as exc:
                    logger.error("[TURN %d] TTS failed: %s", turn_count, exc)
                    continue

                tts_ms = (time.monotonic() - t_tts) * 1000
                logger.info(
                    "[TURN %d] TTS done (%.0f ms) — %d bytes",
                    turn_count, tts_ms, len(audio_bytes),
                )

                # Step 4: Publish to room
                await _publish_audio(room, audio_bytes)

                total_ms = (stt_ms + llm_ms + tts_ms)
                logger.info(
                    "[TURN %d] ✓ Complete — STT %.0fms | LLM %.0fms | TTS %.0fms | Total %.0fms",
                    turn_count, stt_ms, llm_ms, tts_ms, total_ms,
                )


# ---------------------------------------------------------------------------
# Local audio playback (for run_local_voice only)
# ---------------------------------------------------------------------------

def _play_audio_bytes(audio_bytes: bytes):
    """Play audio bytes using system player (for local test mode only)."""
    import subprocess
    import tempfile

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        if os.path.exists("/usr/bin/afplay"):
            subprocess.run(["afplay", tmp_path], check=False)
        else:
            subprocess.run(["mpg123", "-q", tmp_path], check=False)
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


# ---------------------------------------------------------------------------
# Main Agent Class
# ---------------------------------------------------------------------------

class SouliVoiceAgent:
    """
    LiveKit voice agent for Souli.
    Connects to a LiveKit room and handles real-time voice conversation.
    """

    def __init__(
        self,
        cfg,
        gold_path: Optional[str] = None,
        excel_path: Optional[str] = None,
    ):
        self.cfg = cfg
        self.gold_path = gold_path
        self.excel_path = excel_path
        self._engine = None
        self._stt = None
        self._tts = None

    def _get_engine(self):
        if self._engine is None:
            from ..conversation.engine import ConversationEngine
            self._engine = ConversationEngine.from_config(
                self.cfg,
                gold_path=self.gold_path,
                excel_path=self.excel_path,
            )
        return self._engine

    def _get_stt(self):
        if self._stt is None:
            from .stt import make_stt
            v = self.cfg.voice
            self._stt = make_stt(provider=v.stt_provider, whisper_model=v.whisper_model)
        return self._stt

    def _get_tts(self):
        if self._tts is None:
            from .tts import make_tts
            v = self.cfg.voice
            self._tts = make_tts(provider=v.tts_provider, voice=v.tts_voice)
        return self._tts

    # ------------------------------------------------------------------
    # LiveKit agent entry point
    # ------------------------------------------------------------------

    def start(self):
        """
        Synchronous entry point. Connects to LiveKit room and starts the voice loop.
        Requires livekit-agents >= 0.8
        """
        import sys

        try:
            from livekit.agents import WorkerOptions, cli, AutoSubscribe, JobContext
            from livekit import rtc
        except ImportError:
            logger.error(
                "livekit-agents not installed. "
                "Run: pip install livekit livekit-agents"
            )
            raise

        v = self.cfg.voice

        agent_self = self  # capture for closure

        async def entrypoint(ctx: JobContext):
            global _audio_track_published
            _audio_track_published = False  # reset per room connection

            logger.info("[AGENT] Joined room: %s", ctx.room.name)

            engine = agent_self._get_engine()
            stt = agent_self._get_stt()
            tts = agent_self._get_tts()

            # Connect and subscribe to audio
            await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

            # Greet the user
            greeting = engine.greeting()
            logger.info("[AGENT] Greeting: %s", greeting)
            greeting_audio = await tts.synthesize_async(greeting)
            await _publish_audio(ctx.room, greeting_audio)

            # Subscribe to incoming audio tracks
            @ctx.room.on("track_subscribed")
            def on_track(track, publication, participant):
                from livekit import rtc as _rtc
                if track.kind == _rtc.TrackKind.KIND_AUDIO:
                    logger.info(
                        "[AGENT] Subscribed to audio from participant: %s",
                        participant.identity,
                    )
                    asyncio.ensure_future(
                        _handle_audio_track(track, engine, stt, tts, ctx.room)
                    )

        worker_opts = WorkerOptions(
            entrypoint_fnc=entrypoint,
            api_key=v.livekit_api_key,
            api_secret=v.livekit_api_secret,
            ws_url=v.livekit_url,
        )

        old_argv = sys.argv[:]
        sys.argv = [sys.argv[0], "start"]
        try:
            cli.run_app(worker_opts)
        finally:
            sys.argv = old_argv

    async def run(self):
        """Async wrapper kept for backwards compatibility."""
        self.start()

    # ------------------------------------------------------------------
    # Local test mode (no LiveKit server needed)
    # ------------------------------------------------------------------

    async def run_local_voice(self):
        """
        Local test mode: uses microphone input via sounddevice + plays back audio.
        No LiveKit server needed.
        """
        try:
            import sounddevice as sd
        except ImportError:
            logger.error("sounddevice not installed. Run: pip install sounddevice")
            raise

        engine = self._get_engine()
        stt = self._get_stt()
        tts = self._get_tts()

        print("\n🎙️  Souli Voice (local mode). Press Ctrl+C to stop.\n")
        greeting = engine.greeting()
        print(f"Souli: {greeting}\n")
        audio_bytes = tts.synthesize(greeting)
        _play_audio_bytes(audio_bytes)

        while True:
            print("Listening... (speak now, 5 seconds)")
            sample_rate = 16000
            duration = 5
            recording = sd.rec(
                int(duration * sample_rate),
                samplerate=sample_rate,
                channels=1,
                dtype="int16",
            )
            sd.wait()
            audio_bytes_raw = recording.tobytes()

            user_text = stt.transcribe_bytes(audio_bytes_raw, sample_rate=sample_rate)
            if not user_text.strip():
                print("(No speech detected, try again)\n")
                continue

            print(f"You: {user_text}")
            response = engine.turn(user_text)
            print(f"Souli: {response}\n")
            audio_bytes = tts.synthesize(response)
            _play_audio_bytes(audio_bytes)