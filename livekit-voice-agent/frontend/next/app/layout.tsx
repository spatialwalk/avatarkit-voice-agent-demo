import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LiveKit Agents x Spatialreal",
  description: "Voice agent demo with LiveKit and SpatialReal",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
