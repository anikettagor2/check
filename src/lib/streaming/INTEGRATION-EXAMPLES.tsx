/**
 * Integration Examples - How to use the adaptive video streaming system
 * with existing video review components in the editohub project
 */

import React, { useState, useRef } from 'react';
import AdaptiveVideoPlayer, { AdaptiveVideoPlayerRef } from '@/components/streaming/adaptive-video-player';
import { QualitySelector } from '@/components/streaming/quality-selector';
import { HLSQuality } from './hls-quality-manager';

/**
 * EXAMPLE 1: Basic Integration in Video Review Component
 * Shows how to use AdaptiveVideoPlayer with quality selector and controls
 */
export function VideoReviewSection() {
    const playerRef = useRef<AdaptiveVideoPlayerRef>(null);
    const [videoUrl] = useState<string>('https://example.com/video.m3u8');
    const [currentQuality, setCurrentQuality] = useState<HLSQuality | null>(null);
    const [availableQualities, setAvailableQualities] = useState<HLSQuality[]>([]);

    return (
        <div className="space-y-4">
            {/* Video Player */}
            <AdaptiveVideoPlayer
                ref={playerRef}
                src={videoUrl}
                sourceResolution="1080p"
                onQualityChange={setCurrentQuality}
                autoQuality={true}
            />

            {/* Quality Selector */}
            <QualitySelector
                qualities={availableQualities}
                currentQuality={currentQuality}
                onQualitySelect={(quality) => playerRef.current?.setQuality(quality)}
            />

            {/* Playback Controls */}
            <div className="flex gap-2 items-center">
                <button
                    onClick={() => playerRef.current?.play()}
                    className="px-4 py-2 bg-blue-600 text-white rounded cursor-pointer active:scale-95"
                >
                    Play
                </button>

                <button
                    onClick={() => playerRef.current?.pause()}
                    className="px-4 py-2 bg-blue-600 text-white rounded cursor-pointer active:scale-95"
                >
                    Pause
                </button>

                {/* Quality Display */}
                <div className="text-sm text-gray-600">
                    Quality: {currentQuality?.name || 'Auto'}
                </div>
            </div>
        </div>
    );
}

/**
 * EXAMPLE 2: Multiple Quality Levels Demo
 * Shows how to display and manage different quality options
 */
export function QualityLevelsDemo() {
    const playerRef = useRef<AdaptiveVideoPlayerRef>(null);
    const [videoUrl] = useState<string>('https://example.com/video.m3u8');
    const [currentQuality, setCurrentQuality] = useState<HLSQuality | null>(null);
    const [availableQualities] = useState<HLSQuality[]>([
        { name: '360p', level: 0, height: 360, width: 640, bandwidth: 500, bitrate: 500, codec: 'avc1.42001e', frameRate: 30 },
        { name: '720p', level: 1, height: 720, width: 1280, bandwidth: 2500, bitrate: 2500, codec: 'avc1.42001f', frameRate: 30 },
        { name: '1080p', level: 2, height: 1080, width: 1920, bandwidth: 5000, bitrate: 5000, codec: 'avc1.640028', frameRate: 30 },
    ]);

    return (
        <div className="space-y-4 p-4">
            <div className="aspect-video rounded-lg overflow-hidden bg-black">
                <AdaptiveVideoPlayer
                    ref={playerRef}
                    src={videoUrl}
                    sourceResolution="1080p"
                    onQualityChange={setCurrentQuality}
                    autoQuality={false}
                />
            </div>

            <QualitySelector
                qualities={availableQualities}
                currentQuality={currentQuality}
                onQualitySelect={(quality) => playerRef.current?.setQuality(quality)}
            />

            <div className="text-sm text-gray-600">
                Currently playing: {currentQuality?.name || 'Loading...'}
            </div>
        </div>
    );
}

/**
 * EXAMPLE 3: Auto Quality Switching
 * Demonstrates automatic quality adjustment based on bandwidth
 */
export function AutoQualityDemo() {
    const playerRef = useRef<AdaptiveVideoPlayerRef>(null);
    const [videoUrl] = useState<string>('https://example.com/video.m3u8');
    const [currentQuality, setCurrentQuality] = useState<HLSQuality | null>(null);

    return (
        <div className="space-y-4 p-4">
            <div className="aspect-video rounded-lg overflow-hidden bg-black">
                <AdaptiveVideoPlayer
                    ref={playerRef}
                    src={videoUrl}
                    sourceResolution="1080p"
                    onQualityChange={setCurrentQuality}
                    autoQuality={true}  // Enable automatic quality switching
                />
            </div>

            <div className="bg-green-50 p-4 rounded">
                <p className="text-green-900">
                    Quality automatically adjusts based on your network speed.
                </p>
                <p className="text-sm text-green-700 mt-2">
                    Current: {currentQuality?.name || 'Detecting...'}
                </p>
            </div>
        </div>
    );
}

/**
 * EXPORT: Complete Integration Guide
 */

export const StreamingIntegrationGuide = {
    // 1. Basic setup: Use AdaptiveVideoPlayer component
    basicSetup: 'Use <AdaptiveVideoPlayer /> in JSX',

    // 2. Quality management
    qualityManagement: 'Use QualitySelector component with onQualitySelect callback',

    // 3. Auto quality switching
    autoQuality: 'Set autoQuality={true} on AdaptiveVideoPlayer component',

    // 4. Performance tuning parameters
    tuningParameters: {
        autoQuality: 'Enable adaptive bitrate switching',
        sourceResolution: 'Set to native resolution (e.g., 1080p)',
        onQualityChange: 'Callback fired when quality switches',
        onNetworkStateChange: 'Callback fired when network conditions change',
    },

    // 5. Monitoring metrics
    metricsToMonitor: [
        'currentQuality (selected by user or auto-selected)',
        'networkQuality (poor/fair/good/excellent)',
        'availableQualities (list of bitrates)',
        'isInitialized (player ready state)',
    ],
};

export default VideoReviewSection;
