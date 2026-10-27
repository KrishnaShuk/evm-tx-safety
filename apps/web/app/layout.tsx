import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "EVM TX Safety — Analyze Before You Sign",
    description:
        "Decode, simulate, and safety-check any Ethereum transaction before broadcasting it to the network. Supports 6 EVM chains with live RPC simulation and Tenderly integration.",
    keywords: ["EVM", "Ethereum", "transaction safety", "smart contract", "simulation", "Web3"],
    openGraph: {
        title: "EVM TX Safety",
        description: "Decode, simulate, and safety-check Ethereum transactions before signing.",
        type: "website",
    },
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            </head>
            <body>{children}</body>
        </html>
    );
}
