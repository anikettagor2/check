/**
 * Streaming Module Exports
 * Central export point for all adaptive streaming components and utilities
 */

// Bandwidth Detection
export {
  getBandwidthDetector,
  type NetworkQualityMetrics,
  type BandwidthHistory,
} from './bandwidth-detector';

// HLS Quality Management
export {
  HLSQualityManager,
  HLSURLBuilder,
  STANDARD_QUALITIES,
  type HLSQuality,
  type HLSPlaylist,
} from './hls-quality-manager';

// Adaptive Streaming Manager
export {
  default as AdaptiveStreamingManager,
  type AdaptiveStreamingConfig,
  type StreamingAnalytics,
  type StreamingEvent,
  type StreamingEventType,
} from './adaptive-streaming-manager';

// Re-export for convenience
export { default } from './adaptive-streaming-manager';
