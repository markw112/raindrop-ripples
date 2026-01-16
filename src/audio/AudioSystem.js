/**
 * Main audio system controller for FAUST-based chord synthesis.
 * Handles Web Audio initialization, FAUST loading, and voice management.
 *
 * If FAUST module is not available, falls back to Web Audio API synthesis.
 */


import { NoteMapper } from './NoteMapper.js';

export class AudioSystem {
  constructor() {
    this.audioContext = null;
    this.faustNode = null;
    this.noteMapper = new NoteMapper();

    this.isInitialized = false;
    this.isEnabled = false;
    this.useFallback = false;

    // Parameters
    this.masterGain = 0.7;
    this.brightness = 0.5;
    this.decayTime = 2.5;

    // Chord synth parameters
    this.chordType = 5;  // Minor 9th default
    this.morph = 0.5;    // Waveform blend

    // Reverb/Delay parameters
    this.reverbMix = 0.4;
    this.reverbRoom = 0.7;
    this.delayTime = 0.3;
    this.delayFeedback = 0.4;
    this.delayMix = 0.25;

    // Fallback synth nodes
    this.masterGainNode = null;

    // Throttling to prevent audio overload at high spawn rates
    this.minTimeBetweenNotes = 50; // ms
    this.lastNoteTime = 0;

    // Active voices for fallback synth
    this.activeVoices = [];
    this.maxVoices = 16;
  }

  /**
   * Initialize Web Audio context (requires user gesture).
   * @returns {Promise<boolean>} Success status
   */
  async init() {
    if (this.isInitialized) return true;

    try {
      // Create audio context
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 44100,
        latencyHint: 'interactive'
      });

      // Resume context (may be suspended until user gesture)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Create master gain node
      this.masterGainNode = this.audioContext.createGain();
      this.masterGainNode.gain.value = this.masterGain;
      this.masterGainNode.connect(this.audioContext.destination);

      // Try to load FAUST module
      try {
        await this.loadFaustModule();
        console.log('FAUST module loaded successfully');
      } catch (faustError) {
        console.warn('FAUST module not available, using fallback synth:', faustError.message);
        this.useFallback = true;
      }

