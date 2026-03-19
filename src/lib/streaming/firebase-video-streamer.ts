/**
 * Firebase Video Streaming Provider
 * Integrates VideoStreamingEngine with Firebase storage
 * Handles chunked retrieval with range requests
 */

import { VideoStreamingEngine, StreamingEvent, StreamingMetrics } from './video-streaming-engine';

export interface FirebaseStreamingConfig {
    videoUrl: string; // Firebase storage download URL
    videoDuration: number; // in seconds
    chunkDuration?: number; // default: 3 seconds
}

export class FirebaseVideoStreamer {
    private engine: VideoStreamingEngine | null = null;
    private videoUrl: string;
    private videoDuration: number;
    private chunkDuration: number;

    constructor(config: FirebaseStreamingConfig) {
        this.videoUrl = config.videoUrl;
        this.videoDuration = config.videoDuration;
        this.chunkDuration = config.chunkDuration || 3;
    }

    /**
     * Initialize the streaming engine
     */
    async initialize(): Promise<void> {
        if (this.engine) {
            this.engine.destroy();
        }

        this.engine = new VideoStreamingEngine({
            videoUrl: this.videoUrl,
            duration: this.videoDuration,
            chunkDuration: this.chunkDuration,
            preloadChunks: 2,
            autoStartPlayback: false,
        });

        await this.engine.initialize();
    }

    /**
     * Fetch a specific chunk with range request
     * This would be called by the engine
     */
    private async fetchChunkWithRange(
        startByte: number,
        endByte: number
    ): Promise<ArrayBuffer> {
        try {
            const response = await fetch(this.videoUrl, {
                headers: {
                    Range: `bytes=${startByte}-${endByte}`,
                },
            });

            if (!response.ok && response.status !== 206) {
                throw new Error(`HTTP ${response.status}`);
            }

            return await response.arrayBuffer();
        } catch (error) {
            console.error('[Firebase] Chunk fetch failed:', error);
            throw error;
        }
    }

    /**
     * Get total video size (required for chunking)
     */
    async getVideoSize(): Promise<number> {
        try {
            const response = await fetch(this.videoUrl, { method: 'HEAD' });
            const contentLength = response.headers.get('content-length');
            return contentLength ? parseInt(contentLength, 10) : 0;
        } catch (error) {
            console.error('[Firebase] Failed to get video size:', error);
            throw error;
        }
    }

    /**
     * Play video
     */
    play(): void {
        if (!this.engine) {
            throw new Error('Engine not initialized');
        }
        this.engine.play();
    }

    /**
     * Pause video
     */
    pause(): void {
        if (!this.engine) {
            throw new Error('Engine not initialized');
        }
        this.engine.pause();
    }

    /**
     * Seek to time
     */
    async seek(timeSeconds: number): Promise<void> {
        if (!this.engine) {
            throw new Error('Engine not initialized');
        }
        await this.engine.seek(timeSeconds);
    }

    /**
     * Get current metrics
     */
    getMetrics(): StreamingMetrics | null {
        return this.engine?.getMetrics() || null;
    }

    /**
     * Subscribe to streaming events
     */
    on(event: StreamingEvent, callback: (data: any) => void): () => void {
        if (!this.engine) {
            throw new Error('Engine not initialized');
        }
        return this.engine.on(event, callback);
    }

    /**
     * Cleanup
     */
    destroy(): void {
        if (this.engine) {
            this.engine.destroy();
            this.engine = null;
        }
    }
}
