"""
souli_pipeline/voice/livekit_agent.py  — v2 (Gemini + Deepgram + LiveKit)

Flow:
    User speaks into phone/browser
        → LiveKit streams audio to this agent
        → Deepgram transcribes speech to text (prerecorded per utterance)
        → GeminiEngine generates Souli's response
        → Edge TTS synthesizes response to MP3
        → MP3 decoded to PCM (16-bit, mono, 24kHz)
        → PCM published back to LiveKit room
        → User hears Souli's voice

Key fixes over v1:
    ✅ GeminiEngine replaces Ollama ConversationEngine
    ✅ Deepgram replaces local Whisper (faster, no heavy install)
    ✅ MP3 → PCM conversion before feeding to LiveKit (v1 fed raw MP3 = silence)
    ✅ Proper AudioSource reuse (v1 created a new track per response = chaos)
    ✅ Simple VAD (voice activity detection) — silence threshold triggers transcription
    ✅ Works locally and on AWS EC2 with same code

Requirements:
    pip install livekit livekit-agents edge-tts deepgram-sdk==3.7.0 pydub

Usage (local test):
    python -m souli_pipeline.voice.livekit_agent

Usage (production worker on EC2):
    python -m souli_pipeline.voice.run_worker start
"""
from __future__ import annotations

import asyncio
import logging
import os
import struct
import tempfile
from typing import Optional

logger = logging.getLogger(__name__)

# ── Sample rate constants ─────────────────────────────────────────────────────
LIVEKIT_SAMPLE_RATE  = 48000   # LiveKit default incoming audio
TTS_SAMPLE_RATE      = 24000   # Edge TTS output rate
CHANNELS             = 1       # mono

# ── VAD settings ──────────────────────────────────────────────────────────────
RMS_THRESHOLD        = 300     # RMS level above this = user is speaking
SILENCE_FRAMES_END   = 80      # ~1.6 seconds of silence → end of utterance
MIN_SPEECH_FRAMES    = 20      # ignore very short sounds (< ~400ms)


# =============================================================================
# SouliVoiceAgent
# =============================================================================

