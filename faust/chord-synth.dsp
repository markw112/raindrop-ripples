// chord-synth.dsp - Chord synthesizer inspired by Mutable Instruments Plaits
// Compile with: faust2wasm -poly chord-synth.dsp -o chord-synth
//
// Creates lush chord pads triggered by raindrop impacts
// Each note triggers a full chord based on the chord type setting

declare name "chordsynth";
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
pan = hslider("pan", 0.5, 0, 1, 0.01);

// Chord parameters
chordType = hslider("chordType", 5, 0, 10, 1) : int;  // 0-10 chord types
morph = hslider("morph", 0.5, 0, 1, 0.01);  // Blend between waveforms
brightness = hslider("brightness", 0.5, 0, 1, 0.01);
decayTime = hslider("decayTime", 2.5, 0.5, 8, 0.1);

// Reverb parameters
reverbMix = hslider("reverbMix", 0.4, 0, 1, 0.01);
reverbRoom = hslider("reverbRoom", 0.7, 0, 1, 0.01);

// Delay parameters
delayTime = hslider("delayTime", 0.3, 0.05, 1, 0.01) : si.smoo;
delayFeedback = hslider("delayFeedback", 0.4, 0, 0.85, 0.01);
delayMix = hslider("delayMix", 0.25, 0, 1, 0.01);

// ============================================================================
// CHORD DEFINITIONS (Plaits-style, intervals in semitones)
// ============================================================================

// Convert semitones to frequency ratio
semi2ratio(s) = 2^(s/12);

// Chord intervals: each chord has 4 notes (including root)
// Format: (note1, note2, note3, note4) in semitones from root

// Note: we'll interpolate between chords based on chordType
// Chord 0: Octave
chord0 = (0, 0.01, 12, 12.01);
// Chord 1: Fifth
chord1 = (0, 7, 7.01, 12);
// Chord 2: Sus4
chord2 = (0, 5, 7, 12);
// Chord 3: Minor
chord3 = (0, 3, 7, 12);
// Chord 4: Minor 7th
chord4 = (0, 3, 7, 10);
// Chord 5: Minor 9th
chord5 = (0, 3, 10, 14);
// Chord 6: Minor 11th
chord6 = (0, 3, 10, 17);
// Chord 7: 6/9
chord7 = (0, 2, 9, 16);
// Chord 8: Major 9th
chord8 = (0, 4, 11, 14);
// Chord 9: Major 7th
chord9 = (0, 4, 7, 11);
// Chord 10: Major
chord10 = (0, 4, 7, 12);

// Get interval for voice n (0-3) of chord c (0-10)
getInterval(c, n) = ba.if(c == 0, ba.take(n+1, chord0),
                   ba.if(c == 1, ba.take(n+1, chord1),
                   ba.if(c == 2, ba.take(n+1, chord2),
                   ba.if(c == 3, ba.take(n+1, chord3),
                   ba.if(c == 4, ba.take(n+1, chord4),
                   ba.if(c == 5, ba.take(n+1, chord5),
                   ba.if(c == 6, ba.take(n+1, chord6),
                   ba.if(c == 7, ba.take(n+1, chord7),
                   ba.if(c == 8, ba.take(n+1, chord8),
                   ba.if(c == 9, ba.take(n+1, chord9),
                   ba.take(n+1, chord10)))))))))));

// ============================================================================
// ENVELOPE
// ============================================================================

// Soft attack, long release for pad-like sound
attackTime = 0.05;
releaseTime = decayTime;

// AR envelope with smooth curves
envelope = en.ar(attackTime, releaseTime, gate);

// Per-voice envelope modulation (higher voices decay slightly faster)
voiceEnv(n) = envelope : pow(1.0 - n * 0.1);

// ============================================================================
// OSCILLATOR BLEND (Plaits-style registration)
// ============================================================================

// Morphable oscillator: blend between sine, triangle, saw, square
morphOsc(f) = sine * sineAmt + tri * triAmt + saw * sawAmt + sq * sqAmt
with {
    sine = os.osc(f);
    tri = os.triangle(f);
    saw = os.sawtooth(f) * 0.7;  // Slightly quieter (more harmonics)
    sq = os.square(f) * 0.5;     // Quieter (harsh)

    // Morph creates smooth blend between waveforms
    // 0.0 = pure sine, 0.33 = triangle, 0.66 = saw, 1.0 = square
    sineAmt = max(0, 1 - morph * 3);
    triAmt = max(0, min(1, 2 - abs(morph * 3 - 1) * 2));
    sawAmt = max(0, min(1, 2 - abs(morph * 3 - 2) * 2));
    sqAmt = max(0, morph * 3 - 2);
};

// ============================================================================
// CHORD VOICE SYNTHESIS
// ============================================================================

// Single chord voice with frequency, amplitude, and envelope
chordVoice(n) = morphOsc(voiceFreq) * voiceAmp * voiceEnv(n)
with {
    // Get interval in semitones and convert to frequency
    interval = getInterval(chordType, n) : si.smoo;
    voiceFreq = freq * semi2ratio(interval);

    // Voice amplitudes (root louder, upper voices softer)
    amps = (1.0, 0.7, 0.6, 0.5);
    voiceAmp = ba.take(n+1, amps);
};

// Sum all 4 chord voices
chordOsc = sum(n, 4, chordVoice(n));

// ============================================================================
// FILTERING
// ============================================================================

// Brightness-controlled low-pass filter with resonance
filterFreq = 200 + brightness * brightness * 8000;  // Exponential feel
filterQ = 0.5 + brightness * 0.5;
filtered = chordOsc : fi.resonlp(filterFreq, filterQ, 1);

// ============================================================================
// STEREO SPREAD
// ============================================================================

// Create subtle stereo width by slightly detuning L/R
stereoSpread = 0.002;  // Very subtle detune
leftOsc = filtered;
rightOsc = chordOsc : fi.resonlp(filterFreq * (1 + stereoSpread), filterQ, 1);

// ============================================================================
// OUTPUT STAGE
// ============================================================================

// Apply gain and panning
panL = sqrt(1 - pan);
panR = sqrt(pan);

outL = leftOsc * gain * masterGain * panL * 0.25;  // Scale down to prevent clipping
outR = rightOsc * gain * masterGain * panR * 0.25;

// Final stereo output
process = outL, outR;

// ============================================================================
// EFFECTS SECTION
// ============================================================================

// Simple stereo delay with feedback
maxDelaySamples = 96000;
delaySamples = delayTime * ma.SR;

// Single channel delay with feedback
monoDelay = +~(de.delay(maxDelaySamples, delaySamples) * delayFeedback);

// Stereo delay: apply to both channels with slight offset for width
effect = par(i, 2, _ * (1 - delayMix) + (_ : monoDelay) * delayMix) :
         re.stereo_freeverb(0.5, reverbRoom, 0.5, reverbMix);
