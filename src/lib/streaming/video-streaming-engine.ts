/**
 * Video Streaming Engine
 * Coordinates chunk-based streaming, adaptive bitrate, buffering, and prefetching
 * Provides a high-level interface for video playback
 */

import { BandwidthEstimator } from './bandwidth-estimator';
import { BufferManager, BufferState } from './buffer-manager';
import {
    AdaptiveBitrateController,
    QUALITY_LEVELS,
} from './adaptive-bitrate-controller';

export interface VideoStreamConfig {
    videoUrl: string;
    duration: number; // in seconds
    chunkDuration?: number; // seconds per chunk (default: 3)
    preloadChunks?: number; // number of chunks to preload (default: 2)
    autoStartPlayback?: boolean;
}

export interface StreamingMetrics {
    bandwidth: {
        estimatedKbps: number;
        recommended: string;
    };
    buffer: BufferState;
    quality: {
        current: string;
        bitrate: string;
    };
    playback: {
        isPlaying: boolean;
        currentTime: number;
        duration: number;
        buffering: boolean;
    };
}

export enum StreamingEvent {
    QUALITY_CHANGED = 'qualityChanged',
    BUFFERING_START = 'bufferingStart',
    BUFFERING_END = 'bufferingEnd',
    CHUNK_LOADED = 'chunkLoaded',
    ERROR = 'error',
    READY_TO_PLAY = 'readyToPlay',
    PLAYBACK_STALLED = 'playbackStalled',
}

type EventCallback = (data: any) => void;

export class VideoStreamingEngine {
    private bandwidthEstimator: BandwidthEstimator;
    private bufferManager: BufferManager;
    private abrController: AdaptiveBitrateController;

    private config: Required<VideoStreamConfig>;
    private currentChunkIndex = 0;
    private loadingChunks = new Set<number>();
    private loadedChunks = new Set<number>();
    private currentTime = 0;
    private isPlaying = false;

    // Event listeners
    private eventListeners: Map<StreamingEvent, EventCallback[]> = new Map();

    // Timers
    private bufferUpdateTimer: NodeJS.Timeout | null = null;
    private qualityCheckTimer: NodeJS.Timeout | null = null;
    private playbackSimulationTimer: NodeJS.Timeout | null = null;

    constructor(config: VideoStreamConfig) {
        this.config = {
            videoUrl: config.videoUrl,
            duration: config.duration,
            chunkDuration: config.chunkDuration || 3,
            preloadChunks: config.preloadChunks || 2,
            autoStartPlayback: config.autoStartPlayback ?? true,
        };

        this.bandwidthEstimator = new BandwidthEstimator();
        this.bufferManager = new BufferManager();
        this.abrController = new AdaptiveBitrateController();

        this.setupCallbacks();
    }

    /**
     * Setup internal callbacks
     */
    private setupCallbacks(): void {
        // Buffer state change callbacks
        this.bufferManager.onBufferingStateChange(
            () => this.emit(StreamingEvent.BUFFERING_START, { timestamp: Date.now() }),
            () => this.emit(StreamingEvent.BUFFERING_END, { timestamp: Date.now() })
        );

        // Quality change callback
        this.abrController.onQualityChangeListener((from, to) => {
            console.log(`[Stream] Quality changed: ${from} → ${to}`);
            this.emit(StreamingEvent.QUALITY_CHANGED, {
                from,
                to,
                bitrate: QUALITY_LEVELS[to as keyof typeof QUALITY_LEVELS].bitrateMbps,
                resolution:
                    QUALITY_LEVELS[to as keyof typeof QUALITY_LEVELS].resolution,
            });
        });

        // Monitor buffer and adjust quality
        this.setupQualityAdaptation();
    }

    /**
     * Initialize streaming and preload first chunks
     */
    async initialize(): Promise<void> {
        console.log('[Stream] Initializing video stream...');

        // Preload first few chunks for fast start
        await this.prefetchChunks(0, this.config.preloadChunks);

        // Start monitoring
        this.startBufferMonitoring();

        // Emit ready-to-play when first chunk is available
        if (this.loadedChunks.has(0)) {
            this.emit(StreamingEvent.READY_TO_PLAY, {
                timestamp: Date.now(),
                firstChunkReady: true,
            });
        }
    }

    /**
     * Prefetch chunks
     */
    private async prefetchChunks(
        startChunk: number,
        count: number
    ): Promise<void> {
        const totalChunks = Math.ceil(
            this.config.duration / this.config.chunkDuration
        );

        for (let i = 0; i < count; i++) {
            const chunkIndex = startChunk + i;
            if (chunkIndex >= totalChunks || this.loadedChunks.has(chunkIndex)) {
                continue;
            }

            this.loadChunk(chunkIndex);
        }
    }

