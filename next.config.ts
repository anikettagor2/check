import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    images: {
        unoptimized: true,
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'firebasestorage.googleapis.com',
                port: '',
                pathname: '/**',
            },
            {
                protocol: 'https',
                hostname: 'lh3.googleusercontent.com',
                port: '',
                pathname: '/**',
            },
            {
                protocol: 'https',
                hostname: 'images.unsplash.com',
                port: '',
                pathname: '/**',
            },
        ],
    },
    async headers() {
        return [
            {
                source: '/:path*.m3u8',
                headers: [
                    { key: 'Cache-Control', value: 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' },
                ],
            },
            {
                source: '/:path*.ts',
                headers: [
                    { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
                ],
            },
            {
                source: '/:path*.m4s',
                headers: [
                    { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
                ],
            },
            {
                source: '/:path*.mp4',
                headers: [
                    { key: 'Cache-Control', value: 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400' },
                ],
            },
        ];
    },
    async redirects() {
        return [
            {
                source: '/r/:id',
                destination: '/review/:id',
                permanent: false,
            },
            {
                source: '/review/:projectId/:revisionId',
                destination: '/review/:revisionId',
                permanent: false,
            },
        ];
    },
};

export default nextConfig;
