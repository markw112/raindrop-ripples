/**
 * Maps lake surface positions to musical notes using selectable scales.
 *
 * Lake dimensions: 20x20 units, centered at origin
 * X-axis: -10 to +10 (horizontal) -> Note selection within current scale
 * Z-axis: -10 to +10 (vertical) -> Octave selection (3 octaves)
 */

export class NoteMapper {
  constructor() {
    // Available scales (intervals in semitones from root)
    this.scales = {
      0: { name: 'Pentatonic', intervals: [0, 2, 4, 7, 9] },           // C D E G A
      1: { name: 'Major', intervals: [0, 2, 4, 5, 7, 9, 11] },         // C D E F G A B
      2: { name: 'Minor', intervals: [0, 2, 3, 5, 7, 8, 10] },         // Natural minor
      3: { name: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10] },        // Jazz minor
      4: { name: 'Whole Tone', intervals: [0, 2, 4, 6, 8, 10] },       // Dreamy
      5: { name: 'Chromatic', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }  // All notes
    };
    this.currentScale = 0;  // Default to pentatonic

    // Configuration
    this.lakeSize = 20;
    this.lakeHalf = 10;
    this.numOctaves = 3;
    this.baseOctave = 3;
    this.rootNote = 60;  // C4 = MIDI 60

    // Pre-calculate frequencies for all possible notes
    this.frequencyTable = this.buildFrequencyTable();
  }

  /**
   * Set the current scale type.
   * @param {number} scaleIndex - Scale index (0-5)
   */
  setScale(scaleIndex) {
    this.currentScale = Math.max(0, Math.min(5, scaleIndex));
  }

  /**
   * Set the current chord type (kept for API compatibility).
   * @param {number} chordType - Chord type index (ignored)
   */
  setChordType(chordType) {
    // No-op - chord functionality removed
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

    // Get current scale
    const scale = this.scales[this.currentScale].intervals;
    const numNotes = scale.length;

    // X-axis -> Note selection within scale
    const noteIndex = Math.floor(normalizedX * numNotes);
    const clampedNoteIndex = Math.min(noteIndex, numNotes - 1);

    // Z-axis -> Octave selection (3 octaves)
    const octaveOffset = Math.floor(normalizedZ * this.numOctaves);
    const clampedOctaveOffset = Math.min(octaveOffset, this.numOctaves - 1);

    // Calculate MIDI note: root + scale interval + octave offset
    const scaleInterval = scale[clampedNoteIndex];
    const midiNote = this.rootNote + scaleInterval + (clampedOctaveOffset - 1) * 12;

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
   * @param {number} noteIndex - Index in current scale
   * @param {number} octaveOffset - Octave offset (0-2)
   * @returns {string} Note name (e.g., "C3", "G4", "A5")
   */
  getNoteName(noteIndex, octaveOffset) {
    const allNoteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const scale = this.scales[this.currentScale].intervals;
    const interval = scale[noteIndex] || 0;
    const noteName = allNoteNames[interval % 12];
    const octave = this.baseOctave + octaveOffset;
    return `${noteName}${octave}`;
  }
}
