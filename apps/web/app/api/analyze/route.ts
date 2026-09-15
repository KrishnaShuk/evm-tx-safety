import { NextRequest, NextResponse } from "next/server";
import { analyzeTx } from "@evm-safety/core";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { tx, rpcUrl, tenderlyKey, chainId } = body;

        if (!tx || !rpcUrl) {
            return NextResponse.json(
                { error: "tx and rpcUrl are required" },
                { status: 400 }
            );
        }

        const result = await analyzeTx({ tx, rpcUrl, tenderlyKey, chainId });
        return NextResponse.json(result);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
