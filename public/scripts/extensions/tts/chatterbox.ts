import { saveTtsProviderSettings } from './index.js';
declare const $: any;

export { ChatterboxTtsProvider };

class ChatterboxTtsProvider {
    //########//
    // Config //
    //########//

    settings = {};
    constructor() {
        // Initialize with default settings
        this.settings = {
            // @ts-expect-error TS(2339): Property 'provider_endpoint' does not exist on typ... Remove this comment to see the full error message
            provider_endpoint: this.settings.provider_endpoint || 'http://localhost:8004',
            // @ts-expect-error TS(2339): Property 'voice_mode' does not exist on type '{}'.
            voice_mode: this.settings.voice_mode || 'predefined',
            // @ts-expect-error TS(2339): Property 'predefined_voice' does not exist on type... Remove this comment to see the full error message
            predefined_voice: this.settings.predefined_voice || 'S1',
            // @ts-expect-error TS(2339): Property 'reference_voice' does not exist on type ... Remove this comment to see the full error message
            reference_voice: this.settings.reference_voice || '',
            // @ts-expect-error TS(2339): Property 'temperature' does not exist on type '{}'... Remove this comment to see the full error message
            temperature: this.settings.temperature || 0.8,
            // @ts-expect-error TS(2339): Property 'exaggeration' does not exist on type '{}... Remove this comment to see the full error message
            exaggeration: this.settings.exaggeration || 0.5,
            // @ts-expect-error TS(2339): Property 'cfg_weight' does not exist on type '{}'.
            cfg_weight: this.settings.cfg_weight || 0.5,
            // @ts-expect-error TS(2339): Property 'seed' does not exist on type '{}'.
            seed: this.settings.seed || -1,
            // @ts-expect-error TS(2339): Property 'speed_factor' does not exist on type '{}... Remove this comment to see the full error message
            speed_factor: this.settings.speed_factor || 1.0,
            // @ts-expect-error TS(2339): Property 'language' does not exist on type '{}'.
            language: this.settings.language || 'en',
            // @ts-expect-error TS(2339): Property 'split_text' does not exist on type '{}'.
            split_text: this.settings.split_text || true,
            // @ts-expect-error TS(2339): Property 'chunk_size' does not exist on type '{}'.
            chunk_size: this.settings.chunk_size || 120,
            // @ts-expect-error TS(2339): Property 'output_format' does not exist on type '{... Remove this comment to see the full error message
            output_format: this.settings.output_format || 'wav',
            // @ts-expect-error TS(2339): Property 'voiceMap' does not exist on type '{}'.
            voiceMap: this.settings.voiceMap || {},
        };
    }

    ready = false;
    voices = [];
    separator = '. ';
    audioElement = document.createElement('audio');

    languageLabels = {
        'English': 'en',
        'Spanish': 'es',
        'French': 'fr',
        'German': 'de',
        'Italian': 'it',
        'Portuguese': 'pt',
        'Polish': 'pl',
        'Turkish': 'tr',
        'Russian': 'ru',
        'Dutch': 'nl',
        'Czech': 'cs',
        'Arabic': 'ar',
        'Chinese': 'zh-cn',
        'Japanese': 'ja',
        'Korean': 'ko',
        'Hindi': 'hi',
    };

