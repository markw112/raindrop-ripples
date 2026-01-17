/**
 * Maps lake surface positions to musical notes using pentatonic scale.
 *
 * Lake dimensions: 20x20 units, centered at origin
 * X-axis: -10 to +10 (horizontal) -> Note selection (5 pentatonic notes)
 * Z-axis: -10 to +10 (vertical) -> Octave selection (3 octaves)
 */

export class NoteMapper {
  constructor() {
    // Configuration
    this.lakeSize = 20;
    this.lakeHalf = 10;
    this.numOctaves = 3;
    this.baseOctave = 3;
    this.rootNote = 60; // C4 as MIDI base

    // Chord-matched scales - each chord type has a harmonically compatible scale
    // Scale intervals are semitones from root
    this.chordScales = {
      0: [0, 7, 12, 19, 24],           // Octave chord -> octaves/fifths only
      1: [0, 7, 12, 19, 24],           // Fifth chord -> fifths
      2: [0, 2, 5, 7, 12],             // Sus4 -> suspended feel
      3: [0, 3, 5, 7, 10],             // Minor -> natural minor pentatonic
      4: [0, 3, 5, 7, 10],             // Minor 7th -> minor pentatonic
      5: [0, 3, 5, 7, 10, 14],         // Minor 9th -> minor + 9th
      6: [0, 3, 5, 7, 10, 14, 17],     // Minor 11th -> extended minor
      7: [0, 2, 4, 7, 9],              // 6/9 -> major pentatonic
      8: [0, 2, 4, 7, 11, 14],         // Major 9th -> major + extensions
      9: [0, 2, 4, 7, 11],             // Major 7th -> major with 7th
      10: [0, 2, 4, 7, 9],             // Major -> major pentatonic
    };
    this.currentChordType = 5; // Default: Minor 9th

    // Pre-calculate frequencies for all possible notes
    this.frequencyTable = this.buildFrequencyTable();
  }

  /**
   * Set the current chord type to match scales accordingly.
   * @param {number} chordType - Chord type index (0-10)
   */
  setChordType(chordType) {
    if (chordType >= 0 && chordType <= 10) {
      this.currentChordType = chordType;
    }
  }

  /**
   * Build lookup table of frequencies for all notes across octaves.
   * @returns {Map<number, number>} MIDI note -> frequency (Hz)
   */
  buildFrequencyTable() {
    const table = new Map();
    // Cover octaves 2-6 for safety margin
    for (let midi = 36; midi <= 96; midi++) {
      table.set(midi, this.midiToFrequency(midi));
    }
    return table;
  }

  /**
   * Convert MIDI note number to frequency.
   * @param {number} midi - MIDI note number (0-127)
   * @returns {number} Frequency in Hz
   */
  midiToFrequency(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  /**
   * Map impact position to musical parameters.
   * @param {number} x - X position (-10 to +10)
   * @param {number} z - Z position (-10 to +10)
   * @param {number} strength - Impact strength (0 to ~0.8)
   * @returns {Object} {frequency, gain, pan, midiNote, noteIndex, octaveOffset}
   */
  mapImpact(x, z, strength) {
    // Clamp positions to lake bounds
    const clampedX = Math.max(-this.lakeHalf, Math.min(this.lakeHalf, x));
    const clampedZ = Math.max(-this.lakeHalf, Math.min(this.lakeHalf, z));

    // Normalize to 0-1 range
    const normalizedX = (clampedX + this.lakeHalf) / this.lakeSize;
    const normalizedZ = (clampedZ + this.lakeHalf) / this.lakeSize;

    // Get the chord-matched scale for current chord type
    const scale = this.chordScales[this.currentChordType];

    // X-axis -> Note selection (dynamic based on scale length)
    const noteIndex = Math.floor(normalizedX * scale.length);
    const clampedNoteIndex = Math.min(noteIndex, scale.length - 1);

    // Z-axis -> Octave selection (3 octaves across the depth)
    const octaveOffset = Math.floor(normalizedZ * this.numOctaves);
    const clampedOctaveOffset = Math.min(octaveOffset, this.numOctaves - 1);

    // Calculate MIDI note from scale interval
    const semitone = scale[clampedNoteIndex];
    const midiNote = this.rootNote + semitone + (clampedOctaveOffset - 1) * 12;

    // Get frequency from table
    const frequency = this.frequencyTable.get(midiNote) || 440;

    // Strength -> Gain (scale to musical dynamics)
    // Impact strength is typically 0-0.8, map to 0.3-1.0 for audible range
    const gain = 0.3 + Math.min(strength, 0.8) * 0.875;

    // X position -> Stereo pan (0=left, 1=right)
    const pan = normalizedX;

    return {
      frequency,
      gain,
      pan,
      midiNote,
      noteIndex: clampedNoteIndex,
      octaveOffset: clampedOctaveOffset
    };
  }

  /**
   * Get note name for debugging/display.
   * @param {number} noteIndex - Index in pentatonic scale (0-4)
   * @param {number} octaveOffset - Octave offset (0-2)
   * @returns {string} Note name (e.g., "C3", "G4", "A5")
   */
  getNoteName(noteIndex, octaveOffset) {
    const noteNames = ['C', 'D', 'E', 'G', 'A'];
    const octave = this.baseOctave + octaveOffset;
    return `${noteNames[noteIndex]}${octave}`;
  }
}
