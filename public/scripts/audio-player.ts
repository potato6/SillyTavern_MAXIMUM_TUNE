import { formatTime } from './utils.js';

export interface AudioPlayerOptions {
    title?: string;
    autoplay?: boolean;
    volume?: number;
    onPlay?: ((this: AudioPlayer) => void) | null;
    onPause?: ((this: AudioPlayer) => void) | null;
    onEnded?: ((this: AudioPlayer) => void) | null;
    onTimeUpdate?: ((this: AudioPlayer, currentTime: number, duration: number) => void) | null;
    onVolumeChange?: ((this: AudioPlayer, volume: number, muted: boolean) => void) | null;
}

export interface AudioPlayerElements {
    title: HTMLElement | null;
    playPauseBtn: HTMLElement | null;
    currentTime: HTMLElement | null;
    totalTime: HTMLElement | null;
    progress: HTMLElement | null;
    progressBar: HTMLElement | null;
    volumeBtn: HTMLElement | null;
}

export class AudioPlayer implements EventListenerObject {
    audio: HTMLAudioElement;
    container: HTMLElement;
    elements!: AudioPlayerElements;
    isDestroyed: boolean;
    isDragging: boolean;
    observer: MutationObserver | null;
    options: Required<AudioPlayerOptions>;

    private abortController: AbortController;
    private progressRect: DOMRect | null = null;
    private lastPercent: number = -1;
    private lastTimeStr: string = '';

    /**
     * Creates an audio player instance
     * @param {HTMLAudioElement} audioElement - The audio element to control
     * @param {HTMLElement} containerElement - The container element with player controls
     * @param {AudioPlayerOptions} options - Configuration options
     */
    constructor(
        audioElement: HTMLAudioElement,
        containerElement: HTMLElement,
        options: AudioPlayerOptions = {},
    ) {
        if (!(audioElement instanceof HTMLAudioElement)) {
            throw new Error('First argument must be an HTMLAudioElement');
        }
        if (!(containerElement instanceof HTMLElement)) {
            throw new Error('Second argument must be an HTMLElement');
        }

        this.audio = audioElement;
        this.container = containerElement;

        this.options = {
            title: '',
            autoplay: false,
            volume: 1.0,
            onPlay: null,
            onPause: null,
            onEnded: null,
            onTimeUpdate: null,
            onVolumeChange: null,
            ...options,
        };

        this.isDragging = false;
        this.isDestroyed = false;
        this.observer = null;
        this.abortController = new AbortController();

        this.init();
    }

    /**
     * Initializes the audio player by setting up elements, events, and initial state
     */
    init() {
        this.findElements();
        this.bindEvents();
        this.setupDOMObserver();

        if (this.options.title) {
            this.setTitle(this.options.title);
        } else if (this.audio.title) {
            this.setTitle(this.audio.title);
        } else if (this.audio.src) {
            const srcParts = this.audio.src.split('/');
            this.setTitle(decodeURIComponent(srcParts[srcParts.length - 1] ?? ''));
        }

        if (this.options.autoplay) {
            this.play();
        }

        this.setVolume(this.options.volume);
        this.updateTimeDisplays();
    }

    /**
     * Finds and caches all required DOM elements within the container
     */
    findElements() {
        this.elements = {
            title: this.container.querySelector('.audio-player-title'),
            playPauseBtn: this.container.querySelector('.audio-player-play-pause'),
            currentTime: this.container.querySelector('.audio-player-current-time'),
            totalTime: this.container.querySelector('.audio-player-total-time'),
            progress: this.container.querySelector('.audio-player-progress'),
            progressBar: this.container.querySelector('.audio-player-progress-bar'),
            volumeBtn: this.container.querySelector('.audio-player-volume'),
        };

        const required = [
            'playPauseBtn',
            'currentTime',
            'totalTime',
            'progress',
            'progressBar',
            'volumeBtn',
        ] as const;
        for (const key of required) {
            if (!this.elements[key]) {
                console.warn(
                    `AudioPlayer: Required element .audio-player-${key.replace(/([A-Z])/g, '-$1').toLowerCase()} not found`,
                );
            }
        }
    }

    /**
     * Sets up a MutationObserver to detect when audio or container elements are removed from DOM
     */
    setupDOMObserver() {
        this.observer = new MutationObserver(() => {
            // O(1) connectivity check instead of O(N) removedNodes iteration
            if (!this.audio.isConnected || !this.container.isConnected) {
                this.destroy();
            }
        });

        const chatParent = this.audio.closest('#chat') ?? document.body;
        this.observer.observe(chatParent, { childList: true, subtree: true });
    }