    /**
     * Load a specific chunk
     * Simulates fetch with range request
     */
    private async loadChunk(chunkIndex: number): Promise<void> {
        if (this.loadingChunks.has(chunkIndex) || this.loadedChunks.has(chunkIndex)) {
            return;
        }

        this.loadingChunks.add(chunkIndex);

        try {
            const startTime = chunkIndex * this.config.chunkDuration;
            const endTime = Math.min(
                startTime + this.config.chunkDuration,
                this.config.duration
            );
            const chunkDuration = endTime - startTime;

            // Simulate range request to backend
            // In real implementation: fetch(url, { headers: { Range: 'bytes=start-end' } })
            await this.simulateChunkFetch(chunkIndex, chunkDuration);

            this.loadedChunks.add(chunkIndex);
            this.loadingChunks.delete(chunkIndex);

            this.bufferManager.addToBuffer(chunkDuration);
            this.emit(StreamingEvent.CHUNK_LOADED, {
                chunkIndex,
                duration: chunkDuration,
                totalLoaded: this.loadedChunks.size,
            });

            console.log(`[Stream] Chunk ${chunkIndex} loaded`);

            // Prefetch next chunks if needed
            if (
                this.loadedChunks.size % this.config.preloadChunks === 0 &&
                this.bufferManager.shouldPrefetch()
            ) {
                this.prefetchNextChunks();
            }
        } catch (error) {
            this.loadingChunks.delete(chunkIndex);
            console.error(`[Stream] Failed to load chunk ${chunkIndex}:`, error);
            this.emit(StreamingEvent.ERROR, {
                chunkIndex,
                error: String(error),
            });
        }
    }

    /**
     * Simulate chunk fetch with bandwidth tracking
     */
    private simulateChunkFetch(
        chunkIndex: number,
        chunkDuration: number
    ): Promise<void> {
        return new Promise(async (resolve) => {
            // Simulate network delay and bandwidth
            const quality = this.abrController.getCurrentQuality();
            const chunkSizeBytes = (quality.bitrateMbps * 1024 * 1024 * chunkDuration) / 8;

            // Simulate realistic network conditions (variable speed)
            const baseLatency = Math.random() * 200 + 100; // 100-300ms
            const networkMultiplier = Math.random() * 0.5 + 0.75; // 75-125% of expected
            const fetchTime = baseLatency + (chunkSizeBytes / 1024 / 1024 * 1000) / 5; // ~5 Mbps baseline

            setTimeout(() => {
                // Record bandwidth sample
                this.bandwidthEstimator.recordSample(
                    chunkSizeBytes,
                    fetchTime * networkMultiplier
                );
                resolve();
            }, fetchTime * networkMultiplier);
        });
    }

    /**
     * Prefetch next chunks ahead of playback
     */
    private prefetchNextChunks(): void {
        const nextChunkIndex = this.currentChunkIndex + 1;
        this.prefetchChunks(nextChunkIndex, this.config.preloadChunks);
    }

    /**
     * Play video
     */
    play(): void {
        if (this.isPlaying) return;

        console.log('[Stream] Play requested');
        this.isPlaying = true;
        this.startPlaybackSimulation();
    }

    /**
     * Pause video
     */
    pause(): void {
        if (!this.isPlaying) return;

        console.log('[Stream] Pause requested');
        this.isPlaying = false;
        if (this.playbackSimulationTimer) {
            clearInterval(this.playbackSimulationTimer);
        }
    }

    /**
     * Seek to specific time
     */
    async seek(timeSeconds: number): Promise<void> {
        console.log(`[Stream] Seeking to ${timeSeconds}s`);

        this.currentTime = timeSeconds;
        this.currentChunkIndex = Math.floor(
            timeSeconds / this.config.chunkDuration
        );

        // Clear loaded chunks and rebuffer around seek position
        this.loadedChunks.clear();
        this.loadingChunks.clear();
        this.bufferManager.reset();

        // Load chunks around seek position
        const preloadCount = Math.max(1, this.config.preloadChunks);
        await this.prefetchChunks(this.currentChunkIndex, preloadCount);
    }

