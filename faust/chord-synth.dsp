// chord-synth.dsp - Simple single-note synthesizer
// Velocity controls both amplitude and filter cutoff
// Compile with: faust2wasm -poly chord-synth.dsp -o chord_synth

declare name "chordsynth";
declare author "RaindropRipples";
declare version "2.0";

import("stdfaust.lib");
import("reverbs.lib");
import("delays.lib");

// ============================================================================
// PARAMETERS
// ============================================================================

// Per-voice parameters (from MIDI/JavaScript)
freq = hslider("freq", 440, 100, 2000, 0.01);
gain = hslider("gain", 0.5, 0, 1, 0.001);  // Velocity-driven
gate = button("gate");

// Global parameters
masterGain = hslider("masterGain", 0.7, 0, 1, 0.01);
pan = hslider("pan", 0.5, 0, 1, 0.01);

// Tone shaping
filterCutoff = hslider("filterCutoff", 2000, 200, 8000, 1);  // Base cutoff
brightness = hslider("brightness", 0.5, 0, 1, 0.01);  // Velocity->filter amount
morph = hslider("morph", 0.5, 0, 1, 0.01);  // Waveform blend
decayTime = hslider("decayTime", 2.5, 0.5, 8, 0.1);
attackTime = hslider("attackTime", 0.05, 0.005, 0.5, 0.001) : si.smoo;

// Reverb/Delay
reverbMix = hslider("reverbMix", 0.4, 0, 1, 0.01);
reverbRoom = hslider("reverbRoom", 0.7, 0, 1, 0.01);
delayTime = hslider("delayTime", 0.3, 0.05, 1, 0.01) : si.smoo;
delayFeedback = hslider("delayFeedback", 0.4, 0, 0.85, 0.01);
delayMix = hslider("delayMix", 0.25, 0, 1, 0.01);

// ============================================================================
// ENVELOPE
// ============================================================================

envelope = en.ar(attackTime, decayTime, gate);

// ============================================================================
// OSCILLATOR (morphable waveform)
// ============================================================================

morphOsc(f) = sine * sineAmt + tri * triAmt + saw * sawAmt + sq * sqAmt
with {
    sine = os.osc(f);
    tri = os.triangle(f);
    saw = os.sawtooth(f) * 0.7;
    sq = os.square(f) * 0.5;

    // Morph creates smooth blend between waveforms
    // 0.0 = pure sine, 0.33 = triangle, 0.66 = saw, 1.0 = square
    sineAmt = max(0, 1 - morph * 3);
    triAmt = max(0, min(1, 2 - abs(morph * 3 - 1) * 2));
    sawAmt = max(0, min(1, 2 - abs(morph * 3 - 2) * 2));
    sqAmt = max(0, morph * 3 - 2);
};

// ============================================================================
// VELOCITY-DRIVEN FILTER
// ============================================================================

// Filter cutoff = base cutoff + (velocity * brightness * range)
// Higher velocity = brighter sound
velocityFilterMod = gain * brightness * 6000;
filterFreq = filterCutoff + velocityFilterMod;
filterQ = 0.5;

filtered = morphOsc(freq) : fi.resonlp(filterFreq, filterQ, 1);

// ============================================================================
// OUTPUT
// ============================================================================

voiceOut = filtered * gain * envelope * masterGain * 0.5;
process = voiceOut;

// ============================================================================
// EFFECTS (stereo output)
// ============================================================================

maxDelaySamples = 96000;
delaySamples = delayTime * ma.SR;
singleDelay = +~(de.delay(maxDelaySamples, delaySamples) * delayFeedback);

panL = sqrt(1 - pan);
panR = sqrt(pan);

effect = _ : (_ <: (*(1-delayMix), (singleDelay * delayMix)) :> _)
         <: (*(panL), *(panR))
         : re.stereo_freeverb(0.5, reverbRoom, 0.5, reverbMix);