class SouliVoiceAgent:
    """
    LiveKit voice agent for Souli — Gemini edition.

    One agent instance handles one room. The agent:
      1. Connects to the LiveKit room
      2. Sends a greeting (TTS → PCM → LiveKit)
      3. Listens for user audio tracks
      4. For each utterance: Deepgram STT → GeminiEngine → Edge TTS → LiveKit
    """

    def __init__(self, session_id: Optional[str] = None):
        self.session_id  = session_id or f"voice_{os.urandom(4).hex()}"
        self._engine     = None
        self._audio_source = None    # reused across all responses
        self._speaking     = False

    # ── Engine (GeminiEngine — lazy init) ────────────────────────────────────

    def _get_engine(self):
        if self._engine is None:
            from souli_pipeline.conversation.gemini_engine import GeminiEngine
            self._engine = GeminiEngine()
            self._engine.new_session(self.session_id)
            logger.info("[Voice] GeminiEngine ready — session: %s", self.session_id)
        return self._engine

    # ── Entry point ───────────────────────────────────────────────────────────

    def start(self):
        """
        Synchronous entry point — called by run_worker.py.
        Starts the LiveKit worker process.
        """
        from livekit.agents import WorkerOptions, cli

        livekit_url    = os.environ.get("LIVEKIT_URL", "")
        livekit_key    = os.environ.get("LIVEKIT_API_KEY", "")
        livekit_secret = os.environ.get("LIVEKIT_API_SECRET", "")

        if not all([livekit_url, livekit_key, livekit_secret]):
            raise RuntimeError(
                "Missing LiveKit credentials. Set LIVEKIT_URL, "
                "LIVEKIT_API_KEY, LIVEKIT_API_SECRET in .env"
            )

        import sys
        old_argv = sys.argv[:]
        sys.argv = [sys.argv[0], "start"]
        try:
            cli.run_app(WorkerOptions(entrypoint_fnc=self._entrypoint))
        finally:
            sys.argv = old_argv

    # ── LiveKit entrypoint (called per room join) ─────────────────────────────

    async def _entrypoint(self, ctx):
        from livekit.agents import AutoSubscribe
        from livekit import rtc

        logger.info("[Voice] Agent joined room: %s", ctx.room.name)

        # ── Set up track listener BEFORE connecting ────────────────────────────
        # This ensures we don't miss tracks that are already in the room
        @ctx.room.on("track_subscribed")
        def on_track(track, publication, participant):
            if track.kind == rtc.TrackKind.KIND_AUDIO:
                logger.info("[Voice] Audio track from: %s", participant.identity)
                engine = self._get_engine()
                asyncio.ensure_future(
                    self._handle_audio_track(track, engine)
                )

        # ── NOW connect ────────────────────────────────────────────────────────
        await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

        # ── Create audio source for Souli's voice ─────────────────────────────
        self._audio_source = rtc.AudioSource(
            sample_rate=TTS_SAMPLE_RATE,
            num_channels=CHANNELS,
        )
        track = rtc.LocalAudioTrack.create_audio_track("souli-voice", self._audio_source)
        opts  = rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE)
        await ctx.room.local_participant.publish_track(track, opts)
        logger.info("[Voice] Audio track published")

        # ── Also check for already-subscribed tracks ───────────────────────────
        # for participant in ctx.room.remote_participants.values():
        #     for track_pub in participant.track_publications.values():
        #         if track_pub.track and track_pub.track.kind == rtc.TrackKind.KIND_AUDIO:
        #             logger.info("[Voice] Found existing audio track from: %s", participant.identity)
        #             engine = self._get_engine()
        #             asyncio.ensure_future(
        #                 self._handle_audio_track(track_pub.track, engine)
        #             )

        # ── Send greeting ──────────────────────────────────────────────────────
        engine   = self._get_engine()
        greeting = engine.greeting()
        logger.info("[Voice] Greeting: %s", greeting[:80])
        await self._speak(greeting)

        # Keep agent alive
        await asyncio.sleep(3600)
    # ── Audio track handler (VAD + STT + LLM + TTS loop) ─────────────────────

    
    
    async def _handle_audio_track(self, track, engine):
        """
        Reads audio frames from a LiveKit track via AudioStream.
        Uses simple energy-based VAD to detect utterances.
        """
        from livekit import rtc

        # In livekit-agents 1.x, you must wrap the track in AudioStream
        audio_stream = rtc.AudioStream(track, sample_rate=LIVEKIT_SAMPLE_RATE, num_channels=CHANNELS)

        audio_buffer  = bytearray()
        silence_count = 0
        speech_count  = 0
        is_speaking   = False

        logger.info("[Voice] Listening for speech...")

        async for frame_event in audio_stream:
            if not hasattr(frame_event, 'frame'):
                continue

            frame    = frame_event.frame
            pcm_data = bytes(frame.data)
            audio_buffer.extend(pcm_data)

            # ── Simple VAD ────────────────────────────────────────────────────
            rms = _compute_rms(pcm_data)

            if rms > RMS_THRESHOLD:
                if not is_speaking:
                    logger.debug("[Voice] Speech started (RMS=%.0f)", rms)
                    if self._speaking:
                        self._speaking = False
                        logger.info("[Voice] User interrupted — stopping Souli")
                is_speaking   = True
                silence_count = 0
                speech_count += 1
            else:
                if is_speaking:
                    silence_count += 1
                    if silence_count >= SILENCE_FRAMES_END:
                        if speech_count >= MIN_SPEECH_FRAMES:
                            logger.info(
                                "[Voice] Utterance ended — %d speech frames",
                                speech_count,
                            )
                            utterance_audio = bytes(audio_buffer)
                            asyncio.ensure_future(
                                self._process_utterance(utterance_audio, engine)
                            )
                        else:
                            logger.debug("[Voice] Too short — ignored")

                        audio_buffer  = bytearray()
                        is_speaking   = False
                        silence_count = 0
                        speech_count  = 0
    # ── Process one utterance: STT → LLM → TTS → publish ─────────────────────

    async def _process_utterance(self, audio_bytes: bytes, engine):
        """
        Full pipeline for one user utterance:
        1. Deepgram STT → transcript
        2. GeminiEngine → response text
        3. Edge TTS → MP3
        4. MP3 → PCM → LiveKit
        """
        # Step 1: STT
        transcript = await asyncio.get_event_loop().run_in_executor(
            None, _transcribe_deepgram, audio_bytes, LIVEKIT_SAMPLE_RATE
        )
        if not transcript or not transcript.strip():
            logger.debug("[Voice] Empty transcript — skipping")
            return

        logger.info("[Voice] User said: %s", transcript)

        # Step 2: Gemini response
        try:
            response = await asyncio.get_event_loop().run_in_executor(
                None, engine.turn, transcript
            )
        except Exception as exc:
            logger.error("[Voice] GeminiEngine error: %s", exc)
            response = "I'm here with you. Give me a moment."

        logger.info("[Voice] Souli: %s", response[:80])

        # Step 3 + 4: TTS → speak
        await self._speak(response)

    # ── TTS → PCM → LiveKit ───────────────────────────────────────────────────

    async def _speak(self, text: str):
        """
        Convert text to speech and publish to LiveKit room.
        Edge TTS → MP3 bytes → decode to PCM → feed to AudioSource.
        """
        if not self._audio_source:
            logger.warning("[Voice] No audio source — cannot speak")
            return

        if self._speaking:
            logger.debug("[Voice] Already speaking — skipping duplicate response")
            return

        self._speaking = True
        try:
            # TTS: text → MP3 bytes
            mp3_bytes = await _tts_synthesize(text)

            # Decode MP3 → PCM (this was the bug in v1 — it fed raw MP3 to LiveKit)
            pcm_bytes = _mp3_to_pcm(mp3_bytes, target_sample_rate=TTS_SAMPLE_RATE)

            # Feed PCM to LiveKit audio source
            await _publish_pcm(self._audio_source, pcm_bytes, TTS_SAMPLE_RATE)

            logger.info("[Voice] Spoke %d chars → %d PCM bytes", len(text), len(pcm_bytes))

        except Exception as exc:
            logger.error("[Voice] TTS/publish error: %s", exc)
        finally:
            self._speaking = False