    /**
     * Unified event dispatcher for all bound events.
     * Prevents memory leaks and closure allocations from repeated `.bind(this)`.
     */
    handleEvent(e: Event) {
        switch (e.type) {
            case 'loadedmetadata':
                return this.onAudioLoadedMetadata();
            case 'timeupdate':
                return this.onAudioTimeUpdate();
            case 'play':
                return this.onAudioPlay();
            case 'pause':
                return this.onAudioPause();
            case 'ended':
                return this.onAudioEnded();
            case 'volumechange':
                return this.onAudioVolumeChange();
            case 'click':
                if (e.currentTarget === this.elements.playPauseBtn)
                    return this.onPlayPauseClick(e as MouseEvent);
                if (e.currentTarget === this.elements.volumeBtn)
                    return this.onVolumeClick(e as MouseEvent);
                if (e.currentTarget === this.elements.progress)
                    return this.onProgressClick(e as MouseEvent);
                break;
            case 'input':
                return this.onVolumeInput(e as Event);
            case 'mousedown':
                return this.onProgressMouseDown(e as MouseEvent);
            case 'mousemove':
                if (e.currentTarget === document) return this.onDocumentMouseMove(e as MouseEvent);
                return this.onProgressMouseMove(e as MouseEvent);
            case 'mouseup':
                return this.onDocumentMouseUp();
            case 'mouseenter':
                return this.onProgressMouseEnter();
            case 'mouseleave':
                return this.onProgressMouseLeave();
        }
    }

    /**
     * Binds all event listeners to audio and control elements utilizing AbortSignal
     */
    bindEvents() {
        const signal = this.abortController.signal;
        const options = { signal };

        this.audio.addEventListener('loadedmetadata', this, options);
        this.audio.addEventListener('timeupdate', this, options);
        this.audio.addEventListener('play', this, options);
        this.audio.addEventListener('pause', this, options);
        this.audio.addEventListener('ended', this, options);
        this.audio.addEventListener('volumechange', this, options);

        this.elements.playPauseBtn?.addEventListener('click', this, options);
        this.elements.volumeBtn?.addEventListener('click', this, options);

        if (this.elements.progress) {
            this.elements.progress.addEventListener('mousedown', this, options);
            this.elements.progress.addEventListener('click', this, options);
            this.elements.progress.addEventListener('mousemove', this, options);
            this.elements.progress.addEventListener('mouseenter', this, options);
            this.elements.progress.addEventListener('mouseleave', this, options);
        }
    }

    onAudioLoadedMetadata() {
        if (this.isDestroyed) return;
        this.updateTimeDisplays();
    }

    onAudioTimeUpdate() {
        if (this.isDestroyed || this.isDragging) return;

        const percent = (this.audio.currentTime / this.audio.duration) * 100 || 0;

        // Debounce DOM writes: only update if changed by at least 0.1%
        if (Math.abs(this.lastPercent - percent) >= 0.1) {
            if (this.elements.progressBar) {
                this.elements.progressBar.style.width = `${percent}%`;
            }
            this.lastPercent = percent;
        }

        const timeStr = formatTime(this.audio.currentTime);
        if (timeStr !== this.lastTimeStr) {
            if (this.elements.currentTime) {
                this.elements.currentTime.textContent = timeStr;
            }
            this.lastTimeStr = timeStr;
        }

        this.options.onTimeUpdate?.call(this, this.audio.currentTime, this.audio.duration);
    }

    onAudioPlay() {
        if (this.isDestroyed) return;

        if (this.elements.playPauseBtn) {
            this.elements.playPauseBtn.classList.replace('fa-play', 'fa-pause');
            this.elements.playPauseBtn.setAttribute('title', 'Pause');
        }
        this.options.onPlay?.call(this);
    }

    onAudioPause() {
        if (this.isDestroyed) return;

        if (this.elements.playPauseBtn) {
            this.elements.playPauseBtn.classList.replace('fa-pause', 'fa-play');
            this.elements.playPauseBtn.setAttribute('title', 'Play');
        }
        this.options.onPause?.call(this);
    }

    onAudioEnded() {
        if (this.isDestroyed) return;

        if (this.elements.playPauseBtn) {
            this.elements.playPauseBtn.classList.replace('fa-pause', 'fa-play');
            this.elements.playPauseBtn.setAttribute('title', 'Play');
        }
        this.options.onEnded?.call(this);
    }

    onAudioVolumeChange() {
        if (this.isDestroyed) return;
        this.updateVolumeIcon();
        this.options.onVolumeChange?.call(this, this.audio.volume, this.audio.muted);
    }

    onPlayPauseClick(e: MouseEvent) {
        e.preventDefault();
        this.togglePlay();
    }

    onVolumeClick(e: MouseEvent) {
        e.preventDefault();
        this.toggleMute();
    }

    onVolumeInput(e: Event) {
        const target = e.target as HTMLInputElement;
        if (!target) return;
        this.setVolume(parseFloat(target.value));
    }

    onProgressMouseDown(e: MouseEvent) {
        this.isDragging = true;
        this.progressRect = this.elements.progress!.getBoundingClientRect();
        this.updateProgress(e);

        // Dynamic event binding for drag - still tied to abort signal
        document.addEventListener('mousemove', this, { signal: this.abortController.signal });
        document.addEventListener('mouseup', this, { signal: this.abortController.signal });
    }

