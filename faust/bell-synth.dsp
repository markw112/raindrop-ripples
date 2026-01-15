// bell-synth.dsp - Soft bell/chime synthesizer for raindrop sonification
// Compile with: faust2wasm -poly bell-synth.dsp -o bell-synth
//
// This creates a polyphonic bell synthesizer that responds to:
// - freq: Note frequency (set by keyOn MIDI note)
// - gain: Note velocity (set by keyOn velocity)
// - gate: Note trigger (controlled by keyOn/keyOff)
// - pan: Stereo position (0=left, 1=right)
// - masterGain: Global volume
// - brightness: Filter brightness
// - decayTime: Note decay duration

declare name "bell-synth";
declare author "RaindropRipples";
declare version "1.0";

import("stdfaust.lib");
import("reverbs.lib");
import("delays.lib");

// ============================================================================
// PARAMETERS
// ============================================================================

// Per-voice parameters (controlled by MIDI/JavaScript)
freq = hslider("freq", 440, 100, 2000, 0.01);
gain = hslider("gain", 0.5, 0, 1, 0.001);
gate = button("gate");

// Global parameters
masterGain = hslider("masterGain", 0.7, 0, 1, 0.01);
brightness = hslider("brightness", 0.5, 0, 1, 0.01);
decayTime = hslider("decayTime", 2.5, 0.5, 5, 0.1);
pan = hslider("pan", 0.5, 0, 1, 0.01);

// Reverb parameters
reverbMix = hslider("reverbMix", 0.3, 0, 1, 0.01);
reverbRoom = hslider("reverbRoom", 0.6, 0, 1, 0.01);

// Delay parameters
delayTime = hslider("delayTime", 0.25, 0.05, 1, 0.01) : si.smoo;
delayFeedback = hslider("delayFeedback", 0.35, 0, 0.85, 0.01);
delayMix = hslider("delayMix", 0.2, 0, 1, 0.01);

// ============================================================================
// ENVELOPE
// ============================================================================

// Gentle attack (20ms), exponential release based on decayTime
attackTime = 0.02;
releaseTime = decayTime;

// AR envelope
envelope = en.ar(attackTime, releaseTime, gate);

// ============================================================================
// OSCILLATOR BANK (Bell-like partials)
// ============================================================================

// Bell partial ratios (slightly inharmonic for metallic character)
// Based on analysis of tubular bells / chimes
partial(n, f) = os.osc(f * ratio) * amp * envMod
with {
    // Inharmonic ratios characteristic of bells
    ratios = (1.0, 2.0, 2.97, 4.16, 5.43, 6.79);
    ratio = ba.take(n+1, ratios);

    // Amplitude decreases with partial number
    amps = (1.0, 0.7, 0.5, 0.35, 0.25, 0.15);
    amp = ba.take(n+1, amps);

    // Higher partials decay faster
    decayMods = (1.0, 0.8, 0.6, 0.4, 0.25, 0.15);
    decayMod = ba.take(n+1, decayMods);
    envMod = envelope : pow(decayMod);
};

// Sum of 6 partials
bellOsc = sum(n, 6, partial(n, freq));

// ============================================================================
// FILTERING
// ============================================================================

// Brightness control via low-pass filter
filterFreq = 800 + brightness * 6000;
filtered = bellOsc : fi.lowpass(2, filterFreq);

// Add subtle high-frequency shimmer
shimmer = no.noise * 0.02 * envelope : fi.highpass(2, 4000) : fi.lowpass(2, 8000);
withShimmer = filtered + shimmer * brightness;

// ============================================================================
// OUTPUT STAGE
// ============================================================================

// Apply gain and envelope
voiced = withShimmer * envelope * gain;

// Stereo panning
panL = sqrt(1 - pan);
panR = sqrt(pan);

// Final stereo output
process = voiced * masterGain <: *(panL), *(panR);

// ============================================================================
// EFFECTS SECTION (Applied after polyphonic voices are summed)
// ============================================================================

// Ping-pong stereo delay
maxDelaySamples = 96000;  // 2 seconds at 48kHz
delaySamples = delayTime * ma.SR;

pingpongDelay(l, r) = delayedL, delayedR
with {
    delayedL = l + r * delayFeedback : de.delay(maxDelaySamples, delaySamples);
    delayedR = r + l * delayFeedback : de.delay(maxDelaySamples, delaySamples);
};

// Effect chain: delay -> reverb
effect = pingpongDelay :
         par(i, 2, *(1 - delayMix)) :  // Dry/wet mix for delay
         re.stereo_freeverb(0.5, reverbRoom, 0.5, reverbMix);
