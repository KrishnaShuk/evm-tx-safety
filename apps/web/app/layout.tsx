import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const mono = IBM_Plex_Mono({
    subsets: ["latin"],
    weight: ["400", "500", "600"],
    display: "swap",
    variable: "--font-mono",
});

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
        <html lang="en" className={mono.variable} suppressHydrationWarning>
            <body>{children}</body>
        </html>
    );
}