    onProgressClick(e: MouseEvent) {
        if (!this.isDragging) this.updateProgress(e);
    }

    onProgressMouseEnter() {
        if (!this.isDragging && this.elements.progress) {
            this.progressRect = this.elements.progress.getBoundingClientRect();
        }
    }

    onProgressMouseLeave() {
        if (!this.isDragging) {
            this.progressRect = null;
        }
    }

    onProgressMouseMove(e: MouseEvent) {
        if (!this.isDragging) this.updateProgressTitle(e);
    }

    onDocumentMouseMove(e: MouseEvent) {
        if (this.isDragging) this.updateProgress(e);
    }

    onDocumentMouseUp() {
        if (this.isDragging) {
            this.isDragging = false;
            this.progressRect = null;
            document.removeEventListener('mousemove', this);
            document.removeEventListener('mouseup', this);
        }
    }

    updateProgress(e: MouseEvent) {
        if (!this.elements.progress) return;

        const rect = this.progressRect || this.elements.progress.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const percent = Math.max(0, Math.min(100, (offsetX / rect.width) * 100));

        if (this.elements.progressBar) {
            this.elements.progressBar.style.width = `${percent}%`;
            this.lastPercent = percent;
        }

        const seekTime = (percent / 100) * this.audio.duration;
        if (isFinite(seekTime)) {
            this.audio.currentTime = seekTime;

            const timeStr = formatTime(seekTime);
            if (this.elements.currentTime && timeStr !== this.lastTimeStr) {
                this.elements.currentTime.textContent = timeStr;
                this.lastTimeStr = timeStr;
            }
        }
    }

    updateVolumeIcon() {
        const btn = this.elements.volumeBtn;
        if (!btn) return;

        const volume = this.audio.volume;
        btn.classList.remove('fa-volume-high', 'fa-volume-low', 'fa-volume-off', 'fa-volume-xmark');

        if (this.audio.muted || volume === 0) {
            btn.classList.add('fa-volume-xmark');
        } else if (volume < 0.5) {
            btn.classList.add('fa-volume-low');
        } else {
            btn.classList.add('fa-volume-high');
        }
    }

    updateTimeDisplays() {
        if (this.elements.currentTime) {
            this.lastTimeStr = formatTime(this.audio.currentTime || 0);
            this.elements.currentTime.textContent = this.lastTimeStr;
        }
        if (this.elements.totalTime) {
            this.elements.totalTime.textContent = formatTime(this.audio.duration || 0);
        }
    }

    updateProgressTitle(e: MouseEvent) {
        if (!this.elements.progress) return;

        const rect = this.progressRect || this.elements.progress.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const percent = Math.max(0, Math.min(100, (offsetX / rect.width) * 100));

        this.elements.progress.setAttribute(
            'title',
            formatTime((percent / 100) * this.audio.duration),
        );
    }

    play() {
        if (this.isDestroyed || !this.audio.paused) return;

        const playPromise = this.audio.play();
        if (playPromise !== undefined) {
            playPromise.catch((error) => console.error('Audio play failed:', error));
        }
    }

    pause() {
        if (!this.isDestroyed && !this.audio.paused) {
            this.audio.pause();
        }
    }

    togglePlay() {
        if (this.audio.paused) this.play();
        else this.pause();
    }

    seek(time: number) {
        if (!this.isDestroyed && isFinite(time) && time >= 0 && time <= this.audio.duration) {
            this.audio.currentTime = time;
        }
    }

    setVolume(volume: number) {
        if (this.isDestroyed) return;

        volume = Math.max(0, Math.min(1, volume));
        this.audio.volume = volume;

        if (volume > 0 && this.audio.muted) {
            this.audio.muted = false;
        }
    }

    mute() {
        if (!this.isDestroyed) this.audio.muted = true;
    }

    unmute() {
        if (!this.isDestroyed) this.audio.muted = false;
    }

    toggleMute() {
        if (!this.isDestroyed) this.audio.muted = !this.audio.muted;
    }

    setSrc(src: string) {
        if (!this.isDestroyed) this.audio.src = src;
    }

    setTitle(title: string) {
        if (this.isDestroyed) return;

        this.options.title = title;
        if (this.elements.title) {
            this.elements.title.textContent = title;
        }
    }

    /**
     * Cleans up the player by aborting event listeners and clearing references
     */
    destroy() {
        if (this.isDestroyed) return;
        this.isDestroyed = true;

        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }

        this.pause();
        this.audio.src = '';

        // Mass unbind all DOM events
        this.abortController.abort();

        // Type coercion trick to force garbage collection of references
        this.audio = null as unknown as HTMLAudioElement;
        this.container = null as unknown as HTMLElement;
        this.elements = null as unknown as AudioPlayerElements;
        this.options = null as unknown as Required<AudioPlayerOptions>;
    }
}
