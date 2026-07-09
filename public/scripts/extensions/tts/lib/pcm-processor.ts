// @ts-expect-error TS(2304): Cannot find name 'AudioWorkletProcessor'.
class PCMProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        // @ts-expect-error TS(2339): Property 'buffer' does not exist on type 'PCMProce... Remove this comment to see the full error message
        this.buffer = new Float32Array(24000 * 30); // Pre-allocate buffer for ~30 seconds at 24kHz
        // @ts-expect-error TS(2339): Property 'writeIndex' does not exist on type 'PCMP... Remove this comment to see the full error message
        this.writeIndex = 0;
        // @ts-expect-error TS(2339): Property 'readIndex' does not exist on type 'PCMPr... Remove this comment to see the full error message
        this.readIndex = 0;
        // @ts-expect-error TS(2339): Property 'pendingBytes' does not exist on type 'PC... Remove this comment to see the full error message
        this.pendingBytes = new Uint8Array(0); // Buffer for incomplete samples
        // @ts-expect-error TS(2339): Property 'volume' does not exist on type 'PCMProce... Remove this comment to see the full error message
        this.volume = 1.0; // Default volume (1.0 = 100%, 0.5 = 50%, etc.)
        // @ts-expect-error TS(2339): Property 'port' does not exist on type 'PCMProcess... Remove this comment to see the full error message
        this.port.onmessage = (event) => {
            if (event.data.pcmData) {
                // Combine any pending bytes with new data
                const newData = new Uint8Array(event.data.pcmData);
                // @ts-expect-error TS(2339): Property 'pendingBytes' does not exist on type 'PC... Remove this comment to see the full error message
                const combined = new Uint8Array(this.pendingBytes.length + newData.length);
                // @ts-expect-error TS(2339): Property 'pendingBytes' does not exist on type 'PC... Remove this comment to see the full error message
                combined.set(this.pendingBytes);
                // @ts-expect-error TS(2339): Property 'pendingBytes' does not exist on type 'PC... Remove this comment to see the full error message
                combined.set(newData, this.pendingBytes.length);
                
                // Calculate how many complete 16-bit samples we have
                const completeSamples = Math.floor(combined.length / 2);
                const bytesToProcess = completeSamples * 2;
                
                if (completeSamples > 0) {
                    // Process complete samples
                    const int16Array = new Int16Array(combined.buffer.slice(0, bytesToProcess));
                    
                    // Write directly to circular buffer
                    for (let i = 0; i < int16Array.length; i++) {
                        // Expand buffer if needed
                        // @ts-expect-error TS(2339): Property 'writeIndex' does not exist on type 'PCMP... Remove this comment to see the full error message
                        if (this.writeIndex >= this.buffer.length) {
                            // @ts-expect-error TS(2339): Property 'buffer' does not exist on type 'PCMProce... Remove this comment to see the full error message
                            const newBuffer = new Float32Array(this.buffer.length * 2);
                            // Copy existing data maintaining order
                            // @ts-expect-error TS(2339): Property 'readIndex' does not exist on type 'PCMPr... Remove this comment to see the full error message
                            let sourceIndex = this.readIndex;
                            let targetIndex = 0;
                            // @ts-expect-error TS(2339): Property 'writeIndex' does not exist on type 'PCMP... Remove this comment to see the full error message
                            while (sourceIndex !== this.writeIndex) {
                                // @ts-expect-error TS(2339): Property 'buffer' does not exist on type 'PCMProce... Remove this comment to see the full error message
                                newBuffer[targetIndex++] = this.buffer[sourceIndex];
                                // @ts-expect-error TS(2339): Property 'buffer' does not exist on type 'PCMProce... Remove this comment to see the full error message
                                sourceIndex = (sourceIndex + 1) % this.buffer.length;
                            }
                            // @ts-expect-error TS(2339): Property 'buffer' does not exist on type 'PCMProce... Remove this comment to see the full error message
                            this.buffer = newBuffer;
                            // @ts-expect-error TS(2339): Property 'readIndex' does not exist on type 'PCMPr... Remove this comment to see the full error message
                            this.readIndex = 0;
                            // @ts-expect-error TS(2339): Property 'writeIndex' does not exist on type 'PCMP... Remove this comment to see the full error message
                            this.writeIndex = targetIndex;
                        }
                        
                        // @ts-expect-error TS(2339): Property 'buffer' does not exist on type 'PCMProce... Remove this comment to see the full error message
                        this.buffer[this.writeIndex] = int16Array[i] / 32768.0; // Convert 16-bit to float
                        // @ts-expect-error TS(2339): Property 'writeIndex' does not exist on type 'PCMP... Remove this comment to see the full error message
                        this.writeIndex = (this.writeIndex + 1) % this.buffer.length;
                    }
                }
                
                // Store any remaining incomplete bytes
                if (combined.length > bytesToProcess) {
                    // @ts-expect-error TS(2339): Property 'pendingBytes' does not exist on type 'PC... Remove this comment to see the full error message
                    this.pendingBytes = combined.slice(bytesToProcess);
                } else {
                    // @ts-expect-error TS(2339): Property 'pendingBytes' does not exist on type 'PC... Remove this comment to see the full error message
                    this.pendingBytes = new Uint8Array(0);
                }
            } else if (event.data.volume !== undefined) {
                // Set volume (0.0 to 1.0, can go higher for amplification)
                // @ts-expect-error TS(2339): Property 'volume' does not exist on type 'PCMProce... Remove this comment to see the full error message
                this.volume = Math.max(0, event.data.volume);
            }
        };
    }
    
    // @ts-expect-error TS(7006): Parameter 'inputs' implicitly has an 'any' type.
    process(inputs, outputs, parameters) {
        const output = outputs[0];
        // @ts-expect-error TS(2339): Property 'readIndex' does not exist on type 'PCMPr... Remove this comment to see the full error message
        if (output.length > 0 && this.readIndex !== this.writeIndex) {
            const channelData = output[0];
            // @ts-expect-error TS(2339): Property 'readIndex' does not exist on type 'PCMPr... Remove this comment to see the full error message
            for (let i = 0; i < channelData.length && this.readIndex !== this.writeIndex; i++) {
                // @ts-expect-error TS(2339): Property 'buffer' does not exist on type 'PCMProce... Remove this comment to see the full error message
                channelData[i] = this.buffer[this.readIndex] * this.volume;
                // @ts-expect-error TS(2339): Property 'readIndex' does not exist on type 'PCMPr... Remove this comment to see the full error message
                this.readIndex = (this.readIndex + 1) % this.buffer.length;
            }
        }
        return true;
    }
}

// @ts-expect-error TS(2304): Cannot find name 'registerProcessor'.
registerProcessor('pcm-processor', PCMProcessor);