    get settingsHtml() {
        let html = `<div class="chatterbox-settings-container">
            <div class="chatterbox-settings-header">
                <h3>Chatterbox TTS Settings</h3>
                <div class="status-indicator">
                    Status: <span id="chatterbox-status" class="offline">Offline</span>
                </div>
            </div>`;

        // Server endpoint
        html += `<div class="chatterbox-setting-row">
            <label for="chatterbox-endpoint">Server Endpoint:</label>
            // @ts-expect-error TS(2339): Property 'provider_endpoint' does not exist on typ... Remove this comment to see the full error message
            <input id="chatterbox-endpoint" type="text" class="text_pole" value="${this.settings.provider_endpoint}" />
        </div>`;

        // Language selection
        html += `<div class="chatterbox-setting-row">
            <label for="chatterbox-language">Language:</label>
            <select id="chatterbox-language">`;
        for (let language in this.languageLabels) {
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            html += `<option value="${this.languageLabels[language]}" ${this.languageLabels[language] === this.settings.language ? 'selected' : ''}>${language}</option>`;
        }
        html += `</select>
        </div>`;

        // Generation parameters
        html += `<div class="chatterbox-params-section">
            <h4>Generation Parameters</h4>`;

        // Temperature
        html += `<div class="chatterbox-setting-row">
            // @ts-expect-error TS(2339): Property 'temperature' does not exist on type '{}'... Remove this comment to see the full error message
            <label for="chatterbox-temperature">Temperature: <span id="chatterbox-temperature-value">${this.settings.temperature}</span></label>
            // @ts-expect-error TS(2339): Property 'temperature' does not exist on type '{}'... Remove this comment to see the full error message
            <input id="chatterbox-temperature" type="range" min="0" max="1" step="0.1" value="${this.settings.temperature}" />
        </div>`;

        // Exaggeration
        html += `<div class="chatterbox-setting-row">
            // @ts-expect-error TS(2339): Property 'exaggeration' does not exist on type '{}... Remove this comment to see the full error message
            <label for="chatterbox-exaggeration">Exaggeration: <span id="chatterbox-exaggeration-value">${this.settings.exaggeration}</span></label>
            // @ts-expect-error TS(2339): Property 'exaggeration' does not exist on type '{}... Remove this comment to see the full error message
            <input id="chatterbox-exaggeration" type="range" min="0" max="2" step="0.1" value="${this.settings.exaggeration}" />
        </div>`;

        // CFG Weight
        html += `<div class="chatterbox-setting-row">
            // @ts-expect-error TS(2339): Property 'cfg_weight' does not exist on type '{}'.
            <label for="chatterbox-cfg-weight">CFG Weight: <span id="chatterbox-cfg-weight-value">${this.settings.cfg_weight}</span></label>
            // @ts-expect-error TS(2339): Property 'cfg_weight' does not exist on type '{}'.
            <input id="chatterbox-cfg-weight" type="range" min="0" max="1" step="0.1" value="${this.settings.cfg_weight}" />
        </div>`;

        // Speed Factor
        html += `<div class="chatterbox-setting-row">
            // @ts-expect-error TS(2339): Property 'speed_factor' does not exist on type '{}... Remove this comment to see the full error message
            <label for="chatterbox-speed">Speed Factor: <span id="chatterbox-speed-value">${this.settings.speed_factor}</span></label>
            // @ts-expect-error TS(2339): Property 'speed_factor' does not exist on type '{}... Remove this comment to see the full error message
            <input id="chatterbox-speed" type="range" min="0.5" max="2" step="0.1" value="${this.settings.speed_factor}" />
        </div>`;

        // Seed
        html += `<div class="chatterbox-setting-row">
            <label for="chatterbox-seed">Seed (-1 for random):</label>
            // @ts-expect-error TS(2339): Property 'seed' does not exist on type '{}'.
            <input id="chatterbox-seed" class="text_pole" type="number" min="-1" value="${this.settings.seed}" />
        </div>`;

        // Text chunking
        html += `<div class="chatterbox-setting-row">
            <label class="checkbox_label">
                // @ts-expect-error TS(2339): Property 'split_text' does not exist on type '{}'.
                <input type="checkbox" id="chatterbox-split-text" ${this.settings.split_text ? 'checked' : ''} />
                Split long texts into chunks
            </label>
        </div>`;

        // Chunk size
        // @ts-expect-error TS(2339): Property 'split_text' does not exist on type '{}'.
        html += `<div class="chatterbox-setting-row" id="chunk-size-row" ${!this.settings.split_text ? 'style="display: none;"' : ''}>
            <label for="chatterbox-chunk-size">Chunk Size:</label>
            // @ts-expect-error TS(2339): Property 'chunk_size' does not exist on type '{}'.
            <input id="chatterbox-chunk-size" class="text_pole" type="number" min="50" max="500" value="${this.settings.chunk_size}" />
        </div>`;

        // Output format
        html += `<div class="chatterbox-setting-row">
            <label for="chatterbox-format">Output Format:</label>
            <select id="chatterbox-format">
                // @ts-expect-error TS(2339): Property 'output_format' does not exist on type '{... Remove this comment to see the full error message
                <option value="wav" ${this.settings.output_format === 'wav' ? 'selected' : ''}>WAV</option>
                // @ts-expect-error TS(2339): Property 'output_format' does not exist on type '{... Remove this comment to see the full error message
                <option value="opus" ${this.settings.output_format === 'opus' ? 'selected' : ''}>Opus</option>
            </select>
        </div>`;

        html += '</div>'; // End params section

        // Footer with links
        html += `<div class="chatterbox-footer">
            // @ts-expect-error TS(2339): Property 'provider_endpoint' does not exist on typ... Remove this comment to see the full error message
            <a href="${this.settings.provider_endpoint}" target="_blank">Chatterbox Web UI</a> |
            <a href="https://github.com/devnen/Chatterbox-TTS-Server" target="_blank">Documentation</a>
        </div>`;

        html += '</div>'; // End container

        // Add CSS styles
        html += `<style>
            .chatterbox-settings-container {
                padding: 10px;
            }
            .chatterbox-settings-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 15px;
            }
            .chatterbox-settings-header h3 {
                margin: 0;
            }
            .chatterbox-settings-container .status-indicator {
                font-weight: bold;
            }
            #chatterbox-status.ready { color: #4CAF50; }
            #chatterbox-status.offline { color: #f44336; }
            #chatterbox-status.processing { color: #2196F3; }
            .chatterbox-setting-row {
                margin-bottom: 10px;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .chatterbox-setting-row label {
                flex: 0 0 150px;
            }
            .chatterbox-setting-row label.checkbox_label {
                flex-basis: auto;
            }
            .chatterbox-setting-row input[type="text"],
            .chatterbox-setting-row input[type="number"],
            .chatterbox-setting-row select {
                flex: 1;
            }
            .chatterbox-setting-row input[type="range"] {
                flex: 1;
            }
            .chatterbox-params-section {
                margin-top: 15px;
                padding-top: 15px;
                border-top: 1px solid #ccc;
            }
            .chatterbox-params-section h4 {
                margin-top: 0;
                margin-bottom: 10px;
            }
            .chatterbox-footer {
                margin-top: 15px;
                padding-top: 15px;
                border-top: 1px solid #ccc;
                text-align: center;
                font-size: 0.9em;
            }
        </style>`;

        return html;
    }

