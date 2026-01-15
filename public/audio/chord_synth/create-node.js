/**
 * Create FAUST audio node for chord_synth
 * This file loads WASM modules from the public/audio/chord_synth directory
 */

/**
 * Create a Faust audio node for use in the Web Audio API.
 * @param {AudioContext} audioContext - The Web Audio API AudioContext.
 * @param {string} [dspName] - The name of the DSP to load.
 * @param {number} [voices] - The number of voices to be used for polyphonic DSPs.
 * @param {boolean} [sp] - Whether to create a ScriptProcessorNode instead of an AudioWorkletNode.
 * @returns {Promise<{ faustNode: FaustNode | null; dspMeta: FaustDspMeta }>} - An object containing the Faust audio node and the DSP metadata.
 */
const createFaustNode = async (audioContext, dspName = "chord_synth", voices = 0, sp = false, bufferSize = 512) => {
    // Set to true if the DSP has an effect
    const FAUST_DSP_HAS_EFFECT = true;

    // Base URL for loading FAUST assets from public directory
    const baseUrl = '/audio/chord_synth/';
    console.log('FAUST baseUrl:', baseUrl);

    // Import necessary Faust modules from src (these are JS modules that Vite will bundle)
    const { FaustMonoDspGenerator, FaustPolyDspGenerator } = await import('../../../src/audio/faust/faustwasm/index.js');

    // Load DSP metadata from JSON
    /** @type {FaustDspMeta} */
    const dspMetaUrl = baseUrl + "dsp-meta.json";
    console.log('Fetching DSP meta from:', dspMetaUrl);
    const dspMetaResponse = await fetch(dspMetaUrl);
    if (!dspMetaResponse.ok) {
        throw new Error(`Failed to fetch dsp-meta.json: ${dspMetaResponse.status} ${dspMetaResponse.statusText}`);
    }
    const dspMeta = await dspMetaResponse.json();

    // Compile the DSP module from WebAssembly binary data
    const dspModule = await WebAssembly.compileStreaming(await fetch(baseUrl + "dsp-module.wasm"));

    // Create an object representing Faust DSP with metadata and module
    /** @type {FaustDspDistribution} */
    const faustDsp = { dspMeta, dspModule };

    /** @type {FaustNode | null} */
    let faustNode = null;

    // Create either a polyphonic or monophonic Faust audio node based on the number of voices
    if (voices > 0) {

        // Try to load optional mixer and effect modules
        faustDsp.mixerModule = await WebAssembly.compileStreaming(await fetch(baseUrl + "mixer-module.wasm"));

        if (FAUST_DSP_HAS_EFFECT) {
            faustDsp.effectMeta = await (await fetch(baseUrl + "effect-meta.json")).json();
            faustDsp.effectModule = await WebAssembly.compileStreaming(await fetch(baseUrl + "effect-module.wasm"));
        }

        // Create a polyphonic Faust audio node
        const generator = new FaustPolyDspGenerator();
        faustNode = await generator.createNode(
            audioContext,
            voices,
            dspName,
            { module: faustDsp.dspModule, json: JSON.stringify(faustDsp.dspMeta) },
            { module: faustDsp.mixerModule },
            faustDsp.effectModule ? { module: faustDsp.effectModule, json: JSON.stringify(faustDsp.effectMeta) } : undefined,
            sp,
            bufferSize
        );
    } else {
        // Create a monophonic Faust audio node
        const generator = new FaustMonoDspGenerator();
        faustNode = await generator.createNode(
            audioContext,
            dspName,
            { module: faustDsp.dspModule, json: JSON.stringify(faustDsp.dspMeta) },
            sp,
            bufferSize
        );
    }

    console.log('FAUST node created successfully:', faustNode);
    return { faustNode, dspMeta };
};

// Export the function
export { createFaustNode };