    /**
     * Simulate playback progress
     */
    private startPlaybackSimulation(): void {
        if (this.playbackSimulationTimer) {
            clearInterval(this.playbackSimulationTimer);
        }

        this.playbackSimulationTimer = setInterval(() => {
            if (!this.isPlaying) return;

            // Advance playback
            this.currentTime += 0.1; // Update every 100ms
            this.bufferManager.consumeFromBuffer(0.1);

            // Check if we need to load next chunk
            if (this.shouldLoadNextChunk()) {
                this.loadChunk(this.currentChunkIndex + 1);
            }

            // Check for stalling
            const bufferState = this.bufferManager.getBufferState();
            if (bufferState.isBuffering) {
                this.emit(StreamingEvent.PLAYBACK_STALLED, {
                    currentTime: this.currentTime,
                    bufferedSeconds: bufferState.bufferedSeconds,
                });
            }

            // Reached end
            if (this.currentTime >= this.config.duration) {
                this.pause();
            }
        }, 100);
    }

    /**
     * Check if we should load the next chunk
     */
    private shouldLoadNextChunk(): boolean {
        const nextChunkIndex = this.currentChunkIndex + 1;
        return (
            !this.loadedChunks.has(nextChunkIndex) &&
            !this.loadingChunks.has(nextChunkIndex) &&
            nextChunkIndex < Math.ceil(this.config.duration / this.config.chunkDuration)
        );
    }

    /**
     * Setup adaptive bitrate monitoring
     */
    private setupQualityAdaptation(): void {
        // Monitor and adapt quality every 2 seconds
        this.qualityCheckTimer = setInterval(() => {
            const bandwidthInfo = this.bandwidthEstimator.getBandwidthInfo();
            const bufferState = this.bufferManager.getBufferState();

            // Get quality suggestion from both estimators
            const bwQuality = this.bandwidthEstimator.getRecommendedBitrate();
            const bufferQuality = this.bufferManager.getQualityRecommendation();

            // Conservative approach: pick lower of the two suggestions
            const suggested =
                this.selectConservativeQuality(bwQuality, bufferQuality);

            // Request quality change if needed
            this.abrController.requestQualityChange(suggested);

            console.log(
                `[ABR] Check: BW=${bandwidthInfo.bandwidthKbps}kbps, ` +
                `Buffer=${bufferState.bufferHealth}, Current=${this.abrController.getCurrentQuality().name}`
            );
        }, 2000);
    }

    /**
     * Select the more conservative quality
     */
    private selectConservativeQuality(
        quality1: 'low' | 'medium' | 'high',
        quality2: 'low' | 'medium' | 'high'
    ): 'low' | 'medium' | 'high' {
        const values = { low: 1, medium: 2, high: 3 };
        return values[quality1] < values[quality2] ? quality1 : quality2;
    }

    /**
     * Start monitoring buffer health
     */
    private startBufferMonitoring(): void {
        this.bufferUpdateTimer = setInterval(() => {
            const bufferState = this.bufferManager.getBufferState();
            this.bufferManager.evaluateQualityDowngrade();

            if (bufferState.bufferHealth === 'critical') {
                console.warn('[Buffer] Critical buffer level!');
            }
        }, 1000);
    }

    /**
     * Get current streaming metrics
     */
    getMetrics(): StreamingMetrics {
        const bandwidthInfo = this.bandwidthEstimator.getBandwidthInfo();
        const bufferState = this.bufferManager.getBufferState();
        const qualityInfo = this.abrController.getCurrentQuality();

        return {
            bandwidth: {
                estimatedKbps: bandwidthInfo.bandwidthKbps,
                recommended: bandwidthInfo.recommended,
            },
            buffer: bufferState,
            quality: {
                current: qualityInfo.name,
                bitrate: `${qualityInfo.bitrateMbps} Mbps`,
            },
            playback: {
                isPlaying: this.isPlaying,
                currentTime: this.currentTime,
                duration: this.config.duration,
                buffering: bufferState.isBuffering,
            },
        };
    }

    /**
     * Register event listener
     */
    on(event: StreamingEvent, callback: EventCallback): () => void {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        const listeners = this.eventListeners.get(event)!;
        listeners.push(callback);

        // Return unsubscribe function
        return () => {
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        };
    }

    /**
     * Emit event to all listeners
     */
    private emit(event: StreamingEvent, data: any): void {
        const listeners = this.eventListeners.get(event) || [];
        listeners.forEach((callback) => callback(data));
    }

    /**
     * Cleanup and destroy
     */
    destroy(): void {
        console.log('[Stream] Destroying streaming engine');

        this.pause();

        if (this.bufferUpdateTimer) {
            clearInterval(this.bufferUpdateTimer);
        }
        if (this.qualityCheckTimer) {
            clearInterval(this.qualityCheckTimer);
        }

        this.eventListeners.clear();
        this.bandwidthEstimator.reset();
        this.bufferManager.reset();
        this.abrController.reset();
    }
}