    //######################//
    // Startup & Initialize //
    //######################//

    async loadSettings(settings: any) {
        this.updateStatus('Offline');

        if (Object.keys(settings).length === 0) {
            console.info('Using default Chatterbox TTS Provider settings');
        } else {
            // Populate settings with provided values
            for (const key in settings) {
                if (key in this.settings) {
                    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
                    this.settings[key] = settings[key];
                }
            }
        }

        // Update UI elements
        this.updateUIFromSettings();

        console.debug('ChatterboxTTS: Settings loaded');

        try {
            // Check if TTS provider is ready
            await this.checkReady();

            if (this.ready) {
                // Fetch all voice types for the voice map
                await this.fetchTtsVoiceObjects();
                this.updateStatus('Ready');
            }

            this.setupEventListeners();
        } catch (error) {
            console.error('Error loading Chatterbox settings:', error);
            this.updateStatus('Offline');
        }
    }

    updateUIFromSettings() {
        // @ts-expect-error TS(2339): Property 'provider_endpoint' does not exist on typ... Remove this comment to see the full error message
        $('#chatterbox-endpoint').val(this.settings.provider_endpoint);
        // @ts-expect-error TS(2339): Property 'language' does not exist on type '{}'.
        $('#chatterbox-language').val(this.settings.language);
        // @ts-expect-error TS(2339): Property 'temperature' does not exist on type '{}'... Remove this comment to see the full error message
        $('#chatterbox-temperature').val(this.settings.temperature);
        // @ts-expect-error TS(2339): Property 'temperature' does not exist on type '{}'... Remove this comment to see the full error message
        $('#chatterbox-temperature-value').text(this.settings.temperature);
        // @ts-expect-error TS(2339): Property 'exaggeration' does not exist on type '{}... Remove this comment to see the full error message
        $('#chatterbox-exaggeration').val(this.settings.exaggeration);
        // @ts-expect-error TS(2339): Property 'exaggeration' does not exist on type '{}... Remove this comment to see the full error message
        $('#chatterbox-exaggeration-value').text(this.settings.exaggeration);
        // @ts-expect-error TS(2339): Property 'cfg_weight' does not exist on type '{}'.
        $('#chatterbox-cfg-weight').val(this.settings.cfg_weight);
        // @ts-expect-error TS(2339): Property 'cfg_weight' does not exist on type '{}'.
        $('#chatterbox-cfg-weight-value').text(this.settings.cfg_weight);
        // @ts-expect-error TS(2339): Property 'speed_factor' does not exist on type '{}... Remove this comment to see the full error message
        $('#chatterbox-speed').val(this.settings.speed_factor);
        // @ts-expect-error TS(2339): Property 'speed_factor' does not exist on type '{}... Remove this comment to see the full error message
        $('#chatterbox-speed-value').text(this.settings.speed_factor);
        // @ts-expect-error TS(2339): Property 'seed' does not exist on type '{}'.
        $('#chatterbox-seed').val(this.settings.seed);
        // @ts-expect-error TS(2339): Property 'split_text' does not exist on type '{}'.
        $('#chatterbox-split-text').prop('checked', this.settings.split_text);
        // @ts-expect-error TS(2339): Property 'chunk_size' does not exist on type '{}'.
        $('#chatterbox-chunk-size').val(this.settings.chunk_size);
        // @ts-expect-error TS(2339): Property 'output_format' does not exist on type '{... Remove this comment to see the full error message
        $('#chatterbox-format').val(this.settings.output_format);

        // Show/hide chunk size based on split text
        // @ts-expect-error TS(2339): Property 'split_text' does not exist on type '{}'.
        if (this.settings.split_text) {
            $('#chunk-size-row').show();
        } else {
            $('#chunk-size-row').hide();
        }
    }

