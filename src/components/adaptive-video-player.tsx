/**
 * Adaptive Video Player Component
 * Demonstrates integration with VideoStreamingEngine
 * Shows buffering, quality, and bandwidth information
 */

'use client';

import React, { useRef, useEffect, useState } from 'react';
import { useVideoStreaming } from '@/hooks/use-video-streaming';
import { Play, Pause, Volume2, Settings } from 'lucide-react';

interface AdaptiveVideoPlayerProps {
    videoUrl: string;
    videoDuration: number;
    title?: string;
    showMetrics?: boolean;
}

export function AdaptiveVideoPlayer({
    videoUrl,
    videoDuration,
    title = 'Video Player',
    showMetrics = true,
}: AdaptiveVideoPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const { state, play, pause, togglePlayPause, seek } = useVideoStreaming({
        videoUrl,
        videoDuration,
        chunkDuration: 3,
        autoInitialize: true,
    });

    const [showSettings, setShowSettings] = useState(false);

    /**
     * Format time in MM:SS
     */
    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    /**
     * Handle progress bar click
     */
    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        const newTime = percent * state.duration;
        seek(newTime);
    };

    return (
        <div className="w-full bg-black rounded-lg overflow-hidden shadow-xl">
            {/* Video Container */}
            <div className="relative bg-black aspect-video flex items-center justify-center">
                {/* Placeholder for video element */}
                <div className="absolute inset-0 bg-gradient-to-b from-slate-800 to-slate-900 flex items-center justify-center">
                    <div className="text-center">
                        <div className="text-white text-sm font-medium mb-2">
                            {title}
                        </div>
                        <div className="text-slate-400 text-xs">
                            Video Streaming Player
                        </div>
                    </div>
                </div>

                {/* Buffering Indicator */}
                {state.isBuffering && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
                        <div className="flex flex-col items-center gap-2">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                            <span className="text-white text-sm">Buffering...</span>
                        </div>
                    </div>
                )}

                {/* Metrics Overlay */}
                {showMetrics && (
                    <div className="absolute top-2 right-2 bg-black/70 backdrop-blur text-white text-xs rounded p-2 max-w-xs z-20">
                        <div className="space-y-1">
                            <div>
                                <span className="text-slate-400">Quality:</span>{' '}
                                <span className="font-bold">{state.quality}</span>
                            </div>
                            <div>
                                <span className="text-slate-400">Buffer:</span>{' '}
                                <span
                                    className={`font-bold ${
                                        state.bufferHealth === 'critical'
                                            ? 'text-red-400'
                                            : state.bufferHealth === 'low'
                                              ? 'text-yellow-400'
                                              : state.bufferHealth === 'good'
                                                ? 'text-green-400'
                                                : 'text-blue-400'
                                    }`}
                                >
                                    {state.bufferHealth}
                                </span>{' '}
                                ({state.bufferedSeconds.toFixed(1)}s)
                            </div>
                            <div>
                                <span className="text-slate-400">Bandwidth:</span>{' '}
                                <span className="font-bold">{state.bandwidth} Kbps</span>
                            </div>
                            <div>
                                <span className="text-slate-400">Status:</span>{' '}
                                <span className="font-bold">
                                    {state.isInitialized ? '✓ Ready' : '⟳ Loading...'}
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Progress Bar */}
            <div className="bg-slate-900 px-4 py-2">
                <div
                    onClick={handleSeek}
                    className="relative h-1 bg-slate-700 rounded-full cursor-pointer group hover:h-2 transition-all"
                >
                    {/* Buffered portion */}
                    <div
                        className="absolute h-full bg-slate-500 rounded-full transition-all duration-200"
                        style={{
                            width: `${(state.bufferedSeconds / state.duration) * 100}%`,
                        }}
                    ></div>

                    {/* Played portion */}
                    <div
                        className="absolute h-full bg-blue-500 rounded-full transition-all duration-200"
                        style={{
                            width: `${(state.currentTime / state.duration) * 100}%`,
                        }}
                    ></div>

                    {/* Progress indicator */}
                    <div
                        className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{
                            left: `${(state.currentTime / state.duration) * 100}%`,
                            marginLeft: '-6px',
                        }}
                    ></div>
                </div>

                {/* Time display */}
                <div className="flex justify-between items-center mt-2 text-xs text-slate-400">
                    <span>{formatTime(state.currentTime)}</span>
                    <span>{formatTime(state.duration)}</span>
                </div>
            </div>

            {/* Controls */}
            <div className="bg-slate-900 px-4 py-3 flex items-center gap-3">
                {/* Play/Pause Button */}
                <button
                    onClick={togglePlayPause}
                    disabled={!state.isInitialized}
                    className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white transition-colors cursor-pointer active:scale-95"
                    title={state.isPlaying ? 'Pause' : 'Play'}
                >
                    {state.isPlaying ? (
                        <Pause size={20} className="fill-current" />
                    ) : (
                        <Play size={20} className="fill-current" />
                    )}
                </button>

                {/* Volume Control */}
                <button
                    className="p-2 rounded-lg hover:bg-slate-700 text-white transition-colors cursor-pointer active:scale-95"
                    title="Mute"
                >
                    <Volume2 size={20} />
                </button>

                {/* Spacer */}
                <div className="flex-1"></div>

                {/* Settings Button */}
                <button
                    onClick={() => setShowSettings(!showSettings)}
                    className="p-2 rounded-lg hover:bg-slate-700 text-white transition-colors cursor-pointer active:scale-95"
                    title="Settings"
                >
                    <Settings size={20} />
                </button>

                {/* Status Indicator */}
                <div className="text-xs text-slate-400 flex items-center gap-2">
                    {state.isBuffering && (
                        <>
                            <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></div>
                            <span>Buffering</span>
                        </>
                    )}
                    {!state.isBuffering && state.isInitialized && (
                        <>
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            <span>Live</span>
                        </>
                    )}
                </div>
            </div>

            {/* Settings Panel */}
            {showSettings && (
                <div className="bg-slate-800 px-4 py-3 border-t border-slate-700">
                    <div className="text-sm text-white space-y-3">
                        <div>
                            <h4 className="font-bold mb-2 text-slate-300">
                                Streaming Information
                            </h4>
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div>
                                    <span className="text-slate-400">Current Quality:</span>
                                    <p className="text-white font-bold mt-1">
                                        {state.quality}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-slate-400">Bandwidth:</span>
                                    <p className="text-white font-bold mt-1">
                                        {state.bandwidth} Kbps
                                    </p>
                                </div>
                                <div>
                                    <span className="text-slate-400">Buffer Health:</span>
                                    <p
                                        className={`font-bold mt-1 ${
                                            state.bufferHealth === 'critical'
                                                ? 'text-red-400'
                                                : state.bufferHealth === 'low'
                                                  ? 'text-yellow-400'
                                                  : state.bufferHealth === 'good'
                                                    ? 'text-green-400'
                                                    : 'text-blue-400'
                                        }`}
                                    >
                                        {state.bufferHealth}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-slate-400">Buffered:</span>
                                    <p className="text-white font-bold mt-1">
                                        {state.bufferedSeconds.toFixed(1)}s
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Error Display */}
            {state.error && (
                <div className="bg-red-900/30 border border-red-600/50 text-red-300 px-4 py-2 text-sm">
                    <span className="font-bold">Error:</span> {state.error}
                </div>
            )}
        </div>
    );
}
