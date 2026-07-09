export class WebLlmVectorProvider {
    /** @type {object?} WebLLM engine */
    #engine = null;

    constructor() {
        this.#engine = null;
    }

    /**
     * Check if WebLLM is available and up-to-date
     * @throws {Error} If WebLLM is not available or not up-to-date
     */
    #checkWebLlm() {
        // @ts-expect-error TS(2304): Cannot find name 'SillyTavern'.
        if (!Object.hasOwn(SillyTavern, 'llm')) {
            // @ts-expect-error TS(2769): No overload matches this call.
            throw new Error('WebLLM is not available', { cause: 'webllm-not-available' });
        }

        // @ts-expect-error TS(2304): Cannot find name 'SillyTavern'.
        if (typeof SillyTavern.llm.generateEmbedding !== 'function') {
            // @ts-expect-error TS(2769): No overload matches this call.
            throw new Error('WebLLM is not updated', { cause: 'webllm-not-updated' });
        }
    }

    /**
     * Initialize the engine with a model.
     * @param {string} modelId Model ID to initialize the engine with
     * @returns {Promise<void>} Promise that resolves when the engine is initialized
     */
    #initEngine(modelId: any) {
        this.#checkWebLlm();
        if (!this.#engine) {
            // @ts-expect-error TS(2304): Cannot find name 'SillyTavern'.
            this.#engine = SillyTavern.llm.getEngine();
        }

        // @ts-expect-error TS(2531): Object is possibly 'null'.
        return this.#engine.loadModel(modelId);
    }

    /**
     * Get available models.
     * @returns {{id:string, toString: function(): string}[]} Array of available models
     */
    getModels() {
        this.#checkWebLlm();
        // @ts-expect-error TS(2304): Cannot find name 'SillyTavern'.
        return SillyTavern.llm.getEmbeddingModels();
    }

    /**
     * Generate embeddings for a list of texts.
     * @param {string[]} texts Array of texts to generate embeddings for
     * @param {string} modelId Model to use for generating embeddings
     * @returns {Promise<number[][]>} Array of embeddings for each text
     */
    async embedTexts(texts: any, modelId: any) {
        await this.#initEngine(modelId);
        // @ts-expect-error TS(2531): Object is possibly 'null'.
        return this.#engine.generateEmbedding(texts);
    }

    /**
     * Loads a model into the engine.
     * @param {string} modelId Model ID to load
     */
    async loadModel(modelId: any) {
        await this.#initEngine(modelId);
    }
}