      this.isInitialized = true;
      console.log('AudioSystem initialized successfully');
      return true;

    } catch (error) {
      console.error('AudioSystem initialization failed:', error);
      return false;
    }
  }

  /**
   * Load and instantiate FAUST WebAssembly module.
   */
  async loadFaustModule() {
    // Import the create-node module from src (gets bundled by Vite)
    const { createFaustNode } = await import('./faust/create-node.js');

    // Create polyphonic FAUST node using the exported helper
    const result = await createFaustNode(this.audioContext, 'chord_synth', this.maxVoices);
    this.faustNode = result.faustNode;

    if (!this.faustNode) {
      throw new Error('Failed to create FAUST node');
    }

    // Connect to master gain
    this.faustNode.connect(this.masterGainNode);

    // Set initial parameters
    this.updateFaustParams();
  }

  /**
   * Update FAUST global parameters.
   */
  updateFaustParams() {
    if (!this.faustNode) return;

    try {
      // DSP parameters (from dsp-meta.json)
      this.faustNode.setParamValue('/chord_synth/masterGain', this.masterGain);
      this.faustNode.setParamValue('/chord_synth/brightness', this.brightness);
      this.faustNode.setParamValue('/chord_synth/decayTime', this.decayTime);
      this.faustNode.setParamValue('/chord_synth/chordType', this.chordType);
      this.faustNode.setParamValue('/chord_synth/morph', this.morph);
      // Effect parameters (from effect-meta.json)
      this.faustNode.setParamValue('/chord_synth/reverbMix', this.reverbMix);
      this.faustNode.setParamValue('/chord_synth/reverbRoom', this.reverbRoom);
      this.faustNode.setParamValue('/chord_synth/delayTime', this.delayTime);
      this.faustNode.setParamValue('/chord_synth/delayFeedback', this.delayFeedback);
      this.faustNode.setParamValue('/chord_synth/delayMix', this.delayMix);
    } catch (e) {
      console.warn('Error setting FAUST param:', e);
    }
  }

  /**
   * Enable/disable audio output.
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;

    if (enabled && this.audioContext?.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  /**
   * Set master volume.
   * @param {number} gain - Volume level (0-1)
   */
  setMasterGain(gain) {
    this.masterGain = gain;
    if (this.masterGainNode) {
      this.masterGainNode.gain.value = gain;
    }
    this.updateFaustParams();
  }

  /**
   * Set tone brightness.
   * @param {number} brightness - Brightness level (0-1)
   */
  setBrightness(brightness) {
    this.brightness = brightness;
    this.updateFaustParams();
  }

  /**
   * Set decay time.
   * @param {number} seconds - Decay duration (0.5-5)
   */
  setDecayTime(seconds) {
    this.decayTime = seconds;
    this.updateFaustParams();
  }

  /**
   * Set reverb mix level.
   * @param {number} value - Reverb mix (0-1)
   */
  setReverbMix(value) {
    this.reverbMix = value;
    this.updateFaustParams();
  }

  /**
   * Set reverb room size.
   * @param {number} value - Room size (0-1)
   */
  setReverbRoom(value) {
    this.reverbRoom = value;
    this.updateFaustParams();
  }

  /**
   * Set delay time.
   * @param {number} seconds - Delay time (0.05-1)
   */
  setDelayTime(seconds) {
    this.delayTime = seconds;
    this.updateFaustParams();
  }

  /**
   * Set delay feedback.
   * @param {number} value - Feedback amount (0-0.85)
   */
  setDelayFeedback(value) {
    this.delayFeedback = value;
    this.updateFaustParams();
  }

  /**
   * Set delay mix level.
   * @param {number} value - Delay mix (0-1)
   */
  setDelayMix(value) {
    this.delayMix = value;
    this.updateFaustParams();
  }

  /**
   * Set chord type.
   * @param {number} value - Chord type (0-10)
   */
  setChordType(value) {
    this.chordType = Math.round(value);
    this.updateFaustParams();
  }

  /**
   * Set morph (waveform blend).
   * @param {number} value - Morph amount (0-1)
   */
  setMorph(value) {
    this.morph = value;
    this.updateFaustParams();
  }

  /**
   * Trigger a note for an impact event.
   * @param {number} x - Impact X position
   * @param {number} z - Impact Z position
   * @param {number} strength - Impact strength
   */
  triggerNote(x, z, strength) {
    if (!this.isEnabled || !this.isInitialized) return;

    // Throttle note triggers to prevent audio overload
    const now = performance.now();
    if (now - this.lastNoteTime < this.minTimeBetweenNotes) {
      return;
    }
    this.lastNoteTime = now;

    // Map position to musical parameters
    const noteParams = this.noteMapper.mapImpact(x, z, strength);

    if (this.useFallback) {
      this.triggerFallbackNote(noteParams);
    } else {
      this.triggerFaustNote(noteParams);
    }
  }

  /**
   * Trigger note using FAUST polyphonic API.
   */
  triggerFaustNote(noteParams) {
    if (!this.faustNode) return;

    try {
      // Set per-voice pan before triggering note
      this.faustNode.setParamValue('/chord_synth/pan', noteParams.pan);

      // FAUST polyphonic API
      this.faustNode.keyOn(
        0,
        noteParams.midiNote,
        Math.round(noteParams.gain * 127)
      );
    } catch (e) {
      console.warn('FAUST keyOn error:', e);
    }
  }

  /**
   * Trigger note using Web Audio fallback (bell-like synthesis).
   */
  triggerFallbackNote(noteParams) {
    const { frequency, gain, pan } = noteParams;
    const now = this.audioContext.currentTime;

    // Clean up finished voices
    this.activeVoices = this.activeVoices.filter(v => v.endTime > now);

    // Limit polyphony
    if (this.activeVoices.length >= this.maxVoices) {
      return;
    }

    // Bell-like partials (inharmonic ratios)
    const partialRatios = [1, 2, 2.97, 4.16, 5.43, 6.79];
    const partialAmps = [1, 0.7, 0.5, 0.35, 0.25, 0.15];
    const partialDecays = [1, 0.8, 0.6, 0.4, 0.25, 0.15];

    // Create panner
    const panner = this.audioContext.createStereoPanner();
    panner.pan.value = (pan - 0.5) * 2; // Convert 0-1 to -1 to 1
    panner.connect(this.masterGainNode);

    // Create voice gain
    const voiceGain = this.audioContext.createGain();
    voiceGain.gain.value = gain * 0.15; // Scale down to prevent clipping
    voiceGain.connect(panner);

    // Apply brightness via filter
    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800 + this.brightness * 6000;
    filter.Q.value = 0.5;
    filter.connect(voiceGain);

    const oscillators = [];
    const partialGains = [];

    // Create oscillators for each partial
    for (let i = 0; i < partialRatios.length; i++) {
      const osc = this.audioContext.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = frequency * partialRatios[i];

      const partialGain = this.audioContext.createGain();
      const baseAmp = partialAmps[i];
      const decayMod = partialDecays[i];

      // Envelope: quick attack, exponential decay
      partialGain.gain.setValueAtTime(0, now);
      partialGain.gain.linearRampToValueAtTime(baseAmp, now + 0.02);

      // Higher partials decay faster
      const partialDecayTime = this.decayTime * decayMod;
      partialGain.gain.exponentialRampToValueAtTime(0.001, now + 0.02 + partialDecayTime);

      osc.connect(partialGain);
      partialGain.connect(filter);

      osc.start(now);
      osc.stop(now + 0.02 + partialDecayTime + 0.1);

      oscillators.push(osc);
      partialGains.push(partialGain);
    }

    // Track voice for cleanup
    const voiceEndTime = now + this.decayTime + 0.2;
    this.activeVoices.push({
      endTime: voiceEndTime,
      oscillators,
      nodes: [panner, voiceGain, filter, ...partialGains]
    });

    // Schedule cleanup
    setTimeout(() => {
      oscillators.forEach(osc => {
        try { osc.disconnect(); } catch (e) {}
      });
      [panner, voiceGain, filter, ...partialGains].forEach(node => {
        try { node.disconnect(); } catch (e) {}
      });
    }, (voiceEndTime - now) * 1000 + 100);
  }

  /**
   * Process multiple impact events (called from animation loop).
   * @param {Array<{x, z, strength}>} impacts - Array of impact events
   */
  processImpacts(impacts) {
    if (!this.isEnabled || impacts.length === 0) return;

    for (const impact of impacts) {
      this.triggerNote(impact.x, impact.z, impact.strength);
    }
  }

  /**
   * Get current audio state for debugging.
   * @returns {Object} State information
   */
  getState() {
    return {
      initialized: this.isInitialized,
      enabled: this.isEnabled,
      useFallback: this.useFallback,
      contextState: this.audioContext?.state,
      activeVoices: this.activeVoices.length,
      masterGain: this.masterGain,
      brightness: this.brightness,
      decayTime: this.decayTime
    };
  }

  /**
   * Clean up resources.
   */
  dispose() {
    if (this.faustNode) {
      this.faustNode.disconnect();
      this.faustNode = null;
    }
    if (this.masterGainNode) {
      this.masterGainNode.disconnect();
      this.masterGainNode = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.isInitialized = false;
    this.activeVoices = [];
  }
}
