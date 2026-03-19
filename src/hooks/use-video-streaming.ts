/**
 * React Hook for Video Streaming
 * Simplifies integration of adaptive video streaming in React components
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { FirebaseVideoStreamer } from '@/lib/streaming/firebase-video-streamer';
import { VideoStreamingEngine, StreamingEvent, StreamingMetrics } from '@/lib/streaming/video-streaming-engine';

export interface UseVideoStreamingOptions {
    videoUrl: string;
    videoDuration: number;
    chunkDuration?: number;
    autoInitialize?: boolean;
}

export interface StreamingState {
    isInitialized: boolean;
    isPlaying: boolean;
    isBuffering: boolean;
    currentTime: number;
    duration: number;
    bufferedSeconds: number;
    bufferHealth: 'critical' | 'low' | 'normal' | 'good';
    quality: string;
    bandwidth: number;
    error: string | null;
}

export function useVideoStreaming(options: UseVideoStreamingOptions) {
    const streamerRef = useRef<FirebaseVideoStreamer | null>(null);
    const [state, setState] = useState<StreamingState>({
        isInitialized: false,
        isPlaying: false,
        isBuffering: false,
        currentTime: 0,
        duration: options.videoDuration,
        bufferedSeconds: 0,
        bufferHealth: 'normal',
        quality: '480p',
        bandwidth: 0,
        error: null,
    });

    /**
     * Initialize streaming engine
     */
    const initialize = useCallback(async () => {
        try {
            if (streamerRef.current) {
                streamerRef.current.destroy();
            }

            const streamer = new FirebaseVideoStreamer({
                videoUrl: options.videoUrl,
                videoDuration: options.videoDuration,
                chunkDuration: options.chunkDuration,
            });

            await streamer.initialize();
            streamerRef.current = streamer;

            // Setup event listeners
            setupEventListeners(streamer);

            setState((prev) => ({
                ...prev,
                isInitialized: true,
                error: null,
            }));
        } catch (error) {
            console.error('Failed to initialize streaming:', error);
            setState((prev) => ({
                ...prev,
                error: String(error),
            }));
        }
    }, [options.videoUrl, options.videoDuration, options.chunkDuration]);

    /**
     * Setup event listeners
     */
    const setupEventListeners = useCallback((streamer: FirebaseVideoStreamer) => {
        // Buffering events
        streamer.on(StreamingEvent.BUFFERING_START, () => {
            setState((prev) => ({ ...prev, isBuffering: true }));
        });

        streamer.on(StreamingEvent.BUFFERING_END, () => {
            setState((prev) => ({ ...prev, isBuffering: false }));
        });

        // Quality change events
        streamer.on(StreamingEvent.QUALITY_CHANGED, (data) => {
            setState((prev) => ({
                ...prev,
                quality: `${data.to === 'low' ? '360p' : data.to === 'medium' ? '480p' : '720p'}`,
            }));
        });

        // Update metrics periodically
        const metricsInterval = setInterval(() => {
            const metrics = streamer.getMetrics();
            if (metrics) {
                setState((prev) => ({
                    ...prev,
                    currentTime: metrics.playback.currentTime,
                    bufferedSeconds: metrics.buffer.bufferedSeconds,
                    bufferHealth: metrics.buffer.bufferHealth,
                    bandwidth: metrics.bandwidth.estimatedKbps,
                }));
            }
        }, 500);

        return () => clearInterval(metricsInterval);
    }, []);

    /**
     * Auto-initialize on mount
     */
    useEffect(() => {
        if (options.autoInitialize !== false) {
            initialize();
        }

        return () => {
            if (streamerRef.current) {
                streamerRef.current.destroy();
            }
        };
    }, [options.autoInitialize, initialize]);

    /**
     * Play video
     */
    const play = useCallback(() => {
        if (streamerRef.current) {
            streamerRef.current.play();
            setState((prev) => ({ ...prev, isPlaying: true }));
        }
    }, []);

    /**
     * Pause video
     */
    const pause = useCallback(() => {
        if (streamerRef.current) {
            streamerRef.current.pause();
            setState((prev) => ({ ...prev, isPlaying: false }));
        }
    }, []);

    /**
     * Toggle play/pause
     */
    const togglePlayPause = useCallback(() => {
        if (state.isPlaying) {
            pause();
        } else {
            play();
        }
    }, [state.isPlaying, play, pause]);

    /**
     * Seek to time
     */
    const seek = useCallback(async (timeSeconds: number) => {
        if (streamerRef.current) {
            await streamerRef.current.seek(timeSeconds);
            setState((prev) => ({ ...prev, currentTime: timeSeconds }));
        }
    }, []);

    return {
        // State
        state,

        // Controls
        play,
        pause,
        togglePlayPause,
        seek,
        initialize,

        // Raw streamer for advanced usage
        streamer: streamerRef.current,
    };
}