    //##############################//
    // Check Server is Available    //
    //##############################//

    async checkReady() {
        try {
            // @ts-expect-error TS(2339): Property 'provider_endpoint' does not exist on typ... Remove this comment to see the full error message
            const response = await fetch(`${this.settings.provider_endpoint}/api/ui/initial-data`);

            if (!response.ok) {
                throw new Error(`HTTP Error Response: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            // Check if we got valid data
            if (data) {
                this.ready = true;
                console.log('Chatterbox TTS service is ready.');
            } else {
                this.ready = false;
                console.log('Chatterbox TTS service returned invalid data.');
            }
        } catch (error) {
            console.error('Error checking Chatterbox TTS service readiness:', error);
            this.ready = false;
        }
    }

    //######################//
    // Get Available Voices //
    //######################//

    async fetchTtsVoiceObjects() {
        try {
            // Always fetch predefined voices
            // @ts-expect-error TS(2339): Property 'provider_endpoint' does not exist on typ... Remove this comment to see the full error message
            const predefinedResponse = await fetch(`${this.settings.provider_endpoint}/get_predefined_voices`);
            if (!predefinedResponse.ok) {
                throw new Error(`HTTP ${predefinedResponse.status}: ${predefinedResponse.statusText}`);
            }

            const predefinedData = await predefinedResponse.json();

            // Transform predefined voices
            const predefinedVoices = predefinedData.map((voice: any) => ({
                name: voice.display_name,
                voice_id: voice.voice_id || voice.filename,
                preview_url: null,
                lang: voice.language || 'en'
            }));

            // Always try to fetch reference voices
            let referenceVoices = [];
            try {
                // @ts-expect-error TS(2339): Property 'provider_endpoint' does not exist on typ... Remove this comment to see the full error message
                const refResponse = await fetch(`${this.settings.provider_endpoint}/get_reference_files`);
                if (refResponse.ok) {
                    const refData = await refResponse.json();
                    referenceVoices = refData.map((filename: any) => ({
                        name: `[Clone] ${filename}`,
                        voice_id: `ref_${filename}`,
                        preview_url: null,
                        lang: 'en'
                    }));
                }
            } catch (error) {
                console.warn('Failed to fetch reference voices:', error);
            }

            // Combine all voices
            // @ts-expect-error TS(2322): Type 'any[]' is not assignable to type 'never[]'.
            this.voices = [...predefinedVoices, ...referenceVoices];

            console.log(`Loaded ${this.voices.length} voices (${predefinedVoices.length} predefined, ${referenceVoices.length} reference)`);
            return this.voices;
        } catch (error) {
            console.error('Error fetching Chatterbox voices:', error);
            this.voices = [];
            return [];
        }
    }

    // Alias for internal use
    async fetchVoices() {
        return this.fetchTtsVoiceObjects();
    }

    //###########################//
    // Setup Event Listeners     //
    //###########################//

    setupEventListeners() {
        // Server endpoint change
        $('#chatterbox-endpoint').on('input', () => {
            // @ts-expect-error TS(2339): Property 'provider_endpoint' does not exist on typ... Remove this comment to see the full error message
            this.settings.provider_endpoint = $('#chatterbox-endpoint').val();
            this.onSettingsChange();
        });

        // Language
        $('#chatterbox-language').on('change', (e: any) => {
            // @ts-expect-error TS(2339): Property 'language' does not exist on type '{}'.
            this.settings.language = e.target.value;
            this.onSettingsChange();
        });

        // Parameter sliders
        $('#chatterbox-temperature').on('input', (e: any) => {
            // @ts-expect-error TS(2339): Property 'temperature' does not exist on type '{}'... Remove this comment to see the full error message
            this.settings.temperature = parseFloat(e.target.value);
            // @ts-expect-error TS(2339): Property 'temperature' does not exist on type '{}'... Remove this comment to see the full error message
            $('#chatterbox-temperature-value').text(this.settings.temperature);
            this.onSettingsChange();
        });

        $('#chatterbox-exaggeration').on('input', (e: any) => {
            // @ts-expect-error TS(2339): Property 'exaggeration' does not exist on type '{}... Remove this comment to see the full error message
            this.settings.exaggeration = parseFloat(e.target.value);
            // @ts-expect-error TS(2339): Property 'exaggeration' does not exist on type '{}... Remove this comment to see the full error message
            $('#chatterbox-exaggeration-value').text(this.settings.exaggeration);
            this.onSettingsChange();
        });

        $('#chatterbox-cfg-weight').on('input', (e: any) => {
            // @ts-expect-error TS(2339): Property 'cfg_weight' does not exist on type '{}'.
            this.settings.cfg_weight = parseFloat(e.target.value);
            // @ts-expect-error TS(2339): Property 'cfg_weight' does not exist on type '{}'.
            $('#chatterbox-cfg-weight-value').text(this.settings.cfg_weight);
            this.onSettingsChange();
        });

        $('#chatterbox-speed').on('input', (e: any) => {
            // @ts-expect-error TS(2339): Property 'speed_factor' does not exist on type '{}... Remove this comment to see the full error message
            this.settings.speed_factor = parseFloat(e.target.value);
            // @ts-expect-error TS(2339): Property 'speed_factor' does not exist on type '{}... Remove this comment to see the full error message
            $('#chatterbox-speed-value').text(this.settings.speed_factor);
            this.onSettingsChange();
        });

        // Seed
        $('#chatterbox-seed').on('change', (e: any) => {
            // @ts-expect-error TS(2339): Property 'seed' does not exist on type '{}'.
            this.settings.seed = parseInt(e.target.value);
            this.onSettingsChange();
        });

        // Text splitting
        $('#chatterbox-split-text').on('change', (e: any) => {
            // @ts-expect-error TS(2339): Property 'split_text' does not exist on type '{}'.
            this.settings.split_text = e.target.checked;
            if (e.target.checked) {
                $('#chunk-size-row').show();
            } else {
                $('#chunk-size-row').hide();
            }
            this.onSettingsChange();
        });

        $('#chatterbox-chunk-size').on('change', (e: any) => {
            // @ts-expect-error TS(2339): Property 'chunk_size' does not exist on type '{}'.
            this.settings.chunk_size = parseInt(e.target.value);
            this.onSettingsChange();
        });

        // Output format
        $('#chatterbox-format').on('change', (e: any) => {
            // @ts-expect-error TS(2339): Property 'output_format' does not exist on type '{... Remove this comment to see the full error message
            this.settings.output_format = e.target.value;
            this.onSettingsChange();
        });
    }

    //#############################//
    // Store ST interface settings //
    //#############################//

    onSettingsChange() {
        // Save the updated settings
        saveTtsProviderSettings();
    }

    //#########################//
    // Handle Reload button    //
    //#########################//

    async onRefreshClick() {
        try {
            this.updateStatus('Processing');
            await this.checkReady();

            if (this.ready) {
                await this.fetchTtsVoiceObjects();
                this.updateStatus('Ready');
            } else {
                this.updateStatus('Offline');
            }
        } catch (error) {
            console.error('Error during refresh:', error);
            this.updateStatus('Offline');
        }
    }

    //##################//
    // Preview Voice    //
    //##################//

    async previewTtsVoice(voiceId: any) {
        try {
            this.updateStatus('Processing');

            const previewText = 'Hello! This is a preview of the selected voice.';

            // Determine if this is a reference voice
            let isReferenceVoice = false;
            let actualVoiceId = voiceId;

            if (voiceId && voiceId.startsWith('ref_')) {
                isReferenceVoice = true;
                actualVoiceId = voiceId.substring(4); // Remove 'ref_' prefix
            }

            // Generate preview using the main TTS endpoint
            const requestBody = {
                text: previewText,
                voice_mode: isReferenceVoice ? 'clone' : 'predefined',
                // @ts-expect-error TS(2339): Property 'temperature' does not exist on type '{}'... Remove this comment to see the full error message
                temperature: this.settings.temperature,
                // @ts-expect-error TS(2339): Property 'exaggeration' does not exist on type '{}... Remove this comment to see the full error message
                exaggeration: this.settings.exaggeration,
                // @ts-expect-error TS(2339): Property 'cfg_weight' does not exist on type '{}'.
                cfg_weight: this.settings.cfg_weight,
                // @ts-expect-error TS(2339): Property 'seed' does not exist on type '{}'.
                seed: this.settings.seed >= 0 ? this.settings.seed : Math.floor(Math.random() * 2147483648), // Use random seed if -1
                // @ts-expect-error TS(2339): Property 'speed_factor' does not exist on type '{}... Remove this comment to see the full error message
                speed_factor: this.settings.speed_factor,
                // @ts-expect-error TS(2339): Property 'language' does not exist on type '{}'.
                language: this.settings.language,
                split_text: false, // Don't split for preview
                // @ts-expect-error TS(2339): Property 'output_format' does not exist on type '{... Remove this comment to see the full error message
                output_format: this.settings.output_format,
            };

            // Add voice-specific parameters
            if (isReferenceVoice) {
                // @ts-expect-error TS(2339): Property 'reference_audio_filename' does not exist... Remove this comment to see the full error message
                requestBody.reference_audio_filename = actualVoiceId;
            } else {
                // @ts-expect-error TS(2339): Property 'predefined_voice_id' does not exist on t... Remove this comment to see the full error message
                requestBody.predefined_voice_id = actualVoiceId;
            }

            // @ts-expect-error TS(2339): Property 'provider_endpoint' does not exist on typ... Remove this comment to see the full error message
            const response = await fetch(`${this.settings.provider_endpoint}/tts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            // Get the audio blob and play it
            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);

            const audio = new Audio(audioUrl);
            audio.addEventListener('ended', () => {
                URL.revokeObjectURL(audioUrl);
                this.updateStatus('Ready');
            });

            await audio.play();
        } catch (error) {
            console.error('Error previewing voice:', error);
            this.updateStatus('Ready');
            throw error;
        }
    }

    //#####################//
    // Get Voice Object    //
    //#####################//

    async getVoice(voiceName: any) {
        // Ensure voices are loaded
        if (this.voices.length === 0) {
            await this.fetchTtsVoiceObjects();
        }

        // Find the voice object by name or voice_id
        let match = this.voices.find(voice =>
            // @ts-expect-error TS(2339): Property 'name' does not exist on type 'never'.
            voice.name === voiceName ||
            // @ts-expect-error TS(2339): Property 'voice_id' does not exist on type 'never'... Remove this comment to see the full error message
            voice.voice_id === voiceName ||
            // @ts-expect-error TS(2339): Property 'display_name' does not exist on type 'ne... Remove this comment to see the full error message
            voice.display_name === voiceName,
        );

        if (!match) {
            console.warn(`Voice not found: ${voiceName}`);
            // Check if it's a reference voice that wasn't in the list
            if (voiceName && voiceName.startsWith('ref_')) {
                const filename = voiceName.substring(4);
                return {
                    name: `[Clone] ${filename}`,
                    voice_id: voiceName,
                    preview_url: null,
                    lang: 'en',
                };
            }
            // Return a default voice object
            return {
                name: voiceName || 'Default',
                // @ts-expect-error TS(2339): Property 'predefined_voice' does not exist on type... Remove this comment to see the full error message
                voice_id: voiceName || this.settings.predefined_voice || 'S1',
                preview_url: null,
                lang: 'en',
            };
        }

        return match;
    }

    //##################//
    // Generate TTS     //
    //##################//

    async generateTts(inputText: any, voiceId: any) {
        try {
            this.updateStatus('Processing');

            // Determine if this is a reference voice
            let isReferenceVoice = false;
            let actualVoiceId = voiceId;

            if (voiceId && voiceId.startsWith('ref_')) {
                isReferenceVoice = true;
                actualVoiceId = voiceId.substring(4); // Remove 'ref_' prefix
            }

            // Prepare the request body
            const requestBody = {
                text: inputText,
                voice_mode: isReferenceVoice ? 'clone' : 'predefined',
                // @ts-expect-error TS(2339): Property 'temperature' does not exist on type '{}'... Remove this comment to see the full error message
                temperature: this.settings.temperature,
                // @ts-expect-error TS(2339): Property 'exaggeration' does not exist on type '{}... Remove this comment to see the full error message
                exaggeration: this.settings.exaggeration,
                // @ts-expect-error TS(2339): Property 'cfg_weight' does not exist on type '{}'.
                cfg_weight: this.settings.cfg_weight,
                // @ts-expect-error TS(2339): Property 'seed' does not exist on type '{}'.
                seed: this.settings.seed >= 0 ? this.settings.seed : Math.floor(Math.random() * 2147483648), // Use random seed if -1
                // @ts-expect-error TS(2339): Property 'speed_factor' does not exist on type '{}... Remove this comment to see the full error message
                speed_factor: this.settings.speed_factor,
                // @ts-expect-error TS(2339): Property 'language' does not exist on type '{}'.
                language: this.settings.language,
                // @ts-expect-error TS(2339): Property 'split_text' does not exist on type '{}'.
                split_text: this.settings.split_text,
                // @ts-expect-error TS(2339): Property 'chunk_size' does not exist on type '{}'.
                chunk_size: this.settings.chunk_size,
                // @ts-expect-error TS(2339): Property 'output_format' does not exist on type '{... Remove this comment to see the full error message
                output_format: this.settings.output_format,
            };

            // Add voice-specific parameters
            if (isReferenceVoice) {
                // @ts-expect-error TS(2339): Property 'reference_audio_filename' does not exist... Remove this comment to see the full error message
                requestBody.reference_audio_filename = actualVoiceId;
            } else {
                // @ts-expect-error TS(2339): Property 'predefined_voice_id' does not exist on t... Remove this comment to see the full error message
                requestBody.predefined_voice_id = actualVoiceId || this.settings.predefined_voice;
            }

            console.log('Generating TTS with params:', requestBody);

            // @ts-expect-error TS(2339): Property 'provider_endpoint' does not exist on typ... Remove this comment to see the full error message
            const response = await fetch(`${this.settings.provider_endpoint}/tts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache',
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('TTS generation error:', errorText);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            this.updateStatus('Ready');

            // Return the response directly - SillyTavern expects a Response object
            return response;
        } catch (error) {
            console.error('Error in generateTts:', error);
            this.updateStatus('Ready');
            throw error;
        }
    }

    //######################//
    // Update Status        //
    //######################//

    updateStatus(status: any) {
        const statusElement = document.getElementById('chatterbox-status');
        if (statusElement) {
            statusElement.textContent = status;
            statusElement.className = status.toLowerCase();
        }
    }
}