# =============================================================================
# Helper functions
# =============================================================================

def _compute_rms(pcm_data: bytes) -> float:
    """Compute RMS energy of a PCM audio frame (16-bit mono)."""
    if len(pcm_data) < 2:
        return 0.0
    n       = len(pcm_data) // 2
    samples = struct.unpack(f"{n}h", pcm_data[:n * 2])
    rms     = (sum(s * s for s in samples) / max(1, n)) ** 0.5
    return rms

def _transcribe_deepgram(audio_bytes: bytes, sample_rate: int = LIVEKIT_SAMPLE_RATE) -> str:
    """
    Transcribe raw PCM bytes via Deepgram.
    Wraps PCM in a proper WAV file before sending.
    """
    try:
        import wave
        import io
        from deepgram import DeepgramClient, PrerecordedOptions, FileSource

        api_key = os.environ.get("DEEPGRAM_API_KEY", "")
        if not api_key:
            raise RuntimeError("DEEPGRAM_API_KEY not set in .env")

        # Wrap raw PCM in WAV format — this is what Deepgram needs
        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, "wb") as wf:
            wf.setnchannels(CHANNELS)
            wf.setsampwidth(2)          # 16-bit
            wf.setframerate(sample_rate)
            wf.writeframes(audio_bytes)
        wav_bytes = wav_buffer.getvalue()

        dg      = DeepgramClient(api_key)
        payload: FileSource = {"buffer": wav_bytes, "mimetype": "audio/wav"}
        opts    = PrerecordedOptions(
            model        = "nova-2",
            smart_format = True,
            language     = "en",
        )
        response = dg.listen.prerecorded.v("1").transcribe_file(payload, opts)
        return response.results.channels[0].alternatives[0].transcript

    except Exception as exc:
        logger.error("[Voice] Deepgram STT failed: %s", exc)
        return ""
    
    
async def _tts_synthesize(text: str) -> bytes:
    """Edge TTS: text → MP3 bytes (async)."""
    import edge_tts

    voice = os.environ.get("TTS_VOICE", "en-IN-NeerjaNeural")

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(tmp_path)
        with open(tmp_path, "rb") as f:
            return f.read()
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


def _mp3_to_pcm(mp3_bytes: bytes, target_sample_rate: int = 24000) -> bytes:
    """
    Decode MP3 bytes to raw PCM (16-bit, mono).
    This is the fix for the v1 bug — v1 fed raw MP3 bytes directly to LiveKit
    which produces silence or noise. LiveKit needs raw PCM.
    Uses pydub for decoding.
    """
    try:
        from pydub import AudioSegment
        import io

        audio = AudioSegment.from_mp3(io.BytesIO(mp3_bytes))
        audio = audio.set_frame_rate(target_sample_rate)
        audio = audio.set_channels(CHANNELS)
        audio = audio.set_sample_width(2)   # 16-bit
        return audio.raw_data

    except Exception as exc:
        logger.error("[Voice] MP3→PCM decode failed: %s", exc)
        # Return silence rather than crashing
        duration_ms  = 500
        silence_size = int(target_sample_rate * CHANNELS * 2 * duration_ms / 1000)
        return b"\x00" * silence_size


async def _publish_pcm(
    source,
    pcm_bytes: bytes,
    sample_rate: int,
    chunk_ms: int = 20,
):
    """
    Feed raw PCM bytes into a LiveKit AudioSource in chunks.
    chunk_ms: how many milliseconds of audio per frame (20ms is standard).
    """
    from livekit import rtc

    samples_per_chunk = int(sample_rate * chunk_ms / 1000)
    bytes_per_chunk   = samples_per_chunk * CHANNELS * 2   # 16-bit = 2 bytes

    offset = 0
    while offset < len(pcm_bytes):
        chunk = pcm_bytes[offset: offset + bytes_per_chunk]

        # Pad last chunk if needed
        if len(chunk) < bytes_per_chunk:
            chunk = chunk + b"\x00" * (bytes_per_chunk - len(chunk))

        frame = rtc.AudioFrame(
            data               = chunk,
            sample_rate        = sample_rate,
            num_channels       = CHANNELS,
            samples_per_channel= samples_per_chunk,
        )
        await source.capture_frame(frame)
        offset += bytes_per_chunk

        # Yield control to event loop every chunk
        await asyncio.sleep(0)


# =============================================================================
# Local test entry point
# =============================================================================

if __name__ == "__main__":
    """
    Quick local test — starts the agent worker.
    Make sure .env has LiveKit + Deepgram + GCP credentials.

    Run:
        python -m souli_pipeline.voice.livekit_agent
    """
    import sys
    from dotenv import load_dotenv
    load_dotenv()

    logging.basicConfig(
        level  = logging.INFO,
        format = "[%(levelname)s] %(name)s: %(message)s",
    )

    agent = SouliVoiceAgent(session_id="voice-test-001")
    agent.start()