import type { NextConfig } from "next";

const r2Host = (() => {
  try {
    return process.env.R2_PUBLIC_URL
      ? new URL(process.env.R2_PUBLIC_URL).hostname
      : null;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  experimental: {
    proxyClientMaxBodySize: '2gb',
    serverActions: {
      // バグ報告の画像添付（最大3枚×8MB）を Server Action で受けるため、
      // 既定1MBから引き上げる。
      bodySizeLimit: "30mb",
    },
  },
  images: {
    remotePatterns: [
      ...(r2Host ? [{ protocol: "https" as const, hostname: r2Host }] : []),
    ],
  },
  async rewrites() {
    return [
      {
        source: "/uploads/:path*",
        destination: "/api/r2/uploads/:path*",
      },
    ];
  },
  async headers() {
    // X-Frame-Options は本番のみ DENY。dev ではレスポンシブ検証用に
    // 同一オリジン iframe プレビューを許可する（本番のクリックジャッキング対策は維持）。
    const frameGuard =
      process.env.NODE_ENV === "production"
        ? [{ key: "X-Frame-Options", value: "DENY" }]
        : [];
    return [
      // ⚠ /embed/* だけは frameGuard を付けない。掲載者が自社サイトへ 3D ツアーを
      // iframe で貼るための商品（DECISION_LOG D-008）であり、X-Frame-Options: DENY
      // が付くと全ての埋め込みが本番でのみ無言で壊れる（dev では再現しない）。
      // X-Frame-Options は後から緩められないヘッダなので、ここで除外するしかない。
      // headers が空配列のルートは Next.js が起動時に弾くため、本番(frameGuard
      // が非空)のときだけこのエントリを足す。
      ...(frameGuard.length
        ? [{ source: "/((?!embed/).*)", headers: frameGuard }]
        : []),
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
