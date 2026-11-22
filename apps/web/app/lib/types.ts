export type InputMode = "hash" | "hex" | "fields";

export interface TxFields {
    to: string;
    from: string;
    data: string;
    value: string;
    gasLimit: string;
}
