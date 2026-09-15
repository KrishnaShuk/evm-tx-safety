import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "EVM TX Safety — Transaction Analyzer",
    description:
        "Decode, simulate, and safety-check Ethereum transactions before sending them.",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
